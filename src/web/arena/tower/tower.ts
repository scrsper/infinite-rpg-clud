import { Color3, Color4, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';
import type { ArenaAssets } from '../assets';
import type { ArenaHud } from '../hud';
import type { ArenaWorld, Fighter } from '../world';
import type { WeaponId } from '../combat';
import { emergentClass, newSheet, rank, recordClass, tierOf, type CapabilitySheet, type Element, type EmergedClass, type Style } from './capability';
import { planFloor, type FloorPlan, type Theme } from './floorgen';
import { ELEMENT_COLOR, QUALITY_COLOR, QUALITY_MUL, rollLoot, type Item } from './items';
import { mulberry } from '../../render/noise';

/**
 * The Tower of Chrysanthus run controller: a 100-floor roguelite climb used as a proving ground for
 * combat, loot, capability growth and emergent classes. Owns the run; the ArenaWorld owns bodies.
 */
export interface StageControl { setFloor(half: number, theme: Theme, floor: number): void }
interface Pickup { item: Item; node: TransformNode; ring: Mesh; pos: Vector3; t: number }
const SLOT_STYLE: Record<WeaponId, Style> = { fists: 'fists', greatsword: 'heavy', axe: 'blade', bow: 'bow' };

export class TowerRun {
  seed: number; floor = 0; plan!: FloorPlan;
  sheet: CapabilitySheet = newSheet();
  gear: Partial<Record<WeaponId, Item & { kind: 'weapon' }>> = {};
  armorItem: (Item & { kind: 'armor' }) | null = null;
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
    w.spellUnlocked = new Set(); w.flaskMax = 3; w.flasks = 3;
    w.setWeapon(w.hero, 'fists');
    w.onHeroHit = (t, dmg, crit) => this.onHit(t, dmg, crit);
    w.onChest = p => this.drop(p, 'chest');
    this.over = false; this.floor = 0; this.sheet = newSheet(); this.gear = {}; this.armorItem = null; this.cls = null;
    this.enter(this.startFloor);
    this.hud.announce('THE TOWER OF CHRYSANTHUS', 'Bare hands and plain cloth. Climb.');
  }

  private enter(n: number): void {
    const w = this.world;
    if (this.floor) { this.sheet.history.floors++; if (!this.weaponUsedThisFloor) this.sheet.history.noWeaponFloors++; }
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
  update(dt: number, interact: boolean): void {
    if (this.over) return;
    const w = this.world, h = w.hero;
    if (this.transition > 0) { this.transition -= dt; if (this.transition <= 0) this.enter(this.floor + 1); return; }
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
    this.sheet.history.kills++;
    this.sheet.style[SLOT_STYLE[this.world.weapon]] += 3;
    if (f.boss) { this.sheet.history.bosses++; this.drop(f.pos, 'boss'); this.hud.announce(`${f.boss.name.toUpperCase()} FALLS`); }
    else if (f.role === 'foe') this.drop(f.pos, 'enemy');
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
    const aff = (e: Element) => s.affinity[e] + (it?.element === e ? 1.5 : 0) + (this.cls?.boon.element === e ? this.cls.boon.amount : 0);
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
  drop(at: Vector3, source: 'enemy' | 'chest' | 'boss'): void {
    for (const item of rollLoot(this.floor, this.rnd, source)) this.spawnPickup(item, at.add(new Vector3((this.rnd() - .5) * 1.6, 0, (this.rnd() - .5) * 1.6)));
  }

  private spawnPickup(item: Item, pos: Vector3): void {
    const node = new TransformNode('loot', this.scene);
    const src = item.kind === 'weapon' ? item.mesh : item.kind === 'tome' ? 'W_codex-of-the-veil' : item.kind === 'potion' ? 'L_bottle_b' : 'P_crate_small';
    const m = this.assets.sources.get(src);
    if (m) { const i = m.createInstance('loot-mesh'); i.parent = node; i.isPickable = false; if (item.kind === 'weapon') { i.rotation.z = Math.PI / 2.4; i.scaling.setAll(1.1); } if (item.kind === 'armor') i.scaling.setAll(.45); if (item.kind === 'tome') i.scaling.setAll(2.2); }
    const ring = MeshBuilder.CreateDisc('loot-ring', { radius: .75, tessellation: 24 }, this.scene);
    ring.rotation.x = Math.PI / 2; ring.position.set(pos.x, .04, pos.z); ring.isPickable = false;
    const mat = new StandardMaterial('loot-ring', this.scene);
    const hex = item.kind === 'weapon' || item.kind === 'armor' ? QUALITY_COLOR[item.quality] : item.kind === 'tome' ? ELEMENT_COLOR[item.element] : '#ff6a8a';
    mat.emissiveColor = Color3.FromHexString(hex); mat.disableLighting = true; mat.alpha = .6; ring.material = mat;
    this.pickups.push({ item, node, ring, pos: pos.clone(), t: 0 });
  }

  private take(item: Item): void {
    const w = this.world;
    if (item.kind === 'weapon') {
      const cur = this.gear[item.slot as Exclude<WeaponId, 'fists'>];
      if (!cur || item.quality > cur.quality || (item.quality === cur.quality && item.element && !cur.element)) {
        this.gear[item.slot as Exclude<WeaponId, 'fists'>] = item;
        w.unlocked.add(item.slot); w.weaponMesh[item.slot] = { mesh: item.mesh, hand: item.hand }; w.weaponMul[item.slot] = QUALITY_MUL[item.quality] * this.bonus.damage;
        const first = !cur; if (first || w.weapon === item.slot) w.setWeapon(w.hero, item.slot);
        this.hud.toast(`${item.name} — Tab to draw`, QUALITY_COLOR[item.quality]);
      } else { this.hud.toast(`${item.name} (worse than yours — salvaged)`, '#888'); this.sheet.style[item.style] += 2; }
    } else if (item.kind === 'armor') {
      if (!this.armorItem || item.quality > this.armorItem.quality) { this.armorItem = item; w.armor = item.reduction; this.hud.toast(`Equipped ${item.name} (−${Math.round(item.reduction * 100)}% damage)`, QUALITY_COLOR[item.quality]); }
      else this.hud.toast(`${item.name} (worse than yours)`, '#888');
    } else if (item.kind === 'tome') {
      this.sheet.affinity[item.element] += 1; this.sheet.history.tomes++;
      this.hud.toast(`${item.name}: ${item.element} affinity ${Math.floor(this.sheet.affinity[item.element])}`, ELEMENT_COLOR[item.element]);
      this.applyPassives(); this.evaluateClass();
    } else { w.flaskMax = Math.min(5, w.flaskMax + (w.flasks >= w.flaskMax ? 1 : 0)); w.flasks = Math.min(w.flaskMax, w.flasks + 1); this.hud.toast(`${item.name}: +1 flask (Q)`, '#ff6a8a'); }
  }

  /** Swiftness and iron are passive capabilities; recompute their effect. */
  private applyPassives(): void {
    const s = this.sheet, w = this.world;
    this.bonus.speed = 1 + s.affinity.swift * .05 + (this.cls?.boon.stat === 'speed' ? this.cls.boon.amount : 0);
    this.bonus.damage = 1 + (this.cls?.boon.stat === 'damage' ? this.cls.boon.amount : 0);
    w.bonus.atkSpeed = this.bonus.speed; w.bonus.move = 1 + s.affinity.swift * .04; w.bonus.damage = this.bonus.damage;
    w.armor = Math.min(.75, (this.armorItem?.reduction ?? 0) + s.affinity.iron * .03);
    // Signs unlock from affinity (capability first): flame->Ember, storm/swift->Gust, iron->Ward, frost->Frost Sigil.
    const need: number[] = [s.affinity.flame, Math.max(s.affinity.storm, s.affinity.swift), s.affinity.iron, s.affinity.frost];
    need.forEach((v, k) => { if (v >= 1 && !w.spellUnlocked.has(k)) { w.spellUnlocked.add(k); this.hud.toast(`New sign: ${['Ember', 'Gust', 'Ward', 'Frost Sigil'][k]} (key ${k + 1})`, '#ffd45c'); } w.spellPower[k] = 1 + Math.max(0, v - 1) * .25; });
    const vit = 1 + s.affinity.iron * .05 + (this.cls?.boon.stat === 'vitality' ? this.cls.boon.amount : 0);
    const base = 1000 * w.bonus.maxHpUpgrades;
    const before = w.hero.maxHp; w.hero.maxHp = base * vit; w.hero.hp = Math.min(w.hero.maxHp, w.hero.hp + Math.max(0, w.hero.maxHp - before));
  }

  private evaluateClass(): void {
    const c = emergentClass(this.sheet, this.world.level);
    if (!c || c.id === this.cls?.id) return;
    this.cls = c;
    const { isNew } = recordClass(c, this.floor, this.seed);
    this.hud.announce(isNew ? 'A NEW CLASS EMERGES' : 'CLASS EMERGES', `${c.name} — ${c.pattern}`);
    this.applyPassives();
  }

  // ---------------------------------------------------------------- shrine and door
  private async offerBoon(): Promise<void> {
    const g = this.plan.god!, e = g.domain;
    const pick = await this.hud.choose(`${g.name}, ${g.title}`, `The god of ${e} offers you a boon.`, [
      { icon: '✦', name: `${g.name}'s Favour`, text: `+2 ${e} affinity` },
      { icon: '☍', name: `Pact of ${g.name}`, text: `+30% damage, −20% max health (a bane for power)` },
      { icon: '✚', name: 'Mending Light', text: `Full heal, +1 ${e} affinity` },
    ]);
    this.boonTaken = true; this.sheet.history.boons++;
    if (pick === 0) this.sheet.affinity[e] += 2;
    if (pick === 1) { this.world.mods.damage *= 1.3; this.world.bonus.maxHpUpgrades *= .8; }
    if (pick === 2) { this.sheet.affinity[e] += 1; this.world.hero.hp = this.world.hero.maxHp; }
    this.applyPassives(); this.evaluateClass(); this.openDoor();
  }

  private openDoor(): void {
    this.doorOpen = true; if (this.doorGlow) { this.doorGlow.emissiveColor = new Color3(1, .85, .45); this.doorGlow.alpha = .7; }
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
  summary(): { tier: string; cls: string; styles: [string, number][]; affinities: [string, number][] } {
    return {
      tier: this.tier, cls: this.cls?.name ?? '—',
      styles: (Object.entries(this.sheet.style) as [string, number][]).map(([k, v]) => [k, rank(v)]),
      affinities: (Object.entries(this.sheet.affinity) as [string, number][]).filter(([, v]) => v >= .01).map(([k, v]) => [k, Math.floor(v * 10) / 10]),
    };
  }
}
