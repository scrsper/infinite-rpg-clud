import { Color3, FreeCamera, Vector3 } from '@babylonjs/core';
import { INTERACTION_SPEC } from '../sim/physical/prediction';
import { createRenderer, attachPipeline, QUALITY, type QualityTier, type RenderContext } from './render/engine';
import { Atmosphere } from './world/atmosphere';
import { RegionManager } from './world/regionManager';
import { GameConnection, type CharacterChoice, type ClosedInfo, type GameLink } from './net/connection';
import { ReplayConnection } from './net/replay';
import type { BodyState, DialogueProjection, InteractionTarget, SnapshotMessage, Vec3 } from './net/messages';
import { LocalPredictor } from './game/predictor';
import { CameraRig } from './game/cameraRig';
import { InputManager } from './game/input';
import { PlayerController, candidatesFrom, type CombatIntent } from './game/controller';
import { DEFAULT_SETTINGS, codeLabel, loadSettings, saveSettings, type Settings } from './game/bindings';
import { describeResult, TALK_REASON, titleCase } from './game/text';
import { ActorManager } from './actors/actorManager';
import { add, h } from './ui/dom';
import { UiNav } from './ui/nav';
import { ModalHost } from './ui/modal';
import { Hud } from './ui/hud';
import { DialoguePanel } from './ui/dialoguePanel';
import { abilitiesTab, itemsTab, journalTab, type PanelServices } from './ui/menuPanels';
import { settingsTabs } from './ui/settingsPanel';
import { banner, characterScreen, deathScreen, loadingScreen, noticeScreen, titleScreen } from './ui/screens';
import './ui/theme.css';

/**
 * The browser client. It renders what the server projects and sends intentions; it never steps
 * the World. Phases: title -> connecting -> playing (menus and conversation are layers over playing).
 */
type Phase = 'title' | 'connecting' | 'playing' | 'closed';
const REMEMBER_KEY = 'torn-veil-web.character.v1';

export class App {
  ctx!: RenderContext; atmosphere!: Atmosphere; regions!: RegionManager; camera!: FreeCamera; rig!: CameraRig; actors!: ActorManager;
  link!: GameLink; predictor = new LocalPredictor(); input!: InputManager; nav!: UiNav; modal!: ModalHost; hud!: Hud; dialogue!: DialoguePanel; controller!: PlayerController;
  settings: Settings = loadSettings();
  phase: Phase = 'title';
  snapshot: SnapshotMessage | null = null;
  readonly params = new URLSearchParams(location.search);
  private ui!: HTMLElement; private modalLayer!: HTMLElement; private overlay!: HTMLElement;
  private screen: { remove(): void } | null = null; private conn: { remove(): void } | null = null; private loading: { set(t: string): void; remove(): void } | null = null;
  private focus: { target: InteractionTarget | null; refusal: string | null } = { target: null, refusal: null };
  private ownBodyId = '';
  private inTalk = false;
  private ignoreEscUntil = 0;
  private lastHudAt = 0;
  private titleOrbit = 0;
  private readonly frameMs: number[] = []; private lastFrame = performance.now();
  private readyFrames = 0;
  ready = false;
  private choice: CharacterChoice = { kind: 'auto' };
  private closedFinal = false;
  private hintsShown = new Set<string>();
  private moveTimer = 0;
  private lastSnapAt = 0;
  hintState = { moved: false, looked: false, interacted: false, attacked: false };

  static async start(): Promise<App> { const a = new App(); await a.init(); return a; }

