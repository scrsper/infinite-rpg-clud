import { Color3, Color4, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';
import type { ArenaAssets } from '../assets';
import type { ArenaHud } from '../hud';
import type { ArenaWorld, Fighter } from '../world';
import type { WeaponId } from '../combat';
import { ELEMENTS, TIERS, emergentClass, newSheet, rank, recordClass, tierOf, type CapabilitySheet, type Element, type EmergedClass, type Style } from './capability';
import { planFloor, type FloorPlan, type Theme } from './floorgen';
import { ELEMENT_COLOR, RARITY_COLOR, describe, rollElementTome, rollLoot, rollTreatise, type Gear, type Item, type Source } from './items';
import { ALL_ELEMENTS, ALL_FORMS, ELEMENT_INFO, FORMS, POTIONS, spellFor, type Form } from '../magic';
import { ChrysanthusTrial } from './chrysanthus';
import { ESSENCES, MAX_SLOTS, SLOTS_BY_TIER, cloneSkill, confluence, signatureSkill, type Essence, type SkillDef } from './skills';
import { ACHIEVEMENTS, BOX_COLOR, BOX_TIERS, newStats, recordEarned, type RunStats } from './achievements';
import { mulberry } from '../../render/noise';
import { readCheckpoint,writeCheckpoint,endCheckpoint,downloadCheckpoint,type TowerCheckpoint } from './checkpoint';

/**
 * The Tower of Chrysanthus run controller: a 100-floor roguelite climb used as a proving ground for
 * combat, loot, capability growth and emergent classes. Owns the run; the ArenaWorld owns bodies.
 */
export interface StageControl { setFloor(half: number, theme: Theme, floor: number): void }
interface Pickup { item: Item; node: TransformNode; ring: Mesh; pos: Vector3; t: number }
const ELEMENT_ESSENCE: Record<Element, Essence> = { flame: 'fire', frost: 'ice', storm: 'storm', swift: 'swift', iron: 'iron', shadow: 'shadow', verdance: 'life', water: 'water', gravity: 'gravity', time: 'time' };
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
  /** Magic: the potion belt (V drinks the first), the god's trial on floor 10 (and his true form at the summit). */
  belt: Extract<Item, { kind: 'elixir' }>[] = [];
  trial: ChrysanthusTrial | null = null; private talking = false; extraSlots = 0;
  cls: EmergedClass | null = null;
  doorOpen = false; shrineReady = false; boonTaken = false;
  private pickups: Pickup[] = [];
  private door: TransformNode | null = null; private doorGlow: StandardMaterial | null = null; private shrine: TransformNode | null = null;
  private rnd: ReturnType<typeof mulberry>;
  runId: string = crypto.randomUUID(); climberId: string = crypto.randomUUID();
  /** Hall and explicit floor previews cannot replace a real expedition. */
  persistent = true; private restoring = false; private saveWarning = false;
  private weaponUsedThisFloor = false;
  private transition = 0;
  over = false;
  bonus = { damage: 1, speed: 1, vitality: 1 };

  constructor(private readonly scene: Scene, private readonly world: ArenaWorld, private readonly hud: ArenaHud, private readonly assets: ArenaAssets, private readonly stage: StageControl, seed: number) {
    this.seed = seed; this.rnd = mulberry(seed ^ 0x5eed);
  }

  /** Dev/testing: begin the climb on a later floor. */
  startFloor = 1;

  /** Entry UI keeps old data until the player explicitly chooses a new expedition. */
  async launch(): Promise<void> {
    if (!this.persistent) { this.start(); return; }
    const saved = readCheckpoint();
    if (saved.status === 'empty') { this.start(); return; }
    if (saved.status === 'ready') {
      const pick = await this.hud.choose('Tower of Chrysanthus', `Expedition checkpoint: floor ${saved.checkpoint.floor}. Continue restarts this floor with its saved equipment and capabilities.`, [
        { icon: '↗', name: 'Continue climb', text: `Floor ${saved.checkpoint.floor} · seed ${saved.checkpoint.seed}` },
        { icon: '+', name: 'New climb', text: 'Replace this expedition checkpoint. Lifetime discoveries remain.' },
      ]);
      if (pick === 0) { this.resume(saved.checkpoint); return; }
    } else {
      const pick = await this.hud.choose('Expedition recovery', saved.message, [
        { icon: '↓', name: 'Download saved data', text: 'Keep a recovery copy before replacing it.' },
        { icon: '+', name: 'New climb', text: 'Explicitly replace this Tower checkpoint. Other saves remain untouched.' },
      ]);
      if (pick === 0) { downloadCheckpoint(); await this.launch(); return; }
    }
    this.start();
  }

  start(): void {
    const w = this.world;
    // Practice gains belong to its demonstration body, never to a real expedition.
    if (this.plan?.kind === 'hall' && this.persistent) { w.level = 1; w.xp = 0; w.nextXp = 100; w.mods = { damage: 1, atkSpeed: 1, move: 1, regen: 1, range: 1 }; w.bonus = { damage: 1, atkSpeed: 1, move: 1, maxHpUpgrades: 1 }; }
    this.runId = crypto.randomUUID(); this.climberId = crypto.randomUUID(); this.rnd = mulberry(this.seed ^ 0x5eed); this.transition = 0; this.safeBusy = false;
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
    this.belt = []; this.extraSlots = 0; this.trial?.dispose(); this.trial = null; this.talking = false;
    w.imbue = null; w.weaponImbue = {}; w.potion = { haste: 0, might: 0, stone: 0, clarity: 0 }; w.manaControl = 0; w.hero.mana = w.hero.maxMana = 100; w.spareHero = null;
    this.hud.magic = this.magicView();
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
    this.trial?.dispose(); this.trial = null; this.talking = false; w.spareHero = null;
    w.ley = this.plan.ley;
    if (this.plan.ley) {
      const L = ELEMENT_INFO[this.plan.ley];
      setTimeout(() => this.hud.toast(`Scholars' note: ${L.name} output measured +35% on this floor. The faithful say the tower favours it.`, L.color), 2500);
    }
    if (this.plan.kind === 'hall') this.setupHall();
    if (this.plan.kind === 'avatar') {
      this.trial = new ChrysanthusTrial(this.scene, w, this.hud, this.assets);
      this.trial.begin(new Vector3(0, 0, -2));
      w.spareHero = () => this.trial?.spare();
      this.trial.onDone = r => void this.trialReward(r);
    }
    if (this.plan.kind === 'summit') {
      const god = w.fighters.find(f => f.foeKind === 'chrysanthus');
      if (god) { this.trial = new ChrysanthusTrial(this.scene, w, this.hud, this.assets, true); this.trial.begin(god.pos.clone(), god); }
    }
    this.doorOpen = false; this.shrineReady = false; this.boonTaken = false; this.weaponUsedThisFloor = w.weapon !== 'fists';
    const label = this.plan.kind === 'avatar' ? 'THE TENTH FLOOR' : this.plan.kind === 'hall' ? 'THE PROVING HALL' : this.plan.kind === 'boss' ? 'BOSS FLOOR' : this.plan.kind === 'shrine' ? `SHRINE OF ${this.plan.god!.name.toUpperCase()}` : this.plan.kind === 'summit' ? 'THE SUMMIT' : this.plan.theme.name.toUpperCase();
    if (n > 1 || n === 0) this.hud.announce(n === 0 ? 'THE PROVING HALL' : `FLOOR ${n}`, `${label} · ${this.plan.objective}`);
    if (!this.restoring) this.evaluateClass();
    if (!this.restoring) this.saveCheckpoint();
  }

  private saveCheckpoint(): void {
    if (!this.persistent || this.floor < 1 || this.over) return;
    const w = this.world, h = w.hero;
    const checkpoint: TowerCheckpoint = {
      version: 1, kind: 'floor-start', runId: this.runId, climberId: this.climberId, savedAt: new Date().toISOString(), seed: this.seed, floor: this.floor, randomState: this.rnd.state(),
      sheet: this.sheet, gear: this.gear, armor: this.armorItem, charm: this.charm, known: this.known, slots: w.skills.map(k => k?.id ?? null), pending: this.pendingSlot.map(k => k.id), classSkill: this.classSkill?.id ?? null, cls: this.cls,
      essences: this.essences, confluence: this.confluenceName, scrolls: this.scrolls, stats: this.stats, earned: [...this.earned], boxes: this.boxes, belt: this.belt, extraSlots: this.extraSlots, tierIdx: this.tierIdx, flaskBase: this.flaskBase,
      world: { level: w.level, xp: w.xp, nextXp: w.nextXp, mods: w.mods, bonus: w.bonus, weapon: w.weapon, hp: h.hp, energy: h.energy, mana: h.mana, flasks: w.flasks, cooldowns: w.skillCd, weaponImbue: w.weaponImbue, imbue: w.imbue, potion: w.potion, wardHp: w.wardHp, wardT: w.wardT, time: w.time },
    };
    h.inst.root.metadata = { ...h.inst.root.metadata, climberId: this.climberId, runId: this.runId };
    if (!writeCheckpoint(checkpoint) && !this.saveWarning) { this.saveWarning = true; this.hud.toast('Checkpoint could not be saved. Keep this tab open; your existing saved data is retained.', '#ffba80'); }
  }

  /** Restore at a floor boundary, with skills reconnected by identity instead of duplicated slot copies. */
  private resume(saved: TowerCheckpoint): void {
    const data: TowerCheckpoint = JSON.parse(JSON.stringify(saved));
    // Rebuild the saved floor, then restore the climb's base start floor: a later death retry begins a new climb there.
    const base = this.startFloor; this.restoring = true; this.seed = data.seed; this.startFloor = data.floor; this.start(); this.startFloor = base;
    this.runId = data.runId; this.climberId = data.climberId; this.sheet = data.sheet; this.gear = data.gear; this.armorItem = data.armor; this.charm = data.charm;
    this.known = data.known; const skill = (id: string | null) => this.known.find(k => k.id === id) ?? null;
    this.pendingSlot = data.pending.map(id => skill(id)!); this.classSkill = skill(data.classSkill); this.cls = data.cls; this.essences = data.essences as Essence[]; this.confluenceName = data.confluence; this.scrolls = data.scrolls;
    this.stats = data.stats; this.earned = new Set(data.earned); this.boxes = data.boxes; this.belt = data.belt; this.extraSlots = data.extraSlots; this.tierIdx = data.tierIdx; this.flaskBase = data.flaskBase;
    const w = this.world, h = w.hero, v = data.world;
    w.level = v.level; w.xp = v.xp; w.nextXp = v.nextXp; w.mods = v.mods; w.bonus = v.bonus; w.unlocked = new Set<WeaponId>(['fists', ...Object.keys(this.gear) as WeaponId[]]);
    w.weaponMesh = {}; for (const [slot,g] of Object.entries(this.gear)) if (g) w.weaponMesh[slot as WeaponId] = { mesh: g.mesh, hand: g.hand };
    w.setWeapon(h,v.weapon); w.skills = data.slots.map(skill); w.skillCd = v.cooldowns; w.weaponImbue = v.weaponImbue; w.imbue = v.imbue; w.potion = v.potion; w.wardHp = v.wardHp; w.wardT = v.wardT; w.time = v.time;
    this.applyPassives(); h.hp = Math.min(h.maxHp,v.hp); h.hpShown = h.hp; h.energy = v.energy; h.mana = Math.min(h.maxMana,v.mana); w.flasks = Math.min(w.flaskMax,v.flasks); this.rnd.restore(data.randomState);
    this.lastWeapon = v.weapon; this.restoring = false; h.inst.root.metadata = { ...h.inst.root.metadata, climberId: this.climberId, runId: this.runId };
    this.hud.announce('EXPEDITION CONTINUED', `Floor ${this.floor} · your last floor-boundary checkpoint`);
  }

  // ---------------------------------------------------------------- frame
  update(dt: number, interact: boolean, scroll = false, drink = false): void {
    if (this.over) return;
    const w = this.world, h = w.hero;
    if (this.transition > 0) { this.transition -= dt; if (this.transition <= 0) this.enter(this.floor + 1); return; }
    if (drink) this.drink();
    if (this.trial?.phase === 'talk' && !this.talking && !this.hud.modalOpen) { this.talking = true; void this.trial.converse(this.trialContext()); }
    if (scroll && this.scrolls.length && w.castNow(this.scrolls[0])) { const sc = this.scrolls.shift()!; this.stats.scrolls++; this.hud.toast(`Read ${sc.name}`, '#c9a35a'); }
    if (h.lastHurt !== this.lastHurt) { this.lastHurt = h.lastHurt; this.floorHurt = true; }
    this.floorMinHp = Math.min(this.floorMinHp, h.hp / h.maxHp);
    this.stats.bestCombo = Math.max(this.stats.bestCombo, w.combo.hits); this.stats.smashed = w.smashed;
    if (w.weapon !== this.lastWeapon) { this.lastWeapon = w.weapon; this.applyPassives(); }
    if (this.plan.kind !== 'hall' && (this.achT -= dt) <= 0) { this.achT = .5; this.checkAchievements(); this.checkTier(); }
    const foes = w.fighters.filter(f => f.role === 'foe' && f.alive && f.foeKind !== 'dummy');
    if (!this.doorOpen && foes.length === 0) {
      if (this.plan.shrine && !this.boonTaken) { if (!this.shrineReady) { this.shrineReady = true; this.hud.announce(`${this.plan.god!.name.toUpperCase()} WATCHES`, 'Approach the shrine and press E'); } }
      else this.openDoor();
    }
    if (this.shrineReady && !this.boonTaken && this.plan.shrine && Vector3.Distance(h.pos, new Vector3(this.plan.shrine.x, 0, this.plan.shrine.z)) < 3 && interact && !this.hud.modalOpen) void this.offerBoon();
    if (this.doorOpen && Math.hypot(h.pos.x - this.plan.exit.x, h.pos.z - this.plan.exit.z) < 2.2) {
      if (this.floor >= 100) { this.victory(); return; }
      if (this.plan.kind === 'hall') { this.hud.closeModal(); this.startFloor = 1; this.persistent = true; this.transition = 999999; void this.launch(); return; }
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
    this.over = true; if (this.persistent) endCheckpoint(this.runId);
    const c = this.cls ? `${this.cls.name} (${this.cls.pattern})` : 'no class emerged';
    setTimeout(() => this.hud.message(`Fallen on Floor ${this.floor}`, `${this.tier} · ${c} · ${this.sheet.history.kills} foes · ${this.sheet.history.bosses} bosses`, 'Begin a new climb', () => {
      this.seed = (this.seed * 48271 + 11) % 2147483647; this.rnd = mulberry(this.seed ^ 0x5eed); this.start();
    }), 900);
  }

  /** Affinities act on every landed hero blow. Use also slowly trains the affinity (capability grows with practice). */
  private onHit(t: Fighter, dmg: number, crit: boolean): void {
    this.trial?.onHeroHit(t);
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
    if (this.plan?.kind === 'hall') return;
    // Magic begins early: the first chest or boss that finds you without a form or an element gives you one.
    if (source !== 'enemy' && this.floor >= 1) {
      if (!this.sheet.forms.length) this.spawnPickup(rollTreatise(this.rnd), at.add(new Vector3(.8, 0, .4)));
      else if (!ALL_ELEMENTS.some(e => this.aff(e) >= 1)) this.spawnPickup(rollElementTome(this.rnd), at.add(new Vector3(-.8, 0, .4)));
    }
    for (const item of rollLoot(this.floor, this.rnd, source, foeKind, boxTier)) this.spawnPickup(item, at.add(new Vector3((this.rnd() - .5) * 1.8, 0, (this.rnd() - .5) * 1.8)));
  }

  private itemColor(item: Item): string {
    return item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'charm' ? RARITY_COLOR[item.rarity] : item.kind === 'book' ? ELEMENT_COLOR[item.element]
      : item.kind === 'essence' ? ESSENCES[item.essence].color : item.kind === 'scroll' ? '#c9a35a' : item.kind === 'treatise' ? '#ffd76a' : item.kind === 'rune' ? ELEMENT_COLOR[item.element] : item.kind === 'elixir' ? (item.element ? ELEMENT_COLOR[item.element] : POTIONS[item.potion].color) : '#ff6a8a';
  }

  private spawnPickup(item: Item, pos: Vector3): void {
    const node = new TransformNode('loot', this.scene), hex = this.itemColor(item), col = Color3.FromHexString(hex);
    const glow = (m: Mesh) => { const mt = new StandardMaterial('loot-glow', this.scene); mt.emissiveColor = col; mt.disableLighting = true; m.material = mt; m.parent = node; m.isPickable = false; };
    const src = item.kind === 'weapon' ? item.mesh : item.kind === 'book' || item.kind === 'treatise' ? 'W_codex-of-the-veil' : item.kind === 'potion' || item.kind === 'elixir' ? 'L_bottle_b' : item.kind === 'armor' ? 'P_crate_small' : '';
    const m = src ? this.assets.sources.get(src) : undefined;
    if (m) { const i = m.createInstance('loot-mesh'); i.parent = node; i.isPickable = false; if (item.kind === 'weapon') { i.rotation.z = Math.PI / 2.4; i.scaling.setAll(1.1); } if (item.kind === 'armor') i.scaling.setAll(.45); if (item.kind === 'book' || item.kind === 'treatise') i.scaling.setAll(2.2); }
    else if (item.kind === 'essence') glow(MeshBuilder.CreatePolyhedron('essence', { type: 2, size: .3 }, this.scene));
    else if (item.kind === 'scroll') { const c = MeshBuilder.CreateCylinder('scroll', { diameter: .16, height: .6, tessellation: 8 }, this.scene); c.rotation.z = Math.PI / 2; glow(c); }
    else if (item.kind === 'charm') glow(MeshBuilder.CreateTorus('charm', { diameter: .45, thickness: .09, tessellation: 16 }, this.scene));
    else if (item.kind === 'rune') glow(MeshBuilder.CreatePolyhedron('rune', { type: 1, size: .26 }, this.scene));
    if (m && (item.kind === 'treatise' || item.kind === 'elixir')) node.scaling.setAll(item.kind === 'treatise' ? 1 : 1.3);
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
      this.hud.toast(`${item.name}: ${ELEMENT_INFO[item.element].name} affinity ${Math.floor(this.sheet.affinity[item.element])}`, ELEMENT_COLOR[item.element]);
    } else if (item.kind === 'treatise') {
      if (!this.sheet.forms.includes(item.form)) { this.sheet.forms.push(item.form); this.hud.toast(`${item.name}: you can shape mana as a ${FORMS[item.form].name}`, '#ffd76a'); }
      else { this.sheet.manaControl += .5; this.hud.toast(`${item.name} (known): mana control deepens`, '#ffd76a'); }
    } else if (item.kind === 'rune') {
      w.weaponImbue[w.weapon] = item.element;
      this.hud.toast(`${item.name} sinks into your ${w.weapon === 'fists' ? 'fists' : 'weapon'}: every blow carries ${ELEMENT_INFO[item.element].name}`, ELEMENT_COLOR[item.element]);
    } else if (item.kind === 'elixir') {
      if (this.belt.length >= 5) { this.hud.toast(`${item.name} (belt full)`, '#888'); return; }
      this.belt.push(item); this.hud.toast(`${item.name} on your belt — V to drink`, POTIONS[item.potion].color);
    } else if (item.kind === 'scroll') {
      if (this.scrolls.length >= 5) { this.hud.toast(`${item.name} (scroll pocket full)`, '#888'); return; }
      this.scrolls.push(item.skill); this.hud.toast(`${item.name} — press G to read`, '#c9a35a');
    } else if (item.kind === 'essence') this.absorb(item.essence);
    else if (item.kind !== 'potion') { /* handled above */ }
    else { this.flaskBase = Math.min(5, this.flaskBase + (w.flasks >= w.flaskMax ? 1 : 0)); w.flasks = Math.min(w.flaskMax + 1, w.flasks + 1); this.hud.toast(`${item.name}: +1 flask (Q)`, '#ff6a8a'); }
    this.applyPassives(); this.evaluateClass(); this.discoverSpells();
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
    const n = Math.min(MAX_SLOTS, SLOTS_BY_TIER[ti] + (this.confluenceName ? 1 : 0) + this.extraSlots);
    if (n <= w.skills.length) return;
    while (w.skills.length < n) w.skills.push(null);
    if (grew) this.hud.announce(`TIER: ${this.tier.toUpperCase()}`, `Skill slots: ${n}`);
    for (let i = 0; i < w.skills.length; i++) if (!w.skills[i]) { const next = this.pendingSlot.shift() ?? this.known.find(k => !w.skills.includes(k)); if (next) w.skills[i] = next; }
  }

  private onCast(sk: SkillDef): boolean {
    this.stats.skillCasts++;
    if (sk.mana) { this.sheet.manaControl += .03; if (Math.floor(this.sheet.manaControl * 10) % 10 === 0 && this.sheet.manaControl > .9) this.applyPassives(); }
    // Practice is capability: casting trains the skill's element.
    for (const r of sk.riders) if ((ELEMENTS as string[]).includes(r)) this.sheet.affinity[r as Element] += .01;
    if (sk.uses % 25 === 0) { sk.rank++; this.hud.toast(`${sk.name} ranks up through use (${sk.rank})`, sk.color); this.applyPassives(); }
    return this.powers().has('echo') && this.rnd() < .3;
  }

  private onParry(): void {
    this.stats.parries++;
    if (this.powers().has('bulwark')) { this.world.wardHp = Math.max(this.world.wardHp, 160 * this.dmgScale()); this.world.wardT = 6; }
  }

  // ---------------------------------------------------------------- magic
  /**
   * Spells emerge: every element held at affinity 1 or more, crossed with every form learned, is a spell the climber
   * now knows (an insight). They join the Spellbook (B); they fill an empty slot if there is one.
   */
  private discoverSpells(): void {
    const w = this.world, found: SkillDef[] = [];
    for (const e of ALL_ELEMENTS) {
      if (this.aff(e) < 1) continue;
      for (const f of this.sheet.forms as Form[]) {
        const id = `sp:${e}:${f}`;
        if (this.known.some(k => k.id === id)) continue;
        const sp = spellFor(e, f); this.known.push(sp); found.push(sp);
        const free = w.skills.indexOf(null); if (free >= 0) w.skills[free] = sp;
      }
    }
    if (!found.length) return;
    this.applyPassives();
    const first = found[0];
    this.hud.announce(found.length > 1 ? `${found.length} NEW SPELLS` : 'INSIGHT', found.length > 1 ? `${found.slice(0, 4).map(f => f.name).join(' · ')}${found.length > 4 ? ' …' : ''} — B for the Spellbook` : `${ELEMENT_INFO[first.element!].name} shaped as a ${FORMS[first.form as Form].name}: ${first.name} — B for the Spellbook`);
  }

  /** Assign a known skill or spell to a slot (Spellbook). */
  assign(slot: number, sk: SkillDef): void {
    const w = this.world, at = w.skills.indexOf(sk);
    if (at >= 0 && at !== slot) w.skills[at] = w.skills[slot];
    w.skills[slot] = sk; w.skillCd[slot] = 0;
  }

  /** V: drink the first potion on the belt. */
  drink(): void {
    const w = this.world, p = this.belt.shift(); if (!p) return;
    const P = POTIONS[p.potion], h = w.hero;
    if (p.potion === 'mana') h.mana = Math.min(h.maxMana, h.mana + h.maxMana * .6);
    else if (p.potion === 'elemental' && p.element) w.imbue = { e: p.element, t: P.seconds, p: 1 };
    else if (p.potion !== 'elemental') w.potion[p.potion] = P.seconds;
    w.vfx.burst(p.element ?? (p.potion === 'mana' ? 'water' : p.potion === 'haste' ? 'swift' : p.potion === 'stone' ? 'iron' : p.potion === 'clarity' ? 'time' : 'flame'), h.pos.add(new Vector3(0, 1.2, 0)), .8);
    this.hud.toast(`${p.name}: ${P.text}`, P.color); w.sound('level', .4);
  }

  /** What the HUD's Spellbook and belt show. */
  private magicView(): NonNullable<ArenaHud['magic']> {
    const t = this;   // eslint-disable-line @typescript-eslint/no-this-alias
    return {
      get belt() { return t.belt.map(b => ({ icon: POTIONS[b.potion].icon, name: b.name, color: b.element ? ELEMENT_COLOR[b.element] : POTIONS[b.potion].color })); },
      get spells() { return t.known; }, get ley() { return t.world.ley; }, get forms() { return t.sheet.forms; },
      affinity: (e: Element) => t.aff(e), get manaControl() { return t.sheet.manaControl; },
    };
  }

  /** The Proving Hall: every element and form, a full belt, runestones to try, and dummies that mend themselves. */
  private setupHall(): void {
    const w = this.world, s = this.sheet;
    for (const e of ALL_ELEMENTS) s.affinity[e] = Math.max(s.affinity[e], 1.5);
    for (const f of ALL_FORMS) if (!s.forms.includes(f)) s.forms.push(f);
    s.manaControl = Math.max(s.manaControl, 8);
    this.extraSlots = Math.max(this.extraSlots, 7); this.tierIdx = -1; this.checkTier(true);
    this.discoverSpells();
    // A demonstration set across the slots: one of each form, several elements.
    const pick = ['sp:flame:bolt', 'sp:water:wave', 'sp:storm:bolt', 'sp:frost:nova', 'sp:gravity:field', 'sp:time:field', 'sp:swift:step'];
    pick.forEach((id, i) => { const sp = this.known.find(k => k.id === id); if (sp && i < w.skills.length) w.skills[i] = sp; });
    w.hero.maxMana = 400; w.hero.mana = 400;
    this.belt = (['mana', 'haste', 'might', 'stone', 'clarity'] as const).map((k, i) => ({ kind: 'elixir' as const, id: `hall-elixir-${i}`, name: POTIONS[k].name, potion: k }));
    const runes: Element[] = ['flame', 'frost', 'storm', 'water', 'gravity', 'time'];
    runes.forEach((e, i) => this.spawnPickup({ kind: 'rune', id: `hall-rune-${i}`, name: `Runestone of ${ELEMENT_INFO[e].name}`, element: e }, new Vector3(-10 + i * 4, 0, 14)));
    for (const d of w.fighters.filter(f => f.foeKind === 'dummy')) {
      d.yaw = 0; d.anim.play('sword_and_shield/sword and shield idle', { loop: true, fade: 0 });
      w.customAI.set(d, f => { if (f.state === 'hit') f.state = 'idle'; if (f.hp < f.maxHp * .3 && f.frozenT <= 0) { f.hp = f.maxHp; w.vfx.burst('verdance', f.pos.add(new Vector3(0, 1, 0)), .6); } f.vel.scaleInPlace(.5); return true; });
    }
    setTimeout(() => this.hud.toast('The Proving Hall: every element and form is yours here. B opens the Spellbook; runestones lie by the north wall; V drinks.', '#ffd76a'), 2600);
    this.applyPassives();
  }

  private trialContext() {
    const f = this.known.filter(k => k.source === 'spell').map(k => ELEMENT_INFO[k.element!].name);
    return { cls: this.cls?.name ?? null, tier: this.tier, kills: this.stats.kills, essences: this.essences.map(e => ESSENCES[e].name), legendary: this.worn().find(g => g.rarity >= 3)?.name ?? null,
      elements: [...new Set(f)], achievements: this.earned.size, fistsOnly: !Object.keys(this.gear).length, floor: this.floor };
  }

  /** The god yields: his gift, then he leaves and the stair opens. */
  private async trialReward(r: { blows: number; dodged: number; spared: boolean; seconds: number }): Promise<void> {
    const pick = await this.hud.choose('The Gift of Chrysanthus', r.spared ? 'He caught you as you fell. Still, he offers a gift.' : `${r.blows} blows landed · ${r.dodged} verdicts avoided · ${r.seconds}s`, [
      { icon: '⏳', name: 'The Unwound Hour', text: 'Time affinity +1: the magic of time, which only he teaches' },
      { icon: '✦', name: 'A Seat at My Table', text: 'One more skill slot, for good' },
      { icon: '📜', name: 'Two Lessons', text: 'Learn two forms of shaping mana you do not yet know' },
    ]);
    if (pick === 0) this.sheet.affinity.time += 1;
    if (pick === 1) { this.extraSlots++; this.checkTier(true); }
    if (pick === 2) for (let k = 0; k < 2; k++) { const left = ALL_FORMS.filter(f => !this.sheet.forms.includes(f)); if (left.length) this.sheet.forms.push(left[Math.floor(this.rnd() * left.length)]); else this.sheet.manaControl += 1; }
    if (!r.spared) this.boxes.push(r.blows >= 20 ? 4 : r.blows >= 10 ? 3 : 2);
    this.stats.bosses++;
    this.applyPassives(); this.discoverSpells();
    this.trial?.depart();
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
    w.manaControl = s.manaControl;
    const maxMana = 100 + s.manaControl * 8 + ALL_ELEMENTS.reduce((a, e) => a + Math.min(4, this.aff(e)), 0) * 4;
    if (Math.abs(maxMana - w.hero.maxMana) > .5) { w.hero.mana += Math.max(0, maxMana - w.hero.maxMana); w.hero.maxMana = maxMana; w.hero.mana = Math.min(w.hero.mana, maxMana); }
    const vit = 1 + this.aff('iron') * .05 + (c?.stat === 'vitality' ? c.amount : 0) + this.stat('life');
    const base = 1000 * w.bonus.maxHpUpgrades;
    const before = w.hero.maxHp; w.hero.maxHp = base * vit; w.hero.hp = Math.min(w.hero.maxHp, w.hero.hp + Math.max(0, w.hero.maxHp - before));
  }

  private evaluateClass(): void {
    if (this.plan?.kind === 'hall') return;
    const c = emergentClass(this.sheet, this.world.level);
    if (!c || c.id === this.cls?.id) return;
    this.cls = c; this.stats.classes++;
    const { isNew } = recordClass(c, this.floor, this.seed, `${this.runId}:${this.floor}:${c.id}`);
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
    if (this.plan?.kind === 'hall') return;
    for (const a of ACHIEVEMENTS) {
      if (this.earned.has(a.id) || !a.test(this.stats)) continue;
      this.earned.add(a.id); const first = recordEarned(a.id, `${this.runId}:${a.id}`);
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
    this.over = true; if (this.persistent) endCheckpoint(this.runId);
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
