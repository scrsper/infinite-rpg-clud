import type { LookId } from './looks';

/**
 * Attack and fighter data for the Combat Arena. Times are in clip seconds (speed 1); `speed` scales
 * playback, so a 1.3 s clip at speed 1.3 resolves in 1.0 s of game time.
 *
 * Motion is the user's Mixamo packs (Great Sword, Sword and Shield, Pro Longbow, Locomotion),
 * retargeted onto the MPFB people. Active windows come from the measured hand-speed peaks
 * (scripts/web/arena-clipinfo.ts -> .debug/arena/clipinfo.json), padded slightly for game feel.
 */
export interface AttackDef {
  clip: string;
  speed: number;
  /** Clip-time window in which the swing connects. */
  active: [number, number];
  /** Clip time from which a buffered follow-up starts. */
  cancel: number;
  /** Clip time at which the action ends (defaults to the clip's length). */
  end?: number;
  range: number;
  /** Half-angle of the swing arc, radians. */
  arc: number;
  damage: number;
  knock: number;
  /** Forward travel during wind-up and swing. */
  lunge: number;
  /** Re-hit interval for spinning attacks. */
  multi?: number;
  /** Breaks guards and shields, launches the dying. */
  heavy?: boolean;
  hitstop: number;
  shake: number;
  /** Movement speed allowed while the attack plays (whirlwinds). */
  move?: number;
  /** State label shown in the debug overlay. */
  label?: string;
}

/** The clips one way of fighting moves with. */
export interface Moveset { idle: string; walk: string; run: string; hit: string[]; death: string[]; block: string; guard: string; enter: string; runPace: number }
const GS = (n: string) => `great_sword/great sword ${n}`, SS = (n: string) => `sword_and_shield/sword and shield ${n}`, BOW = (n: string) => `pro_longbow/standing ${n}`;
export const MOVESETS: Record<'greatsword' | 'sword' | 'bow' | 'caster', Moveset> = {
  greatsword: { idle: GS('idle'), walk: GS('walk'), run: GS('run'), hit: [GS('impact'), GS('impact (3)'), GS('impact (5)')], death: ['great_sword/two handed sword death', 'great_sword/two handed sword death (2)'],
    block: GS('blocking'), guard: GS('idle (2)'), enter: GS('power up'), runPace: 6.2 },
  sword: { idle: SS('idle'), walk: SS('walk'), run: SS('run'), hit: [SS('impact'), SS('impact (2)'), SS('impact (3)')], death: [SS('death'), SS('death (2)')],
    block: SS('block'), guard: SS('block idle'), enter: SS('power up'), runPace: 6 },
  bow: { idle: BOW('idle 01'), walk: BOW('walk forward'), run: BOW('run forward'), hit: [BOW('react small from front'), BOW('react small from headshot')], death: [BOW('death backward 01'), BOW('death forward 01')],
    block: BOW('block'), guard: BOW('aim overdraw'), enter: BOW('equip bow'), runPace: 6.2 },
  caster: { idle: 'female_locomotion/idle', walk: 'female_locomotion/walking', run: 'female_locomotion/running', hit: [BOW('react small from front')], death: [SS('death (2)')],
    block: BOW('block'), guard: 'great_sword/spell cast', enter: 'sword_and_shield/sword and shield casting (2)', runPace: 6 },
};
/** Evasive rolls/steps for anyone, by direction relative to facing. */
export const DODGES = { forward: BOW('dodge forward'), back: BOW('dodge backward'), left: BOW('dodge left'), right: BOW('dodge right') };

export type WeaponId = 'greatsword' | 'axe' | 'bow';
export interface WeaponDef {
  id: WeaponId; name: string; key: string; set: keyof typeof MOVESETS;
  combo: AttackDef[];
  /** Held secondary: whirlwind, guard, or aimed shot. */
  secondary: 'spin' | 'guard' | 'aim';
  spin?: AttackDef;
  bash?: AttackDef;
  aimed?: AttackDef;
  attach?: { r?: string; l?: string };
  trail: number;
}

