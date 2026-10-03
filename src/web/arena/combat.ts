import type { LookId } from './looks';

/**
 * Attack and fighter data for the Combat Arena. Times are in clip seconds (speed 1); `speed` scales
 * playback, so a 1.1 s clip at speed 1.45 resolves in 0.76 s of game time.
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

export type WeaponId = 'greatsword' | 'axe' | 'crossbow';
export interface WeaponDef {
  id: WeaponId; name: string; key: string;
  idle: string; run: string;
  combo: AttackDef[];
  /** Held secondary: whirlwind, shield guard, or aimed shot. */
  secondary: 'spin' | 'guard' | 'aim';
  spin?: AttackDef;
  bash?: AttackDef;
  /** Gear meshes on the Knight rig to show (others hidden); `attach` adds weapons.glb meshes. */
  show: string[];
  attach?: { r?: string; l?: string };
  trail: number;
}

const D = Math.PI / 180;
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  greatsword: {
    id: 'greatsword', name: 'Greatsword', key: '1', idle: '2H_Melee_Idle', run: 'Running_A', secondary: 'spin', show: [], attach: { r: 'W_oathbreaker' }, trail: 1.75,
    combo: [
      { clip: '2H_Melee_Attack_Slice', speed: 1.55, active: [0.26, 0.5], cancel: 0.52, end: 0.82, range: 3.5, arc: 95 * D, damage: 30, knock: 4, lunge: 1.4, hitstop: .055, shake: .18, label: 'Attacking' },
      { clip: '2H_Melee_Attack_Chop', speed: 1.6, active: [0.5, 0.74], cancel: 0.82, end: 1.12, range: 3.7, arc: 45 * D, damage: 48, knock: 7, lunge: 1.8, hitstop: .085, shake: .38, label: 'Attacking' },
      { clip: '2H_Melee_Attack_Spin', speed: 1.55, active: [0.32, 1.95], cancel: 2.0, end: 2.15, range: 3.6, arc: 180 * D, damage: 22, knock: 6, lunge: 2.4, multi: .2, heavy: true, hitstop: .06, shake: .3, label: 'Spin finisher' },
    ],
    spin: { clip: '2H_Melee_Attack_Spinning', speed: 1.25, active: [0, 99], cancel: 0, range: 3.5, arc: 180 * D, damage: 15, knock: 5, lunge: 0, multi: .19, heavy: true, hitstop: .03, shake: .14, move: 4.2, label: 'Whirlwind' },
  },
  axe: {
    id: 'axe', name: 'Widow Cleaver', key: '2', idle: 'Idle_Combat', run: 'Running_A', secondary: 'guard', show: [], attach: { r: 'W_widow-cleaver' }, trail: 1.1,
    combo: [
      { clip: '1H_Melee_Attack_Slice_Diagonal', speed: 1.6, active: [0.22, 0.42], cancel: 0.44, end: 0.7, range: 2.9, arc: 75 * D, damage: 22, knock: 2.5, lunge: 1, hitstop: .05, shake: .12, label: 'Attacking' },
      { clip: '1H_Melee_Attack_Slice_Horizontal', speed: 1.6, active: [0.24, 0.46], cancel: 0.48, end: 0.74, range: 2.9, arc: 95 * D, damage: 24, knock: 3, lunge: 1, hitstop: .05, shake: .12, label: 'Attacking' },
      { clip: '1H_Melee_Attack_Chop', speed: 1.55, active: [0.32, 0.52], cancel: 0.56, end: 0.8, range: 3, arc: 50 * D, damage: 32, knock: 4.5, lunge: 1.2, hitstop: .07, shake: .25, label: 'Attacking' },
      { clip: '1H_Melee_Attack_Stab', speed: 1.7, active: [0.5, 0.72], cancel: 1.1, end: 1.3, range: 3.6, arc: 30 * D, damage: 46, knock: 9, lunge: 2.6, heavy: true, hitstop: .1, shake: .45, label: 'Lunge' },
    ],
    bash: { clip: 'Block_Attack', speed: 1.6, active: [0.25, 0.5], cancel: .7, end: .9, range: 2.6, arc: 60 * D, damage: 12, knock: 10, lunge: 1.2, heavy: true, hitstop: .08, shake: .3, label: 'Shield bash' },
  },
  crossbow: {
    id: 'crossbow', name: 'Crossbow', key: '3', idle: 'Idle', run: 'Running_A', secondary: 'aim', show: [], attach: { r: 'W_raven-mechanism' }, trail: 0,
    combo: [
      { clip: '2H_Ranged_Shoot', speed: 2.2, active: [0.12, 0.13], cancel: 0.42, end: 0.6, range: 40, arc: 0, damage: 34, knock: 4, lunge: 0, hitstop: .03, shake: .08, label: 'Shooting' },
    ],
  },
};