  private async init(): Promise<void> {
    document.documentElement.dataset.motion = this.settings.reducedMotion ? 'reduced' : 'normal';
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.ui = document.getElementById('ui') as HTMLElement;
    this.applyUiSettings();
    window.addEventListener('resize', () => this.applyUiSettings());
    const q = this.params.get('quality') as QualityTier | null;
    const tier: QualityTier | undefined = q && q in QUALITY ? q : this.settings.quality !== 'auto' ? this.settings.quality : undefined;
    this.ctx = await createRenderer(canvas, { prefer: this.params.get('renderer') === 'webgl2' ? 'webgl2' : undefined, quality: tier });
    this.atmosphere = new Atmosphere(this.ctx);
    this.regions = new RegionManager(this.ctx, this.atmosphere);
    this.camera = new FreeCamera('camera', new Vector3(0, 30, 0), this.ctx.scene);
    attachPipeline(this.ctx, this.camera);
    this.rig = new CameraRig(this.camera, () => this.settings, {
      blocked: (x, y, z) => this.regions.structureAt(x + this.regions.origin.x, y + this.regions.origin.y, z + this.regions.origin.z),
      ground: (x, z) => { const g = this.regions.groundAt(x + this.regions.origin.x, z + this.regions.origin.z); return g === null ? null : g - this.regions.origin.y; },
    });
    this.actors = new ActorManager(this.ctx, this.atmosphere, this.regions);
    this.input = new InputManager(canvas, () => this.settings);
    this.nav = new UiNav(this.input);
    this.overlay = h('div', { class: 'tv-layer', style: 'pointer-events:none' }); this.modalLayer = h('div', { class: 'tv-layer', style: 'pointer-events:none' });
    this.hud = new Hud(this.ui); this.ui.append(this.overlay, this.modalLayer);
    this.modal = new ModalHost(this.modalLayer, this.nav);
    this.dialogue = new DialoguePanel(this.overlay, {
      choose: async (id, label) => { const r = await this.link.intent({ type: 'dialogue_option', optionId: id }); void label; return { result: r.result }; },
      close: () => void this.link.intent({ type: 'dialogue_close' }),
      portrait: { attach: () => () => undefined },
      keyLabel: n => String(n), toast: (t, tone) => this.hud.toast(t, tone), describe: r => describeResult(r).text,
    });
    this.link = this.params.get('replay') ? new ReplayConnection(this.params.get('replay')!) : new GameConnection();
    this.controller = new PlayerController(this.link, this.predictor, this.input, this.rig, () => this.settings, {
      canAct: () => this.phase === 'playing' && !this.modal.isOpen && !this.dialogue.isOpen && !this.own()?.dead && this.predictor.hasState,
      conversationPartner: () => (this.dialogue.isOpen ? this.speakerPos() : null),
      onCombatCommand: c => this.onCombatCommand(c), onLockChange: id => this.onLock(id),
    }, () => this.candidates(), () => this.predictor.predicted?.pos ?? null);
    this.wireLink();
    this.input.onLockChange = locked => { if (!locked && this.phase === 'playing' && !this.modal.isOpen && !this.dialogue.isOpen && !this.own()?.dead) { this.ignoreEscUntil = performance.now() + 300; this.openPause(); } };
    canvas.addEventListener('click', () => { if (this.phase === 'playing' && !this.modal.isOpen && this.input.device === 'keyboard') this.input.requestLock(); });
    (window as unknown as { __tv: unknown }).__tv = this;
    this.ctx.engine.runRenderLoop(() => this.frame());
    this.showTitle();
    if (this.params.get('autoplay') || this.params.get('replay')) this.play(this.params.get('name') ? { kind: 'new', name: this.params.get('name')!, sex: 'f' } : { kind: 'auto' });
  }