const D = Math.PI / 180;
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  greatsword: {
    id: 'greatsword', name: 'Oathbreaker', key: '1', set: 'greatsword', secondary: 'spin', attach: { r: 'W_oathbreaker' }, trail: 1.75,
    combo: [
      { clip: GS('slash'), speed: 1.3, active: [0.42, 0.84], cancel: 0.86, end: 1.12, range: 3.6, arc: 95 * D, damage: 32, knock: 4, lunge: 1.2, hitstop: .06, shake: .2, label: 'Attacking' },
      { clip: GS('slash (4)'), speed: 1.4, active: [0.26, 0.86], cancel: 0.9, end: 1.3, range: 3.6, arc: 100 * D, damage: 36, knock: 5, lunge: 1.4, hitstop: .065, shake: .25, label: 'Attacking' },
      { clip: GS('slash (3)'), speed: 1.4, active: [0.64, 1.2], cancel: 1.24, end: 1.55, range: 3.8, arc: 60 * D, damage: 50, knock: 7, lunge: 1.8, hitstop: .085, shake: .38, label: 'Attacking' },
      { clip: GS('high spin attack'), speed: 1.3, active: [0.78, 1.42], cancel: 1.6, end: 1.85, range: 3.8, arc: 180 * D, damage: 30, knock: 8, lunge: 2.2, multi: .22, heavy: true, hitstop: .08, shake: .4, label: 'Spin finisher' },
    ],
    // Held whirlwind: the KayKit spin loop (no looping spin exists in the Mixamo packs).
    spin: { clip: '2H_Melee_Attack_Spinning', speed: 1.25, active: [0, 99], cancel: 0, range: 3.5, arc: 180 * D, damage: 15, knock: 5, lunge: 0, multi: .19, heavy: true, hitstop: .03, shake: .14, move: 4.2, label: 'Whirlwind' },
  },
  axe: {
    id: 'axe', name: 'Widow Cleaver', key: '2', set: 'sword', secondary: 'guard', attach: { r: 'W_widow-cleaver' }, trail: 1.1,
    combo: [
      { clip: SS('slash'), speed: 1.35, active: [0.48, 0.76], cancel: 0.8, end: 1.05, range: 3, arc: 80 * D, damage: 24, knock: 2.5, lunge: 1, hitstop: .05, shake: .12, label: 'Attacking' },
      { clip: SS('attack (4)'), speed: 1.25, active: [0.36, 0.6], cancel: 0.64, end: 0.9, range: 3, arc: 90 * D, damage: 26, knock: 3, lunge: 1, hitstop: .05, shake: .14, label: 'Attacking' },
      { clip: SS('slash (5)'), speed: 1.35, active: [0.44, 0.76], cancel: 0.82, end: 1.1, range: 3.1, arc: 70 * D, damage: 30, knock: 4.5, lunge: 1.2, hitstop: .07, shake: .25, label: 'Attacking' },
      { clip: SS('attack (2)'), speed: 1.3, active: [0.3, 0.78], cancel: 1.05, end: 1.3, range: 3.5, arc: 60 * D, damage: 46, knock: 9, lunge: 2.4, heavy: true, hitstop: .1, shake: .45, label: 'Heavy cleave' },
    ],
    bash: { clip: SS('kick'), speed: 1.4, active: [0.08, 0.34], cancel: .7, end: .95, range: 2.6, arc: 60 * D, damage: 12, knock: 11, lunge: 1.2, heavy: true, hitstop: .08, shake: .3, label: 'Kick' },
  },
  bow: {
    id: 'bow', name: 'Ashwood Sentinel', key: '3', set: 'bow', secondary: 'aim', attach: { l: 'W_ashwood-sentinel' }, trail: 0,
    combo: [
      { clip: BOW('draw arrow'), speed: 1.5, active: [0.8, 0.81], cancel: 0.95, end: 1.05, range: 40, arc: 0, damage: 34, knock: 4, lunge: 0, hitstop: .03, shake: .08, label: 'Shooting' },
    ],
    aimed: { clip: BOW('aim recoil'), speed: 1.4, active: [0.2, 0.21], cancel: 0.5, end: 0.7, range: 40, arc: 0, damage: 52, knock: 6, lunge: 0, hitstop: .04, shake: .12, label: 'Loosing' },
  },
};