export type FoeKind = 'minion' | 'warrior' | 'rogue' | 'mage';
export interface FoeDef {
  looks: LookId[]; hp: number; speed: number; xp: number; reach: number;
  attacks: AttackDef[]; shield?: string; weapon?: string; ranged?: 'bolt' | 'orb';
  /** Seconds of red-crescent warning before a melee swing lands. */
  tell: number; cooldown: [number, number]; armor: number;
}
export const FOES: Record<FoeKind, FoeDef> = {
  minion: {
    looks: ['raider', 'raider_f'], hp: 55, speed: 4.4, xp: 10, reach: 2.4, weapon: 'W_serpent-tooth', tell: .45, cooldown: [1.3, 2.4], armor: 0,
    attacks: [{ clip: '1H_Melee_Attack_Slice_Diagonal', speed: 1.2, active: [0.26, 0.44], cancel: 1, end: .95, range: 2.7, arc: 60 * D, damage: 45, knock: 3, lunge: .9, hitstop: .04, shake: .25 },
      { clip: '1H_Melee_Attack_Chop', speed: 1.2, active: [0.34, 0.52], cancel: 1, end: 1.0, range: 2.7, arc: 45 * D, damage: 55, knock: 4, lunge: .9, hitstop: .04, shake: .3 }],
  },
  warrior: {
    looks: ['soldier', 'knight'], hp: 130, speed: 3.4, xp: 25, reach: 2.6, weapon: 'W_bell-of-ruin', shield: 'parry', tell: .65, cooldown: [1.8, 3], armor: .35,
    attacks: [{ clip: '1H_Melee_Attack_Chop', speed: 1.05, active: [0.34, 0.54], cancel: 1, end: 1.05, range: 3, arc: 55 * D, damage: 85, knock: 6, lunge: 1.1, heavy: true, hitstop: .05, shake: .4 },
      { clip: '1H_Melee_Attack_Slice_Horizontal', speed: 1.1, active: [0.26, 0.46], cancel: 1, end: 1.05, range: 3, arc: 85 * D, damage: 70, knock: 5, lunge: 1, hitstop: .05, shake: .35 }],
  },
  rogue: {
    looks: ['archer'], hp: 60, speed: 4.2, xp: 15, reach: 16, weapon: 'W_raven-mechanism', ranged: 'bolt', tell: .9, cooldown: [2.2, 3.4], armor: 0,
    attacks: [{ clip: '1H_Ranged_Shoot', speed: 1.4, active: [0.18, 0.19], cancel: 1, end: .8, range: 30, arc: 0, damage: 70, knock: 4, lunge: 0, hitstop: .02, shake: .2 }],
  },
  mage: {
    looks: ['mystic'], hp: 70, speed: 3.6, xp: 20, reach: 14, weapon: 'W_elderroot', ranged: 'orb', tell: 1.0, cooldown: [2.8, 4], armor: 0,
    attacks: [{ clip: 'Spellcast_Shoot', speed: 1.1, active: [0.4, 0.41], cancel: 1, end: .93, range: 30, arc: 0, damage: 95, knock: 7, lunge: 0, hitstop: .02, shake: .3 }],
  },
};

/** Ally fighters (companions). They use the same rules as everyone else. */
export const ALLIES = {
  barbarian: { look: 'brann' as LookId, name: 'Brann', hp: 900, speed: 5.4, weapon: 'W_execution-standard', idle: '2H_Melee_Idle',
    attacks: [WEAPONS.greatsword.combo[0], WEAPONS.greatsword.combo[1]].map(a => ({ ...a, damage: a.damage * .8 })) },
  rogue: { look: 'wren' as LookId, name: 'Wren', hp: 650, speed: 5.8, weapon: 'W_raven-mechanism', idle: 'Idle',
    attacks: [{ ...WEAPONS.crossbow.combo[0], speed: 1.3, damage: 28 }] },
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