  // ── settings ─────────────────────────────────────────────────────────────────────────────────
  applyUiSettings(): void {
    const s = this.settings, h1 = window.innerHeight, base = 17 * Math.max(0.95, Math.min(1.6, h1 / 1080)) * s.uiScale * (s.textSize === 'large' ? 1.15 : 1);
    document.documentElement.style.setProperty('--root-size', `${base.toFixed(2)}px`);
    document.documentElement.dataset.contrast = s.highContrast ? 'high' : 'normal';
    document.documentElement.dataset.motion = s.reducedMotion ? 'reduced' : 'normal';
    document.getElementById('game')?.style.setProperty('filter', s.colorAssist === 'off' ? '' : `url(#tv-cb-${s.colorAssist})`);
  }
  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch }; saveSettings(this.settings); this.applyUiSettings();
    if (patch.quality) { const t = patch.quality === 'auto' ? 'balanced' : patch.quality; this.ctx.setQuality(t); this.regions.lights.setSize(this.ctx.quality.maxLights); }
    if (patch.resolutionScale !== undefined) this.ctx.engine.setHardwareScalingLevel(1 / patch.resolutionScale);
  }

  // ── screens ──────────────────────────────────────────────────────────────────────────────────
  private clearScreen(): void { this.screen?.remove(); this.screen = null; }
  private remembered(): { name: string } | null { try { const v = localStorage.getItem(REMEMBER_KEY); return v ? JSON.parse(v) : null; } catch { return null; } }
  private remember(name: string): void { try { localStorage.setItem(REMEMBER_KEY, JSON.stringify({ name })); } catch { /* storage unavailable */ } }
  private forget(): void { try { localStorage.removeItem(REMEMBER_KEY); } catch { /* storage unavailable */ } }

  showTitle(): void {
    this.clearScreen(); this.phase = 'title'; this.hud.show(false); this.input.exitLock(); this.dialogue.update(null); this.modal.close(false);
    const replay = !!this.params.get('replay');
    const t = titleScreen(this.overlay, {
      session: 'checking', serverNote: 'Checking the game server…', remembered: this.remembered(), replay,
      onPlay: () => this.play(this.remembered() ? { kind: 'auto' } : { kind: 'auto' }), onNewCharacter: () => this.showCharacter(), onSettings: () => this.openSettings('video'), onControls: () => this.openSettings('controls'),
      onShowroom: () => { this.hud.toast('The art showroom is opened with ?showroom in the address.', 'info'); }, onAbout: () => this.openAbout(), hint: () => undefined,
    });
    this.screen = t; (t.el.style as CSSStyleDeclaration).pointerEvents = 'auto';
    void this.preflight().then(r => t.setSession(r.ok ? 'ok' : 'none', r.note));
  }
  private async preflight(): Promise<{ ok: boolean; note: string }> {
    if (this.params.get('replay')) return { ok: true, note: 'Recorded session (nothing is sent to any server).' };
    try {
      const r = await fetch('/api/session', { cache: 'no-store' });
      if (!r.ok) return { ok: false, note: 'No game session. Open this from “Play Torn Veil Web” so the launcher can check your server first.' };
      const u = await fetch('/api/upstream-health', { cache: 'no-store' }).then(x => x.json()).catch(() => null) as { reachable?: boolean; health?: { state?: string; release?: string; env?: string } } | null;
      if (!u?.reachable) return { ok: false, note: 'The game server is not reachable. Nothing has been started for you; use the launcher to see its state.' };
      if (u.health?.state && u.health.state !== 'ready') return { ok: false, note: `The server is ${u.health.state}. Try again in a moment.` };
      return { ok: true, note: `Connected to ${u.health?.env ?? 'the'} world · server ${u.health?.release ?? ''}` };
    } catch { return { ok: false, note: 'Could not reach the local game gateway.' }; }
  }
  showCharacter(error?: string): void {
    this.clearScreen();
    this.screen = characterScreen(this.overlay, { error, onBack: () => this.showTitle(), onCreate: (name, sex) => this.play({ kind: 'new', name, sex }) });
  }
  private openAbout(): void {
    const hello = this.link.hello;
    this.modal.open({ title: 'About this build', render: b => add(b,
      h('p', { text: 'Torn Veil Online, browser client. It draws the same living world the Unreal client does and sends the same kinds of intentions; it never simulates the world itself.' }),
      h('dl', { class: 'tv-kv' }, h('dt', { text: 'Renderer' }), h('dd', { text: `${this.ctx.kind === 'webgpu' ? 'WebGPU' : 'WebGL 2 (reduced effects)'}${this.ctx.fallbackReason ? ` — ${this.ctx.fallbackReason}` : ''}` }),
        h('dt', { text: 'Quality' }), h('dd', { text: this.ctx.quality.tier }), h('dt', { text: 'Server' }), h('dd', { text: hello ? hello.release : 'not connected' }), h('dt', { text: 'World' }), h('dd', { text: hello?.worldId ?? '—' }))),
      onClose: () => undefined, footer: f => f.append(h('button', { class: 'tv-btn', type: 'button', on: { click: () => this.modal.close() } }, 'Close')) });
  }

  // ── connection ───────────────────────────────────────────────────────────────────────────────
  play(choice: CharacterChoice): void {
    this.clearScreen(); this.phase = 'connecting'; this.closedFinal = false; this.choice = choice; this.snapshot = null; this.predictor.reset(); this.actors.clear();
    this.loading = loadingScreen(this.overlay, choice.kind === 'new' ? 'Being born…' : 'Entering the world…'); this.screen = this.loading as { remove(): void };
    this.link.connect(choice);
  }
  private wireLink(): void {
    const l = this.link;
    l.on('hello', m => { this.ownBodyId = m.interaction?.bodyId ?? ''; this.remember(m.character.name); this.loading?.set('Loading the land…'); });
    l.on('scene', s => { this.regions.regionSize = s.geography?.regionSize ?? 256; this.regions.setOrigin(s.origin); });
    l.on('regions_state', s => { this.regions.setOrigin(s.origin); for (const id of s.unload) this.regions.unload(id); });
    l.on('presentation', p => { this.regions.applyPresentation(p.payload); requestAnimationFrame(() => requestAnimationFrame(() => p.applied())); });
    l.on('local_state', s => { this.predictor.applyLocalState(s); if (s.bodyId) this.ownBodyId = s.bodyId; });
    l.on('receipt', r => this.predictor.applyReceipt(r));
    l.on('snapshot', s => this.onSnapshot(s));
    l.on('maintenance', m => this.hud.toast(`Server maintenance in ${Math.round(m.inMs / 1000)} s: ${m.message}`, 'bad', 9000));
    l.on('status', st => this.onStatus(st));
    l.on('closed', info => this.onClosed(info));
  }
  private onStatus(st: string): void {
    if (st === 'live') { this.conn?.remove(); this.conn = null; }
    else if (st === 'reconnecting' && this.phase === 'playing') { this.conn ??= banner(this.overlay, 'Connection lost. Reconnecting…'); }
  }
  private onClosed(info: ClosedInfo): void {
    if (!info.final) { if (this.phase === 'playing') { this.conn ??= banner(this.overlay, `${info.reason || 'Connection lost'}. Reconnecting…`); } return; }
    this.closedFinal = true; this.phase = 'closed'; this.controller.release(); this.input.exitLock(); this.dialogue.update(null); this.modal.close(false); this.conn?.remove(); this.conn = null; this.clearScreen();
    if (info.kind === 'no-character') { this.showCharacter(this.remembered() ? info.reason : undefined); return; }
    const titles: Record<string, string> = { superseded: 'Signed in elsewhere', auth: 'Sign-in failed', forbidden: 'Not allowed', character: 'Character unavailable', incompatible: 'Update needed', 'no-session': 'No game session', rate: 'Slow down' };
    const actions = [{ label: 'Return to title', primary: true, run: () => { this.link.disconnect(); this.showTitle(); } }];
    if (info.kind === 'superseded') actions.unshift({ label: 'Take the game back here', primary: true, run: () => this.play({ kind: 'auto' }) });
    if (info.kind === 'character' && /died/i.test(info.reason)) { this.forget(); actions.unshift({ label: 'Begin a new life', primary: true, run: () => this.showCharacter() }); }
    this.screen = noticeScreen(this.overlay, titles[info.kind] ?? 'Disconnected', info.reason || 'The connection closed.', actions);
  }

  // ── snapshot handling ────────────────────────────────────────────────────────────────────────
  own(): BodyState | null { const s = this.snapshot; return s ? s.bodies.find(b => b.bodyId === s.controlledBodyId) ?? null : null; }
  private candidates() { const s = this.snapshot; return s ? candidatesFrom(s.bodies, s.wildlife.bodies, s.controlledBodyId) : []; }
  private speakerPos(): Vec3 | null { const s = this.snapshot; if (!s?.dialogue?.speakerBodyId) return null; return s.bodies.find(b => b.bodyId === s.dialogue!.speakerBodyId)?.pos ?? null; }

  private onSnapshot(s: SnapshotMessage): void {
    this.snapshot = s; this.ownBodyId = s.controlledBodyId; this.lastSnapAt = performance.now();
    this.actors.sync(s, s.controlledBodyId, performance.now());
    this.dialogue.update(s.dialogue as DialogueProjection | null);
    this.computeFocus(s);
    if (this.modal.isOpen && this.modal.currentTab && ['items', 'abilities', 'journal'].includes(this.modal.currentTab)) this.modal.refresh();
    const own = this.own();
    if (own?.dead && this.phase === 'playing' && !this.screen) { this.controller.release(); this.input.exitLock(); this.modal.close(false); this.screen = deathScreen(this.overlay, own.name, { onNew: () => { this.forget(); this.link.disconnect(); this.showCharacter(); }, onQuit: () => { this.link.disconnect(); this.showTitle(); } }); }
  }
  /** The world is ready when the land under the player is resident and the first authoritative state has arrived. */
  private tryEnter(): void {
    const p = this.predictor.predicted;
    if (this.snapshot && p && this.regions.regions.size >= 1 && this.regions.groundAt(p.pos.x, p.pos.z) !== null) this.enterGame();
  }
  private enterGame(): void {
    this.phase = 'playing'; this.clearScreen(); this.loading = null; this.hud.show(true);
    const p = this.predictor.predicted; if (p) this.rig.yaw = p.yaw; this.rig.pitch = 0.3;
    this.hud.toast(`Welcome, ${this.link.hello?.character.name ?? 'traveller'}.`, 'info', 5000);
    if (this.input.device === 'keyboard') this.input.requestLock();
    this.updateHints();
  }

  private computeFocus(s: SnapshotMessage): void {
    const p = this.predictor.predicted?.pos; if (!p) { this.focus = { target: null, refusal: null }; return; }
    const yaw = this.predictor.predicted!.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let best: InteractionTarget | null = null, bestScore = Infinity;
    for (const t of s.interactionTargets) {
      const dx = t.pos.x - p.x, dz = t.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > 3.4) continue;
      const cos = d > 0.05 ? (dx * fx + dz * fz) / d : 1;
      const score = d + (1 - cos) * 1.4 - (this.focus.target?.actionId === t.actionId ? 0.45 : 0);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    let refusal: string | null = null;
    if (!best) { const r = s.talkRefusals[0]; if (r && r.distance < 3.2) refusal = `${r.name} is ${TALK_REASON[r.reason] ?? r.reason}`; }
    this.focus = { target: best, refusal };
  }

  // ── actions ──────────────────────────────────────────────────────────────────────────────────
  async act(request: Record<string, unknown>, label: string): Promise<void> {
    const r = await this.link.intent(request); const d = describeResult(r.result);
    this.hud.toast(r.result === 'accepted' ? `${label}.` : d.text, r.result === 'accepted' ? 'good' : d.tone === 'info' ? 'bad' : d.tone);
  }
  private async doInteract(): Promise<void> {
    const t = this.focus.target; if (!t) return;
    this.hintState.interacted = true;
    if (t.kind === 'person') { const r = await this.link.intent({ type: 'talk', targetBodyId: t.targetId }); if (r.result !== 'accepted') { const d = describeResult(r.result); this.hud.toast(d.text, 'bad'); } return; }
    const r = await this.link.intent({ type: 'interact', interactionId: t.actionId });
    const d = describeResult(r.result); this.hud.toast(r.result === 'accepted' ? t.label : d.text, r.result === 'accepted' ? 'good' : 'bad');
  }
  private async doHush(): Promise<void> {
    const t = this.controller.aimTarget(); if (!t) { this.hud.toast('Nothing to hush.', 'bad'); return; }
    const r = await this.link.intent({ type: 'hush', targetBodyId: t.bodyId }); const d = describeResult(r.result); this.hud.toast(d.text, d.tone === 'info' ? 'info' : d.tone);
  }
  private onCombatCommand(c: CombatIntent): void { void c; this.hintState.attacked = true; this.rig.setMode('combat'); this.combatUntil = performance.now() + 5000; }
  private combatUntil = 0;
  private onLock(id: string | null): void { this.rig.setLock(null); void id; }

  private panelServices(): PanelServices {
    return {
      snapshot: () => this.snapshot, ownBody: () => this.own(),
      act: (r, l) => this.act(r, l),
      transfer: async (cid, iid, dir) => { const r = await this.link.intent({ type: 'container_transfer', containerId: cid, itemId: iid, direction: dir }); const d = describeResult(r.result); if (r.result !== 'accepted') this.hud.toast(d.text, 'bad'); },
      interact: async (id, label) => { const r = await this.link.intent({ type: 'interact', interactionId: id }); if (r.result === 'accepted') this.hud.toast(label, 'good'); else this.hud.toast(describeResult(r.result).text, 'bad'); },
      crouch: { get: () => this.controller.crouchToggled, toggle: () => { this.controller.crouchToggled = !this.controller.crouchToggled; } },
      practice: m => { this.link.sendCommand({ type: 'practice', mode: m }); this.hud.toast(`Practice: ${m}.`, 'info'); },
      close: () => this.modal.close(),
    };
  }
  openMenu(tab: 'items' | 'abilities' | 'journal'): void {
    if (this.phase !== 'playing') return;
    this.controller.release(); this.input.exitLock();
    const svc = this.panelServices();
    this.modal.open({ title: this.own()?.name ?? 'You', tabs: [itemsTab(svc), abilitiesTab(svc), journalTab(svc)], initialTab: tab,
      hints: [{ key: codeLabel('Tab', 'keyboard'), text: 'Abilities' }, { key: 'Esc', text: 'Close' }], onClose: () => this.afterModal(),
      footer: f => f.append(h('button', { class: 'tv-btn', type: 'button', on: { click: () => this.modal.close() } }, 'Close')) });
  }
  openPause(): void {
    if (this.phase !== 'playing' || this.modal.isOpen) return;
    this.controller.release(); this.input.exitLock();
    const rerender = () => this.modal.refresh();
    const pauseTab = { id: 'pause', label: 'Pause', render: (b: HTMLElement) => add(b,
      h('p', { class: 'tv-sub', text: 'The world does not pause. People go on with their day around you.' }),
      h('div', { class: 'tv-menu' },
        h('button', { class: 'tv-btn primary', type: 'button', 'data-autofocus': '1', on: { click: () => this.modal.close() } }, 'Resume'),
        h('button', { class: 'tv-btn', type: 'button', on: { click: () => void this.saveNow() } }, 'Save the world now'),
        h('button', { class: 'tv-btn', type: 'button', on: { click: () => { this.modal.close(false); this.link.disconnect(); this.link.connect(this.link.hello ? { kind: 'existing', personId: this.link.hello.playerId } : { kind: 'auto' }); this.phase = 'connecting'; this.loading = loadingScreen(this.overlay, 'Reconnecting…'); this.screen = this.loading as { remove(): void }; this.regions.regions.forEach((_, id) => this.regions.unload(id)); this.actors.clear(); this.predictor.reset(); } } }, 'Reconnect'),
        h('button', { class: 'tv-btn', type: 'button', on: { click: () => this.openAbout() } }, 'About this build'),
        h('button', { class: 'tv-btn danger', type: 'button', on: { click: () => { this.modal.close(false); this.link.disconnect(); this.showTitle(); } } }, 'Return to title'))) };
    const svc = { get: () => this.settings, update: (p: Partial<Settings>) => this.updateSettings(p), input: this.input, rendererName: () => this.ctx.kind === 'webgpu' ? 'WebGPU' : 'WebGL 2 (reduced effects)', reset: () => { this.settings = structuredClone(DEFAULT_SETTINGS); saveSettings(this.settings); this.applyUiSettings(); } };
    this.modal.open({ title: 'Paused', tabs: [pauseTab, ...settingsTabs(svc, rerender)], initialTab: 'pause', onClose: () => this.afterModal(), hints: [{ key: 'Q / E', text: 'Switch tab' }, { key: 'Esc', text: 'Resume' }] });
  }
  openSettings(tab: string): void {
    if (this.modal.isOpen) return;
    const rerender = () => this.modal.refresh();
    const svc = { get: () => this.settings, update: (p: Partial<Settings>) => this.updateSettings(p), input: this.input, rendererName: () => this.ctx.kind === 'webgpu' ? 'WebGPU' : 'WebGL 2 (reduced effects)', reset: () => { this.settings = structuredClone(DEFAULT_SETTINGS); saveSettings(this.settings); this.applyUiSettings(); } };
    this.modal.open({ title: 'Settings', tabs: settingsTabs(svc, rerender), initialTab: tab, onClose: () => undefined, hints: [{ key: 'Q / E', text: 'Switch tab' }, { key: 'Esc', text: 'Back' }] });
  }
  private async saveNow(): Promise<void> { const r = await this.link.requestSave(); this.hud.toast(r.result === 'saved' || r.result === 'accepted' ? 'The world is saved.' : describeResult(r.result).text, r.result === 'saved' || r.result === 'accepted' ? 'good' : 'bad'); }
  private afterModal(): void { this.ignoreEscUntil = performance.now() + 250; if (this.phase === 'playing' && this.input.device === 'keyboard' && !this.dialogue.isOpen) queueMicrotask(() => this.input.requestLock()); }

  // ── hints ────────────────────────────────────────────────────────────────────────────────────
  private updateHints(): void {
    if (!this.settings.showHints || this.phase !== 'playing') { this.hud.setHints([]); return; }
    const k = (a: Parameters<InputManager['promptCode']>[0]) => codeLabel(this.input.promptCode(a), this.input.device);
    const lines: { key: string; text: string }[] = [];
    if (!this.hintState.moved) lines.push({ key: this.input.device === 'keyboard' ? 'WASD' : 'Left stick', text: 'Move' });
    if (!this.hintState.looked) lines.push({ key: this.input.device === 'keyboard' ? 'Mouse' : 'Right stick', text: 'Look around' });
    if (this.focus.target && !this.hintState.interacted) lines.push({ key: k('interact'), text: 'Interact' });
    if (this.hintState.moved && this.hintState.looked && this.hintState.interacted && !this.hintState.attacked) lines.push({ key: k('journal'), text: 'Journal' });
    this.hud.setHints(lines.slice(0, 3));
  }

  // ── frame ────────────────────────────────────────────────────────────────────────────────────
  private frame(): void {
    const now = performance.now(), dtRaw = (now - this.lastFrame) / 1000; this.lastFrame = now; this.frameMs.push(dtRaw * 1000); if (this.frameMs.length > 4000) this.frameMs.shift();
    const dt = Math.min(0.1, dtRaw);
    this.input.beginFrame(dt);
    const wasOpen = this.modal.isOpen;
    if (this.nav.open) this.nav.update();
    if (this.phase === 'connecting') this.tryEnter();
    if (this.phase === 'playing') this.gameFrame(dt, now, wasOpen);
    else this.backdropFrame(dt);
    this.ctx.scene.render();
    if (!this.ready && this.phase === 'playing' && this.regions.regions.size >= 5 && ++this.readyFrames > 30) this.ready = true;
    if (this.params.get('replay') && !this.ready && this.regions.regions.size >= 5 && this.snapshot && ++this.readyFrames > 30) this.ready = true;
  }
  private backdropFrame(dt: number): void {
    // Title/loading backdrop: a slow orbit over whatever is loaded, at golden hour.
    this.titleOrbit += dt * 0.05;
    const p = this.predictor.predicted?.pos;
    if (p) { const pivot = { x: p.x - this.regions.origin.x, y: p.y + 2.2, z: p.z - this.regions.origin.z }; this.rig.yaw = this.titleOrbit; this.rig.pitch = 0.22; this.rig.distance = 16; this.rig.update(dt, pivot, 0); }
    else { this.camera.position.set(0, 60, 0); this.camera.setTarget(new Vector3(0, 55, -100)); }
    this.atmosphere.update(this.params.get('hour') ? Number(this.params.get('hour')) : 17.6, this.regions.weather, dt);
    this.atmosphere.follow(this.camera.position);
    this.regions.update(dt, this.camera.position, this.camera.getForwardRay(1).direction, 1 - this.atmosphere.daylight);
    this.actors.update(dt, performance.now(), null);
  }
  private gameFrame(dt: number, now: number, wasOpen: boolean): void {
    const inp = this.input, s = this.snapshot, own = this.own();
    // Global actions.
    const menuFree = !this.modal.isOpen && !wasOpen && !this.screen;
    if (menuFree && !this.dialogue.isOpen) {
      if (inp.pressed('pause') && now > this.ignoreEscUntil) this.openPause();
      else if (inp.pressed('abilities')) this.openMenu('abilities');
      else if (inp.pressed('items')) this.openMenu('items');
      else if (inp.pressed('journal')) this.openMenu('journal');
    } else if (menuFree && this.dialogue.isOpen) {
      if ((inp.pressed('pause') && now > this.ignoreEscUntil) || inp.pressed('uiBack')) this.dialogue.requestClose();
    }
    const acting = menuFree && !this.dialogue.isOpen && !own?.dead;
    if (acting) {
      if (inp.pressed('interact')) void this.doInteract();
      if (inp.pressed('hush')) void this.doHush();
      if (inp.pressed('quickItem')) this.openMenu('items');
      if (this.dialogue.isOpen === false && (inp.look.x || inp.look.y)) { this.rig.addLook(inp.look.x, inp.look.y); this.hintState.looked = true; }
      if (inp.wheel) this.rig.zoom(inp.wheel);
    }
    // Talk camera.
    const partner = this.speakerPos();
    if (this.dialogue.isOpen && partner) { this.rig.setMode('talk'); this.rig.setTalk({ x: partner.x - this.regions.origin.x, y: partner.y - this.regions.origin.y, z: partner.z - this.regions.origin.z }); }
    else if (now < this.combatUntil || this.controller.guardHeld || this.controller.lockedBodyId) { this.rig.setMode('combat'); this.rig.setTalk(null); }
    else { this.rig.setMode('explore'); this.rig.setTalk(null); }
    // Movement, prediction and commands.
    this.controller.update(dt);
    if (this.controller.moving) this.hintState.moved = true;
    // Own body.
    const vis = this.predictor.visual();
    const lock = this.controller.lockedBodyId ? this.candidates().find(c => c.bodyId === this.controller.lockedBodyId) : undefined;
    this.rig.setLock(lock ? { x: lock.pos.x - this.regions.origin.x, y: lock.pos.y + 1.2 - this.regions.origin.y, z: lock.pos.z - this.regions.origin.z } : null);
    this.actors.update(dt, now, vis && this.ownBodyId ? { bodyId: this.ownBodyId, pos: vis.pos, yaw: vis.yaw, crouch: vis.crouch } : null);
    // Camera.
    if (vis) {
      const eye = own?.embodiment?.activity.posture === 'sit' ? 1.05 : own?.embodiment?.activity.posture === 'lie' ? 0.5 : 1.55;
      this.rig.pivotDrop = (INTERACTION_SPEC.height - INTERACTION_SPEC.duckHeight) * vis.crouch * 0.9;
      this.rig.update(dt, { x: vis.pos.x - this.regions.origin.x, y: vis.pos.y - this.regions.origin.y + eye, z: vis.pos.z - this.regions.origin.z }, vis.yaw);
    }
    // World.
    const hour = this.params.get('hour') ? Number(this.params.get('hour')) : ((this.regions.worldTime / 3600) % 24 + 24) % 24;
    this.atmosphere.update(hour, this.regions.weather, dt); this.atmosphere.follow(this.camera.position);
    this.regions.update(dt, this.camera.position, this.rig.forward, 1 - this.atmosphere.daylight);
    if (this.controller.lockedBodyId === null && now > this.combatUntil && this.rig.mode === 'combat') this.rig.setMode('explore');
    // HUD (10 Hz).
    if (now - this.lastHudAt > 100 && s) { this.lastHudAt = now; this.updateHud(s, own); }
  }
  private updateHud(s: SnapshotMessage, own: BodyState | null): void {
    if (!own) return;
    const cond = s.journal.condition;
    this.hud.setVitals({ health: own.health ?? 1, maxHealth: own.maxHealth ?? 1, effort: 1 - cond.fatigue, hunger: own.needs?.hunger ?? 0, thirst: own.needs?.thirst ?? 0, tiredness: own.needs?.energy ?? 0, wealth: own.wealth ?? 0 });
    const place = this.regions.placeAt(own.pos.x, own.pos.y, own.pos.z);
    this.hud.setPlace(place.kind === 'building' ? titleCase(place.type) : place.kind === 'settlement' ? 'Settlement' : 'Open country', s.worldTime, this.regions.weather.kind);
    const rtt = (this.link as GameLink).rttMs; this.hud.setNet(this.link.status === 'live' ? `${Math.round(rtt)} ms` : 'Reconnecting…', this.link.status !== 'live' || rtt > 250);
    const t = this.focus.target, k = codeLabel(this.input.promptCode('interact'), this.input.device);
    if (this.dialogue.isOpen || this.modal.isOpen) this.hud.setPrompt(null);
    else if (t) this.hud.setPrompt({ keyLabel: k, text: t.label });
    else if (this.focus.refusal) this.hud.setPrompt({ keyLabel: '', text: this.focus.refusal });
    else this.hud.setPrompt(null);
    const lock = this.controller.lockedBodyId ? this.candidates().find(c => c.bodyId === this.controller.lockedBodyId) : undefined;
    this.hud.setTarget(lock ? { name: titleCase(lock.name), note: lock.hostile ? 'On guard' : undefined } : null);
    this.updateHints();
    void this.moveTimer;
  }

  // ── evidence helpers ─────────────────────────────────────────────────────────────────────────
  perfReset(): void { this.frameMs.length = 0; }
  perfReport(): { frames: number; medianMs: number; p95Ms: number; p99Ms: number; maxMs: number; fpsMedian: number } {
    const a = [...this.frameMs].sort((x, y) => x - y), q = (p: number) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0);
    return { frames: a.length, medianMs: q(0.5), p95Ms: q(0.95), p99Ms: q(0.99), maxMs: a[a.length - 1] ?? 0, fpsMedian: a.length ? 1000 / q(0.5) : 0 };
  }
}
void Color3;
