import { Color3, Color4, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';
import type { ArenaAssets } from '../assets';
import type { ArenaHud } from '../hud';
import type { ArenaWorld, Fighter } from '../world';
import type { WeaponId } from '../combat';
import { ELEMENTS, TIERS, emergentClass, newSheet, rank, recordClass, tierOf, type CapabilitySheet, type Element, type EmergedClass, type Style } from './capability';
import { planFloor, type FloorPlan, type Theme } from './floorgen';
import { ELEMENT_COLOR, RARITY_COLOR, describe, rollLoot, type Gear, type Item, type Source } from './items';
import { ESSENCES, MAX_SLOTS, SLOTS_BY_TIER, cloneSkill, confluence, signatureSkill, type Essence, type SkillDef } from './skills';
import { ACHIEVEMENTS, BOX_COLOR, BOX_TIERS, newStats, recordEarned, type RunStats } from './achievements';
import { mulberry } from '../../render/noise';

/**
 * The Tower of Chrysanthus run controller: a 100-floor roguelite climb used as a proving ground for
 * combat, loot, capability growth and emergent classes. Owns the run; the ArenaWorld owns bodies.
 */
export interface StageControl { setFloor(half: number, theme: Theme, floor: number): void }
interface Pickup { item: Item; node: TransformNode; ring: Mesh; pos: Vector3; t: number }
const ELEMENT_ESSENCE: Record<Element, Essence> = { flame: 'fire', frost: 'ice', storm: 'storm', swift: 'swift', iron: 'iron', shadow: 'shadow', verdance: 'life' };
const fwdOf = (yaw: number) => new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
const SLOT_STYLE: Record<WeaponId, Style> = { fists: 'fists', greatsword: 'heavy', axe: 'blade', bow: 'bow' };

export class TowerRun {
  seed: number; floor = 0; plan!: FloorPlan;
  sheet: CapabilitySheet = newSheet();
  gear: Partial<Record<WeaponId, Extract<Gear, { kind: 'weapon' }>>> = {};
  armorItem: Extract<Gear, { kind: 'armor' }> | null = null;
  charm: Extract<Gear, { kind: 'charm' }> | null = null;
  /** Skills: everything learned (slotted or not), essences held, the class signature, the scroll pocket. */
  known: SkillDef[] = []; essences: Essence[] = []; confluenceName = ''; classSkill: SkillDef | null = null; scrolls: SkillDef[] = [];
  private pendingSlot: SkillDef[] = [];
  /** DCC: run counters, achievements earned this climb, unopened boxes (tiers). */
  stats: RunStats = newStats(); earned = new Set<string>(); boxes: number[] = [];
  private killTimes: number[] = []; private floorHurt = false; private floorMinHp = 1; private lastHurt = -99; private achT = 0;
  private hitCount = 0; private proc = false; private lastWeapon: WeaponId = 'fists'; private tierIdx = 0; private flaskBase = 3;
  private safeBusy = false;
  cls: EmergedClass | null = null;
  doorOpen = false; shrineReady = false; boonTaken = false;
  private pickups: Pickup[] = [];
  private door: TransformNode | null = null; private doorGlow: StandardMaterial | null = null; private shrine: TransformNode | null = null;
  private rnd: () => number;
  private weaponUsedThisFloor = false;
  private transition = 0;
  over = false;
  bonus = { damage: 1, speed: 1, vitality: 1 };

  constructor(private readonly scene: Scene, private readonly world: ArenaWorld, private readonly hud: ArenaHud, private readonly assets: ArenaAssets, private readonly stage: StageControl, seed: number) {
    this.seed = seed; this.rnd = mulberry(seed ^ 0x5eed);
  }

  /** Dev/testing: begin the climb on a later floor. */
  startFloor = 1;

  start(): void {
    const w = this.world;
    w.companions = false; w.autoWaves = false;
    w.reset(this.seed);
    w.unlocked = new Set<WeaponId>(['fists']); w.weaponMesh = {}; w.weaponMul = {}; w.armor = 0;
    w.flaskMax = 3; w.flasks = 3; w.passiveRegen = false; w.skills = [null, null]; w.skillCd.fill(0); w.gearStats = { crit: .12, leech: 0, cdr: 0, thorns: 0 };
    w.onCast = sk => this.onCast(sk); w.onParry = () => this.onParry();
    w.setWeapon(w.hero, 'fists');
    w.onHeroHit = (t, dmg, crit) => this.onHit(t, dmg, crit);
    w.onChest = p => this.drop(p, 'chest');
    this.over = false; this.floor = 0; this.sheet = newSheet(); this.gear = {}; this.armorItem = null; this.charm = null; this.cls = null;
    this.known = []; this.essences = []; this.confluenceName = ''; this.classSkill = null; this.scrolls = []; this.pendingSlot = [];
    this.stats = newStats(); this.earned.clear(); this.boxes = []; this.killTimes = []; this.hitCount = 0; this.tierIdx = 0; this.flaskBase = 3; this.lastWeapon = 'fists';
    this.applyPassives();
    this.enter(this.startFloor);
    this.hud.announce('THE TOWER OF CHRYSANTHUS', 'Bare hands and plain cloth. No skills: take them from what you kill.');
  }

  private enter(n: number): void {
    const w = this.world;
    if (this.floor) { this.sheet.history.floors++; if (!this.weaponUsedThisFloor) this.sheet.history.noWeaponFloors++; }
    this.floorHurt = false; this.floorMinHp = 1; this.lastHurt = w.hero.lastHurt; this.stats.floor = n;
    this.floor = n; this.plan = planFloor(this.seed, n);
    for (const p of this.pickups) { p.node.dispose(); p.ring.dispose(); } this.pickups = [];
    this.door?.dispose(); this.shrine?.dispose(); this.door = this.shrine = null;
    this.stage.setFloor(this.plan.half, this.plan.theme, n);
    // Gentle start (you begin bare-handed), full strength by floor 10, then steady growth.
    w.flasks = w.flaskMax;
    w.foeHpMul = (n < 10 ? .75 + n * .025 : 1) * (1 + Math.max(0, n - 10) * .1); w.foeDmgMul = (n < 10 ? .55 + n * .045 : 1) * (1 + Math.max(0, n - 10) * .04);
    w.loadFloor({ ...this.plan, wallColor: this.plan.theme.wall });
    this.buildDoor(); if (this.plan.shrine) this.buildShrine();
    this.doorOpen = false; this.shrineReady = false; this.boonTaken = false; this.weaponUsedThisFloor = w.weapon !== 'fists';
    const label = this.plan.kind === 'boss' ? 'BOSS FLOOR' : this.plan.kind === 'shrine' ? `SHRINE OF ${this.plan.god!.name.toUpperCase()}` : this.plan.kind === 'summit' ? 'THE SUMMIT' : this.plan.theme.name.toUpperCase();
    if (n > 1) this.hud.announce(`FLOOR ${n}`, `${label} · ${this.plan.objective}`);
    this.evaluateClass();
  }

  // ---------------------------------------------------------------- frame
  update(dt: number, interact: boolean, scroll = false): void {
    if (this.over) return;
    const w = this.world, h = w.hero;
    if (this.transition > 0) { this.transition -= dt; if (this.transition <= 0) this.enter(this.floor + 1); return; }
    if (scroll && this.scrolls.length && w.castNow(this.scrolls[0])) { const sc = this.scrolls.shift()!; this.stats.scrolls++; this.hud.toast(`Read ${sc.name}`, '#c9a35a'); }
    if (h.lastHurt !== this.lastHurt) { this.lastHurt = h.lastHurt; this.floorHurt = true; }
    this.floorMinHp = Math.min(this.floorMinHp, h.hp / h.maxHp);
    this.stats.bestCombo = Math.max(this.stats.bestCombo, w.combo.hits); this.stats.smashed = w.smashed;
    if (w.weapon !== this.lastWeapon) { this.lastWeapon = w.weapon; this.applyPassives(); }
    if ((this.achT -= dt) <= 0) { this.achT = .5; this.checkAchievements(); this.checkTier(); }
    const foes = w.fighters.filter(f => f.role === 'foe' && f.alive);
    if (!this.doorOpen && foes.length === 0) {
      if (this.plan.shrine && !this.boonTaken) { if (!this.shrineReady) { this.shrineReady = true; this.hud.announce(`${this.plan.god!.name.toUpperCase()} WATCHES`, 'Approach the shrine and press E'); } }
      else this.openDoor();
    }
    if (this.shrineReady && !this.boonTaken && this.plan.shrine && Vector3.Distance(h.pos, new Vector3(this.plan.shrine.x, 0, this.plan.shrine.z)) < 3 && interact && !this.hud.modalOpen) void this.offerBoon();
    if (this.doorOpen && Math.hypot(h.pos.x - this.plan.exit.x, h.pos.z - this.plan.exit.z) < 2.2) {
      if (this.floor >= 100) { this.victory(); return; }
      this.transition = .9; this.hud.fade(.9, `Floor ${this.floor + 1}`);
    }
    // Pickups bob, spin and are collected by walking over them.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]; p.t += dt;
      p.node.position.set(p.pos.x, .6 + Math.sin(p.t * 3) * .15, p.pos.z); p.node.rotation.y += dt * 1.6;
      (p.ring.material as StandardMaterial).alpha = .5 + Math.sin(p.t * 5) * .2;
      if (p.t > .6 && Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z) < 1.5) { this.take(p.item); p.node.dispose(); p.ring.dispose(); this.pickups.splice(i, 1); }
    }
    if (this.doorGlow && this.doorOpen) this.doorGlow.alpha = .55 + Math.sin(w.time * 4) * .2;
    if (w.weapon !== 'fists') this.weaponUsedThisFloor = true;
  }

  get boss(): Fighter | null { return this.world.fighters.find(f => f.boss && f.alive) ?? null; }
  get tier() { return tierOf(this.sheet, this.world.level); }

  // ---------------------------------------------------------------- combat hooks
  onKill(f: Fighter): void {
    if (this.over) return;
    if (f.role !== 'foe') return;
    const w = this.world, st = this.stats;
    this.sheet.history.kills++; st.kills++;
    this.sheet.style[SLOT_STYLE[w.weapon]] += 3;
    if (w.weapon === 'fists') st.fistKills++;
    if (f.burnT > 0) st.burnKills++;
    const k = f.foeKind ?? '';
    if (k.startsWith('skeleton') || k === 'minion') st.skeletons++; else if (k.startsWith('goblin')) st.goblins++; else if (k.startsWith('orc')) st.orcs++;
    this.killTimes.push(w.time); this.killTimes = this.killTimes.filter(t => w.time - t < 2); st.multikill = Math.max(st.multikill, this.killTimes.length);
    // Legendary powers that answer a kill.
    const p = this.powers();
    if (p.has('pyre') && !this.proc) { this.proc = true; w.blast(f.pos, 3.2, 18 * this.dmgScale(), 3, new Color3(1, .5, .15), 10 * this.dmgScale()); this.proc = false; }
    if (p.has('thirst')) w.hero.hp = Math.min(w.hero.maxHp, w.hero.hp + w.hero.maxHp * .05);
    if (p.has('reaper')) for (let i = 0; i < w.skillCd.length; i++) w.skillCd[i] = Math.max(0, w.skillCd[i] - 1);
    if (f.boss) { this.sheet.history.bosses++; st.bosses++; this.drop(f.pos, 'boss', k); this.hud.announce(`${f.boss.name.toUpperCase()} FALLS`); }
    else this.drop(f.pos, f.foe && (f.foe.scale ?? 1) > 1.15 ? 'elite' : 'enemy', k);
    this.evaluateClass();
  }

  onHeroDown(): void {
    this.over = true;
    const c = this.cls ? `${this.cls.name} (${this.cls.pattern})` : 'no class emerged';
    setTimeout(() => this.hud.message(`Fallen on Floor ${this.floor}`, `${this.tier} · ${c} · ${this.sheet.history.kills} foes · ${this.sheet.history.bosses} bosses`, 'Begin a new climb', () => {
      this.seed = (this.seed * 48271 + 11) % 2147483647; this.rnd = mulberry(this.seed ^ 0x5eed); this.start();
    }), 900);
  }

  /** Affinities act on every landed hero blow. Use also slowly trains the affinity (capability grows with practice). */
  private onHit(t: Fighter, dmg: number, crit: boolean): void {
    const s = this.sheet, w = this.world;
    s.style[SLOT_STYLE[w.weapon]] += crit ? 2 : 1;
    const it = this.gear[w.weapon as Exclude<WeaponId, 'fists'>];
    const aff = (e: Element) => this.aff(e) + (it?.element === e ? .5 : 0);
    if (this.proc) return;
    this.proc = true;
    const pw = this.powers();
    if (pw.has('thunder') && ++this.hitCount % 6 === 0) w.procChain(t, dmg * .6, 3);
    if (pw.has('winter') && t.slowT > 0 && !crit && t.alive) w.effectDamage(t, dmg * .8, new Vector3(0, 0, 0), 0);
    if (pw.has('avalanche') && w.hero.atk?.heavy && t.alive) w.blast(t.pos, 2.6, dmg * .4, 6, new Color3(.85, .9, 1));
    this.proc = false;
    const r = this.rnd;
    const flame = aff('flame'); if (flame > 0 && r() < .18 + flame * .06) { t.burnT = 3; t.burnDps = Math.max(t.burnDps, dmg * .22 * flame); s.affinity.flame += .015; }
    const frost = aff('frost'); if (frost > 0 && r() < .2 + frost * .07) { t.slowT = 2 + frost * .5; this.world.fx.sparksAt(t.pos.add(new Vector3(0, 1.2, 0)), 10, new Color4(.6, .9, 1, 1)); s.affinity.frost += .015; }
    const storm = aff('storm');
    if (storm > 0 && r() < .12 + storm * .05) {
      s.affinity.storm += .015;
      const near = w.fighters.filter(o => o !== t && o.role === 'foe' && o.alive && Vector3.Distance(o.pos, t.pos) < 6).slice(0, 1 + Math.floor(storm));
      for (const o of near) { w.effectDamage(o, dmg * .5, o.pos.subtract(t.pos).normalize(), 2); w.fx.flash(o.pos.add(new Vector3(0, 1.3, 0)), 1.6, new Color3(.75, .6, 1)); w.fx.sparksAt(o.pos.add(new Vector3(0, 1.3, 0)), 14, new Color4(.8, .7, 1, 1)); }
    }
    const shadow = aff('shadow'); if (shadow > 0 && r() < .1 + shadow * .05) { w.effectDamage(t, dmg * .6, new Vector3(0, 0, 0), 0); s.affinity.shadow += .015; }
    const verd = aff('verdance'); if (verd > 0) { w.hero.hp = Math.min(w.hero.maxHp, w.hero.hp + dmg * .04 * verd); }
  }

  // ---------------------------------------------------------------- loot
  drop(at: Vector3, source: Source, foeKind?: string, boxTier = 0): void {
    for (const item of rollLoot(this.floor, this.rnd, source, foeKind, boxTier)) this.spawnPickup(item, at.add(new Vector3((this.rnd() - .5) * 1.8, 0, (this.rnd() - .5) * 1.8)));
  }

  private itemColor(item: Item): string {
    return item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'charm' ? RARITY_COLOR[item.rarity] : item.kind === 'book' ? ELEMENT_COLOR[item.element]
      : item.kind === 'essence' ? ESSENCES[item.essence].color : item.kind === 'scroll' ? '#c9a35a' : '#ff6a8a';
  }

  private spawnPickup(item: Item, pos: Vector3): void {
    const node = new TransformNode('loot', this.scene), hex = this.itemColor(item), col = Color3.FromHexString(hex);
    const glow = (m: Mesh) => { const mt = new StandardMaterial('loot-glow', this.scene); mt.emissiveColor = col; mt.disableLighting = true; m.material = mt; m.parent = node; m.isPickable = false; };
    const src = item.kind === 'weapon' ? item.mesh : item.kind === 'book' ? 'W_codex-of-the-veil' : item.kind === 'potion' ? 'L_bottle_b' : item.kind === 'armor' ? 'P_crate_small' : '';
    const m = src ? this.assets.sources.get(src) : undefined;
    if (m) { const i = m.createInstance('loot-mesh'); i.parent = node; i.isPickable = false; if (item.kind === 'weapon') { i.rotation.z = Math.PI / 2.4; i.scaling.setAll(1.1); } if (item.kind === 'armor') i.scaling.setAll(.45); if (item.kind === 'book') i.scaling.setAll(2.2); }
    else if (item.kind === 'essence') glow(MeshBuilder.CreatePolyhedron('essence', { type: 2, size: .3 }, this.scene));
    else if (item.kind === 'scroll') { const c = MeshBuilder.CreateCylinder('scroll', { diameter: .16, height: .6, tessellation: 8 }, this.scene); c.rotation.z = Math.PI / 2; glow(c); }
    else if (item.kind === 'charm') glow(MeshBuilder.CreateTorus('charm', { diameter: .45, thickness: .09, tessellation: 16 }, this.scene));
    const ring = MeshBuilder.CreateDisc('loot-ring', { radius: .75, tessellation: 24 }, this.scene);
    ring.rotation.x = Math.PI / 2; ring.position.set(pos.x, .04, pos.z); ring.isPickable = false;
    const mat = new StandardMaterial('loot-ring', this.scene);
    mat.emissiveColor = col; mat.disableLighting = true; mat.alpha = .6; ring.material = mat;
    // Diablo's loot beam: legendaries, mythics and essences call attention from across the room.
    const rare = ((item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'charm') && item.rarity >= 3) || item.kind === 'essence';
    if (rare) { const beam = MeshBuilder.CreateCylinder('loot-beam', { diameterTop: .05, diameterBottom: .35, height: 7, tessellation: 8 }, this.scene); beam.position.set(pos.x, 3.5, pos.z); beam.parent = ring; beam.position.set(0, 0, -3.5); beam.rotation.x = -Math.PI / 2; const bm = mat.clone('loot-beam'); bm.alpha = .35; beam.material = bm; beam.isPickable = false; }
    this.pickups.push({ item, node, ring, pos: pos.clone(), t: 0 });
  }

  private take(item: Item): void {
    const w = this.world;
    if (item.kind === 'weapon') {
      const slot = item.slot as Exclude<WeaponId, 'fists'>, cur = this.gear[slot];
      if (item.rarity >= 3) this.stats.legendaries++;
      if (!cur || item.score > cur.score) {
        this.gear[slot] = item; w.unlocked.add(item.slot); w.weaponMesh[item.slot] = { mesh: item.mesh, hand: item.hand };
        if (!cur || w.weapon === item.slot) w.setWeapon(w.hero, item.slot);
        this.hud.toast(`${item.name} (${item.base}) — ${describe(item) || 'plain'}${!cur ? ' · Tab to draw' : ''}`, RARITY_COLOR[item.rarity]);
      } else { this.hud.toast(`${item.name} (salvaged: not better than yours)`, '#888'); this.sheet.style[item.style] += 2; }
    } else if (item.kind === 'armor' || item.kind === 'charm') {
      const cur = item.kind === 'armor' ? this.armorItem : this.charm;
      if (item.rarity >= 3) this.stats.legendaries++;
      if (!cur || item.score > cur.score) {
        if (item.kind === 'armor') this.armorItem = item; else this.charm = item;
        this.hud.toast(`Equipped ${item.name}${item.kind === 'armor' ? ` (−${Math.round(item.reduction * 100)}% damage)` : ''} — ${describe(item) || 'plain'}`, RARITY_COLOR[item.rarity]);
      } else this.hud.toast(`${item.name} (salvaged)`, '#888');
    } else if (item.kind === 'book') {
      this.sheet.affinity[item.element] += 1; this.sheet.history.tomes++; this.stats.books++;
      this.hud.toast(`${item.name}: learned ${item.skill.name} · ${item.element} affinity ${Math.floor(this.sheet.affinity[item.element])}`, ELEMENT_COLOR[item.element]);
      this.learn(item.skill);
    } else if (item.kind === 'scroll') {
      if (this.scrolls.length >= 5) { this.hud.toast(`${item.name} (scroll pocket full)`, '#888'); return; }
      this.scrolls.push(item.skill); this.hud.toast(`${item.name} — press G to read`, '#c9a35a');
    } else if (item.kind === 'essence') this.absorb(item.essence);
    else { this.flaskBase = Math.min(5, this.flaskBase + (w.flasks >= w.flaskMax ? 1 : 0)); w.flasks = Math.min(w.flaskMax + 1, w.flasks + 1); this.hud.toast(`${item.name}: +1 flask (Q)`, '#ff6a8a'); }
    this.applyPassives(); this.evaluateClass();
  }

  // ---------------------------------------------------------------- essences and skills
  /** He Who Fights With Monsters: an essence grants its ability; the third forms a confluence. */
  private absorb(e: Essence): void {
    const E = ESSENCES[e];
    if (this.essences.includes(e) || this.essences.length >= 3) {
      // A held (or unabsorbable) essence resonates instead: its ability, or your strongest, ranks up.
      const sk = this.known.find(k => k.id === E.skill.id) ?? this.known.find(k => k.source === 'confluence');
      if (sk) { sk.rank++; this.hud.toast(`${E.name} essence resonates: ${sk.name} rank ${sk.rank}`, E.color); }
      if (E.element) this.sheet.affinity[E.element] += .5;
      return;
    }
    this.essences.push(e); this.stats.essences++;
    if (E.element) this.sheet.affinity[E.element] += 1;
    this.hud.announce(`${E.name.toUpperCase()} ESSENCE ABSORBED`, `You gain ${E.skill.name}: ${E.skill.text}`);
    this.learn(cloneSkill(E.skill));
    if (this.essences.length === 3) {
      const c = confluence(this.essences); this.confluenceName = c.name; this.stats.confluences++;
      setTimeout(() => this.hud.announce(`CONFLUENCE: ${c.name.toUpperCase()}`, `${this.essences.map(x => ESSENCES[x].name).join(' + ')} → ${c.skill.name}`), 2300);
      this.learn(c.skill); this.checkTier(true);
    }
  }

  /** Learn a skill: rank up if known, else fill an empty slot, else wait for the floor's safe moment to choose. */
  private learn(sk: SkillDef): void {
    const had = this.known.find(k => k.id === sk.id);
    if (had) { had.rank++; this.hud.toast(`${had.name} ranks up (${had.rank})`, sk.color); this.applyPassives(); return; }
    this.known.push(sk);
    const w = this.world, free = w.skills.indexOf(null);
    if (free >= 0) { w.skills[free] = sk; this.hud.toast(`${sk.name} in slot ${free + 1}`, sk.color); }
    else { this.pendingSlot.push(sk); this.hud.toast(`Slots full: choose a slot for ${sk.name} when the floor is clear`, sk.color); }
    this.applyPassives();
  }

  /** Slots grow with measured tier (and a confluence). New slots fill from learned-but-unslotted skills. */
  private checkTier(force = false): void {
    const w = this.world, ti = TIERS.indexOf(this.tier);
    if (ti === this.tierIdx && !force) return;
    const grew = ti > this.tierIdx; this.tierIdx = ti;
    const n = Math.min(MAX_SLOTS, SLOTS_BY_TIER[ti] + (this.confluenceName ? 1 : 0));
    if (n <= w.skills.length) return;
    while (w.skills.length < n) w.skills.push(null);
    if (grew) this.hud.announce(`TIER: ${this.tier.toUpperCase()}`, `Skill slots: ${n}`);
    for (let i = 0; i < w.skills.length; i++) if (!w.skills[i]) { const next = this.pendingSlot.shift() ?? this.known.find(k => !w.skills.includes(k)); if (next) w.skills[i] = next; }
  }

  private onCast(sk: SkillDef): boolean {
    this.stats.skillCasts++;
    // Practice is capability: casting trains the skill's element.
    for (const r of sk.riders) if ((ELEMENTS as string[]).includes(r)) this.sheet.affinity[r as Element] += .01;
    if (sk.uses % 25 === 0) { sk.rank++; this.hud.toast(`${sk.name} ranks up through use (${sk.rank})`, sk.color); this.applyPassives(); }
    return this.powers().has('echo') && this.rnd() < .3;
  }

  private onParry(): void {
    this.stats.parries++;
    if (this.powers().has('bulwark')) { this.world.wardHp = Math.max(this.world.wardHp, 160 * this.dmgScale()); this.world.wardT = 6; }
  }

  // ---------------------------------------------------------------- gear, affinities, passives
  /** Equipped gear: armour, charm and the drawn weapon (Diablo: only what you hold counts). */
  private worn(): Gear[] { return [this.armorItem, this.charm, this.gear[this.world.weapon as Exclude<WeaponId, 'fists'>]].filter(Boolean) as Gear[]; }
  private powers(): Set<string> { return new Set(this.worn().map(g => g.power).filter(Boolean) as string[]); }
  private stat(id: string): number { let v = 0; for (const g of this.worn()) for (const a of g.affixes) if (a.stat === id) v += a.value; return v; }
  /** Affinity in effect: capability plus what you wear and your class's boon. */
  private aff(e: Element): number { return this.sheet.affinity[e] + this.stat(`aff:${e}`) + (this.cls?.boon.element === e ? this.cls.boon.amount : 0); }
  /** Floor-relative damage scale for procs (keeps legendary powers useful as foes grow). */
  private dmgScale(): number { return 1 + this.floor * .06; }

  private applyPassives(): void {
    const s = this.sheet, w = this.world, c = this.cls?.boon;
    this.bonus.speed = 1 + this.aff('swift') * .05 + (c?.stat === 'speed' ? c.amount : 0) + this.stat('atk');
    this.bonus.damage = 1 + (c?.stat === 'damage' ? c.amount : 0) + this.stat('dmg');
    w.bonus.atkSpeed = this.bonus.speed; w.bonus.move = 1 + this.aff('swift') * .04 + this.stat('move'); w.bonus.damage = this.bonus.damage;
    w.armor = Math.min(.75, (this.armorItem?.reduction ?? 0) + this.aff('iron') * .03 + this.stat('armor'));
    w.gearStats = { crit: Math.min(.6, .12 + this.stat('crit')), leech: Math.min(.08, this.stat('leech')), cdr: Math.min(.45, this.stat('cdr')), thorns: this.stat('thorns') };
    for (const [slot, g] of Object.entries(this.gear)) if (g) w.weaponMul[slot as WeaponId] = g.item * (1 + g.rarity * .08);
    const flaskMax = this.flaskBase + this.stat('flask');
    if (flaskMax !== w.flaskMax) { w.flaskMax = flaskMax; w.flasks = Math.min(w.flasks, flaskMax); }
    // Skill power: base, rank (books, resonance, practice) and the affinity of each rider element.
    for (const sk of this.known) {
      const base = sk.source === 'confluence' ? 1.4 : sk.source === 'class' ? 1.15 : 1;
      const el = sk.riders.filter(r => (ELEMENTS as string[]).includes(r)) as Element[];
      const affB = el.length ? Math.max(...el.map(e => this.aff(e))) : 0;
      sk.power = base * (1 + (sk.rank - 1) * .2) * (1 + Math.max(0, affB - 1) * .15) * (1 + this.floor * .03);
    }
    const vit = 1 + this.aff('iron') * .05 + (c?.stat === 'vitality' ? c.amount : 0) + this.stat('life');
    const base = 1000 * w.bonus.maxHpUpgrades;
    const before = w.hero.maxHp; w.hero.maxHp = base * vit; w.hero.hp = Math.min(w.hero.maxHp, w.hero.hp + Math.max(0, w.hero.maxHp - before));
  }

  private evaluateClass(): void {
    const c = emergentClass(this.sheet, this.world.level);
    if (!c || c.id === this.cls?.id) return;
    this.cls = c; this.stats.classes++;
    const { isNew } = recordClass(c, this.floor, this.seed);
    this.hud.announce(isNew ? 'A NEW CLASS EMERGES' : 'CLASS EMERGES', `${c.name} — ${c.pattern}`);
    // The class grants its signature skill; a new class replaces the old signature in place.
    const style = c.id === 'fists+ascetic' ? 'ascetic' : c.id.split('+')[0] as Style;
    const sig = signatureSkill(c.id, c.name, style, c.boon.element);
    const w = this.world, old = this.classSkill;
    if (old) {
      this.known = this.known.filter(k => k !== old);
      const i = w.skills.indexOf(old); if (i >= 0) { w.skills[i] = sig; this.known.push(sig); } else this.learn(sig);
    } else this.learn(sig);
    this.classSkill = sig;
    this.applyPassives();
  }

  // ---------------------------------------------------------------- achievements and boxes (DCC)
  private checkAchievements(): void {
    for (const a of ACHIEVEMENTS) {
      if (this.earned.has(a.id) || !a.test(this.stats)) continue;
      this.earned.add(a.id); const first = recordEarned(a.id);
      this.boxes.push(a.box);
      this.hud.achievement(first ? 'NEW ACHIEVEMENT!' : 'ACHIEVEMENT', a.name, a.text, `Reward: ${BOX_TIERS[a.box]} Box${this.doorOpen ? '' : ' (opens when the floor is clear)'}`, BOX_COLOR[a.box]);
    }
    if (this.doorOpen && this.boxes.length) this.openBoxes();
  }

  /** The floor's safe moment: open earned boxes (loot spills at your feet), then settle full skill slots. */
  private async safeMoment(): Promise<void> {
    if (this.safeBusy) return; this.safeBusy = true;
    const st = this.stats;
    if (!this.floorHurt && this.plan.foes.length >= 3) st.flawlessFloors++;
    if (this.floorMinHp < .12) st.nearDeath++;
    this.checkAchievements();
    this.openBoxes();
    while (this.pendingSlot.length && !this.over) {
      const sk = this.pendingSlot[0], w = this.world;
      const cards = w.skills.map((x, i) => ({ icon: x!.icon, name: `Replace ${x!.name}`, text: `slot ${i + 1} · ${x!.source}` }));
      cards.push({ icon: '📖', name: 'Keep it for later', text: 'It stays learned and fills the next slot you earn' });
      const pick = await this.hud.choose(`${sk.icon} ${sk.name}`, `${sk.text} · ${sk.source} · your skill slots are full`, cards);
      this.pendingSlot.shift();
      if (pick < w.skills.length) { const old = w.skills[pick]!; w.skills[pick] = sk; w.skillCd[pick] = 0; this.hud.toast(`${sk.name} replaces ${old.name} (still learned)`, sk.color); }
    }
    this.safeBusy = false;
  }

  private openBoxes(): void {
    const h = this.world.hero;
    for (const tier of this.boxes.splice(0)) {
      this.hud.toast(`Opened a ${BOX_TIERS[tier]} Box`, BOX_COLOR[tier]);
      this.world.fx.ring(h.pos, 4, .7, Color3.FromHexString(BOX_COLOR[tier]));
      this.drop(h.pos.add(fwdOf(h.yaw).scale(1.6)), 'box', undefined, tier);
    }
  }

  // ---------------------------------------------------------------- shrine and door
  private async offerBoon(): Promise<void> {
    const g = this.plan.god!, e = g.domain;
    const pick = await this.hud.choose(`${g.name}, ${g.title}`, `The god of ${e} offers you a boon.`, [
      { icon: '✦', name: `${g.name}'s Favour`, text: `+2 ${e} affinity` },
      { icon: '☍', name: `Pact of ${g.name}`, text: `+30% damage, −20% max health (a bane for power)` },
      { icon: '✚', name: 'Mending Light', text: `Full heal, +1 ${e} affinity` },
      { icon: '✦', name: `${g.name}'s Essence`, text: `Absorb the essence of ${e}${this.essences.length >= 3 ? ' (resonates: your skills rank up)' : ''}` },
    ]);
    this.boonTaken = true; this.sheet.history.boons++;
    if (pick === 0) this.sheet.affinity[e] += 2;
    if (pick === 1) { this.world.mods.damage *= 1.3; this.world.bonus.maxHpUpgrades *= .8; }
    if (pick === 2) { this.sheet.affinity[e] += 1; this.world.hero.hp = this.world.hero.maxHp; }
    if (pick === 3) this.absorb(ELEMENT_ESSENCE[e]);
    this.applyPassives(); this.evaluateClass(); this.openDoor();
  }

  private openDoor(): void {
    this.doorOpen = true; void this.safeMoment(); if (this.doorGlow) { this.doorGlow.emissiveColor = new Color3(1, .85, .45); this.doorGlow.alpha = .7; }
    this.world.fx.ring(new Vector3(this.plan.exit.x, 0, this.plan.exit.z), 6, .9, new Color3(1, .9, .6));
    this.hud.announce('THE WAY UP IS OPEN', 'Walk through the door at the far wall');
  }

  private buildDoor(): void {
    const root = new TransformNode('tower-door', this.scene); root.position.set(this.plan.exit.x, 0, this.plan.exit.z);
    const stone = new StandardMaterial('door-stone', this.scene); stone.diffuseColor = new Color3(...this.plan.theme.wall).scale(.8); stone.specularColor = Color3.Black();
    const box = (w: number, h: number, d: number, x: number, y: number) => { const b = MeshBuilder.CreateBox('door', { width: w, height: h, depth: d }, this.scene); b.position.set(x, y, 0); b.parent = root; b.material = stone; b.isPickable = false; return b; };
    box(.7, 3.6, .9, -1.6, 1.8); box(.7, 3.6, .9, 1.6, 1.8); box(4, .7, 1, 0, 3.75);
    for (let i = 0; i < 4; i++) box(3.2, .25, .7, 0, .12 + i * .25).position.z = .6 + i * -.35;   // stair treads
    const glow = MeshBuilder.CreatePlane('door-glow', { width: 2.5, height: 3.4 }, this.scene); glow.parent = root; glow.position.set(0, 1.75, -.1); glow.isPickable = false;
    const gm = new StandardMaterial('door-glow', this.scene); gm.emissiveColor = new Color3(.08, .08, .1); gm.disableLighting = true; gm.alpha = .9; gm.backFaceCulling = false; glow.material = gm;
    this.door = root; this.doorGlow = gm;
  }

  private buildShrine(): void {
    const s = this.plan.shrine!, root = new TransformNode('shrine', this.scene); root.position.set(s.x, 0, s.z);
    const col = Color3.FromHexString(ELEMENT_COLOR[this.plan.god!.domain]);
    const stone = new StandardMaterial('shrine-stone', this.scene); stone.diffuseColor = new Color3(.75, .72, .68); stone.specularColor = Color3.Black();
    const base = MeshBuilder.CreateCylinder('shrine-base', { diameterTop: 2.2, diameterBottom: 2.8, height: .6, tessellation: 8 }, this.scene); base.parent = root; base.position.y = .3; base.material = stone;
    const pillar = MeshBuilder.CreateCylinder('shrine-pillar', { diameter: .8, height: 2.2, tessellation: 6 }, this.scene); pillar.parent = root; pillar.position.y = 1.7; pillar.material = stone;
    const orb = MeshBuilder.CreatePolyhedron('shrine-orb', { type: 1, size: .55 }, this.scene); orb.parent = root; orb.position.y = 3.3;
    const om = new StandardMaterial('shrine-orb', this.scene); om.emissiveColor = col; om.disableLighting = true; orb.material = om;
    for (const m of [base, pillar, orb] as AbstractMesh[]) m.isPickable = false;
    this.scene.onBeforeRenderObservable.add(() => { if (!orb.isDisposed()) orb.rotation.y += .02; });
    this.shrine = root;
  }

  private victory(): void {
    this.over = true;
    this.hud.message('Chrysanthus Opens', `You stand at the summit as ${this.tier}. ${this.cls?.name ?? ''}`, 'Climb again', () => { this.seed++; this.start(); });
  }

  /** For the HUD: current capability summary. */
  summary(): { tier: string; cls: string; essences: string[]; confluence: string; gear: { name: string; color: string; text: string }[]; achievements: string[]; styles: [string, number][]; affinities: [string, number][] } {
    return {
      tier: this.tier, cls: this.cls?.name ?? '—', essences: this.essences.map(e => ESSENCES[e].name), confluence: this.confluenceName,
      gear: this.worn().map(g => ({ name: g.name, color: RARITY_COLOR[g.rarity], text: describe(g) })), achievements: [...this.earned],
      styles: (Object.entries(this.sheet.style) as [string, number][]).map(([k, v]) => [k, rank(v)]),
      affinities: (Object.entries(this.sheet.affinity) as [string, number][]).filter(([, v]) => v >= .01).map(([k, v]) => [k, Math.floor(v * 10) / 10]),
    };
  }
}