export type FoeKind = 'minion' | 'warrior' | 'rogue' | 'mage';
export interface FoeDef {
  looks: LookId[]; set: keyof typeof MOVESETS; hp: number; speed: number; xp: number; reach: number;
  attacks: AttackDef[]; shield?: string; weapon?: string; hand?: 'l' | 'r'; ranged?: 'bolt' | 'orb';
  /** Seconds of red-crescent warning before a melee swing lands. */
  tell: number; cooldown: [number, number]; armor: number;
}
export const FOES: Record<FoeKind, FoeDef> = {
  minion: {
    looks: ['raider', 'raider_f'], set: 'sword', hp: 55, speed: 4.4, xp: 10, reach: 2.4, weapon: 'W_serpent-tooth', tell: .45, cooldown: [1.3, 2.4], armor: 0,
    attacks: [{ clip: SS('slash'), speed: 1.15, active: [0.5, 0.74], cancel: 9, end: 1.15, range: 2.8, arc: 60 * D, damage: 45, knock: 3, lunge: .9, hitstop: .04, shake: .25 },
      { clip: SS('attack (4)'), speed: 1.1, active: [0.38, 0.56], cancel: 9, end: 0.95, range: 2.8, arc: 70 * D, damage: 50, knock: 4, lunge: .9, hitstop: .04, shake: .3 }],
  },
  warrior: {
    looks: ['soldier', 'knight'], set: 'greatsword', hp: 130, speed: 3.4, xp: 25, reach: 2.6, weapon: 'W_bell-of-ruin', shield: 'parry', tell: .65, cooldown: [1.8, 3], armor: .35,
    attacks: [{ clip: GS('attack'), speed: 1.05, active: [0.38, 0.6], cancel: 9, end: 1.2, range: 3.2, arc: 55 * D, damage: 85, knock: 6, lunge: 1.1, heavy: true, hitstop: .05, shake: .4 },
      { clip: GS('slash'), speed: 1.1, active: [0.44, 0.82], cancel: 9, end: 1.25, range: 3.2, arc: 85 * D, damage: 70, knock: 5, lunge: 1, hitstop: .05, shake: .35 }],
  },
  rogue: {
    looks: ['archer'], set: 'bow', hp: 60, speed: 4.2, xp: 15, reach: 16, weapon: 'W_briar-whisper', hand: 'l', ranged: 'bolt', tell: .9, cooldown: [2.2, 3.4], armor: 0,
    attacks: [{ clip: BOW('draw arrow'), speed: 1.25, active: [0.8, 0.81], cancel: 9, end: 1.05, range: 30, arc: 0, damage: 70, knock: 4, lunge: 0, hitstop: .02, shake: .2 }],
  },
  mage: {
    looks: ['mystic'], set: 'caster', hp: 70, speed: 3.6, xp: 20, reach: 14, weapon: 'W_elderroot', ranged: 'orb', tell: 1.0, cooldown: [2.8, 4], armor: 0,
    attacks: [{ clip: 'great_sword/spell cast', speed: 1, active: [0.3, 0.31], cancel: 9, end: 1.15, range: 30, arc: 0, damage: 95, knock: 7, lunge: 0, hitstop: .02, shake: .3 }],
  },
};

/** Ally fighters (companions). They use the same rules as everyone else. */
export const ALLIES = {
  barbarian: { look: 'brann' as LookId, name: 'Brann', hp: 900, speed: 5.4, weapon: 'W_execution-standard', hand: 'r' as const, set: 'greatsword' as const,
    attacks: [WEAPONS.greatsword.combo[0], WEAPONS.greatsword.combo[2]].map(a => ({ ...a, damage: a.damage * .8 })) },
  rogue: { look: 'wren' as LookId, name: 'Wren', hp: 650, speed: 5.8, weapon: 'W_briar-whisper', hand: 'l' as const, set: 'bow' as const,
    attacks: [{ ...WEAPONS.bow.combo[0], speed: 1.4, damage: 28 }] },
};

/** Wave composition: grows without bound so the arena can be replayed indefinitely. */
export function waveRoster(n: number, rnd: () => number): FoeKind[] {
  const out: FoeKind[] = [];
  const total = Math.min(30, 5 + n * 3);
  for (let i = 0; i < total; i++) {
    const r = rnd();
    out.push(n >= 3 && r < .12 ? 'mage' : n >= 2 && r < .3 ? 'rogue' : r < .3 + Math.min(.35, n * .06) ? 'warrior' : 'minion');
  }
  return out;
}

/** Every clip name referenced by weapons, foes, allies and movesets: only these are baked and instantiated. */
export function usedClips(): Set<string> {
  const out = new Set<string>(['Lie_StandUp', ...Object.values(DODGES)]);
  const add = (a?: AttackDef) => a && out.add(a.clip);
  for (const m of Object.values(MOVESETS)) for (const c of [m.idle, m.walk, m.run, m.block, m.guard, m.enter, ...m.hit, ...m.death]) out.add(c);
  for (const w of Object.values(WEAPONS)) { w.combo.forEach(add); add(w.spin); add(w.bash); add(w.aimed); }
  for (const f of Object.values(FOES)) f.attacks.forEach(add);
  for (const a of Object.values(ALLIES)) a.attacks.forEach(add);
  return out;
}
