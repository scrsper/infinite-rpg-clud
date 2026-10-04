import { mulberry } from '../../render/noise';
import type { FoeKind } from '../combat';
import { TIERS, type Element, type Tier } from './capability';

/**
 * Procedural floors for the Tower of Chrysanthus. Deterministic per (run seed, floor).
 *   every floor:   ruined buildings with doorways, furniture, chests; enemies scaled to the floor
 *   every 5th:     a named boss guards the stair
 *   every 10th:    a god's shrine and its champion; beating the champion lets you claim a boon
 *   floor 100:     the summit deity
 * The playable area grows every 25 floors. Each tier band (Constitution §13 names) has its own look.
 */
export interface Theme { tier: Tier; name: string; floor: string; line: string; wall: [number, number, number]; light: [number, number, number]; fog: number }
export const THEMES: Theme[] = [
  { tier: 'Normal', name: 'The Root Cellars', floor: '#cfc8bc', line: '#bdb4a6', wall: [.62, .56, .48], light: [1, .95, .86], fog: 0 },
  { tier: 'Iron', name: 'The Iron Halls', floor: '#b9bec4', line: '#a6acb3', wall: [.46, .49, .53], light: [.9, .95, 1], fog: 0 },
  { tier: 'Bronze', name: 'The Bronze Galleries', floor: '#c9b08e', line: '#b59a76', wall: [.55, .38, .22], light: [1, .86, .66], fog: 0 },
  { tier: 'Silver', name: 'The Silver Cloisters', floor: '#d9dde3', line: '#c6ccd4', wall: [.72, .75, .8], light: [.88, .92, 1], fog: 0 },
  { tier: 'Gold', name: 'The Gilded Courts', floor: '#d8c389', line: '#c6ad6a', wall: [.7, .56, .24], light: [1, .92, .7], fog: 0 },
  { tier: 'Diamond', name: 'The Crystal Spires', floor: '#c9e3ea', line: '#addbe6', wall: [.55, .78, .86], light: [.82, .95, 1], fog: 0 },
  { tier: 'God', name: 'The Threshold of Chrysanthus', floor: '#e4d6ea', line: '#d2bedb', wall: [.82, .7, .86], light: [1, .9, 1], fog: 0 },
];
export const themeFor = (floor: number) => THEMES[Math.min(6, Math.floor((floor - 1) / 15))];
export const halfSizeFor = (floor: number) => 24 + 6 * Math.floor(floor / 25);

export interface God { name: string; domain: Element; title: string }
export const GODS: God[] = [
  { name: 'Pyrrhos', domain: 'flame', title: 'the Ember Throne' }, { name: 'Isveld', domain: 'frost', title: 'of the Long Winter' },
  { name: 'Thalor', domain: 'storm', title: 'Who Splits the Sky' }, { name: 'Ysra', domain: 'swift', title: 'the Unheld Wind' },
  { name: 'Ankh-Varro', domain: 'iron', title: 'the Unbowed' }, { name: 'Nyx-Sel', domain: 'shadow', title: 'the Quiet Knife' },
  { name: 'Maelith', domain: 'verdance', title: 'of Green Return' },
];

export type FloorKind = 'battle' | 'boss' | 'shrine' | 'summit';
export interface Wall { x: number; z: number; len: number; yaw: number }
export interface FloorPlan {
  floor: number; seed: number; half: number; theme: Theme; kind: FloorKind;
  walls: Wall[];
  props: { key: string; x: number; z: number; yaw: number }[];
  chests: { x: number; z: number; yaw: number }[];
  foes: { kind: FoeKind; x: number; z: number }[];
  boss?: { kind: FoeKind; name: string; x: number; z: number; hpMul: number; dmgMul: number; scale: number };
  god?: God; shrine?: { x: number; z: number };
  start: { x: number; z: number }; exit: { x: number; z: number };
  objective: string;
}

const BOSS_FIRST = ['Gorrak', 'Velma', 'Draun', 'Isolde', 'Mordecai', 'Hask', 'Brynja', 'Oren', 'Sable', 'Teodric', 'Ulla', 'Corvin'];
const BOSS_EPITHET: Record<Tier, string[]> = {
  Normal: ['the Cellar King', 'Rat-Tamer', 'the Bent Nail'], Iron: ['the Iron-Willed', 'Anvil-Born', 'of the Black Forge'],
  Bronze: ['the Bronze Bell', 'Lantern-Eater', 'of the Hollow Gallery'], Silver: ['the Silvered', 'Moon-Sworn', 'of the Pale Choir'],
  Gold: ['the Gilded Tyrant', 'Sun-Crowned', 'of the Golden Court'], Diamond: ['the Unbreaking', 'Glass-Saint', 'of the Spires'],
  God: ['Herald of Chrysanthus', 'the Last Door', 'Who Waits Above'],
};

export function planFloor(runSeed: number, floor: number): FloorPlan {
  const rnd = mulberry((runSeed * 7919 + floor * 104729) >>> 0);
  const half = halfSizeFor(floor), theme = themeFor(floor);
  const kind: FloorKind = floor >= 100 ? 'summit' : floor % 10 === 0 ? 'shrine' : floor % 5 === 0 ? 'boss' : 'battle';
  const start = { x: 0, z: half - 4 }, exit = { x: 0, z: -half + 2.5 };
  const walls: Wall[] = [], props: FloorPlan['props'] = [], chests: FloorPlan['chests'] = [];
  const rects: { x0: number; z0: number; x1: number; z1: number }[] = [];
  const free = (x0: number, z0: number, x1: number, z1: number, pad = 2) =>
    Math.abs((x0 + x1) / 2 - start.x) + Math.abs((z0 + z1) / 2 - start.z) > 10 && Math.abs((x0 + x1) / 2 - exit.x) + Math.abs((z0 + z1) / 2 - exit.z) > 8 &&
    x0 > -half + 1 && x1 < half - 1 && z0 > -half + 1 && z1 < half - 1 && rects.every(r => x1 + pad < r.x0 || x0 - pad > r.x1 || z1 + pad < r.z0 || z0 - pad > r.z1);
  // Ruined buildings: four walls with a doorway, some walls broken short.
  const nb = Math.min(7, 2 + Math.floor(floor / 12) + Math.floor(rnd() * 2));
  for (let b = 0, tries = 0; b < nb && tries < 60; tries++) {
    const w = 7 + rnd() * 7, d = 6 + rnd() * 6, cx = (rnd() * 2 - 1) * (half - w / 2 - 2), cz = (rnd() * 2 - 1) * (half - d / 2 - 2);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    if (!free(x0, z0, x1, z1)) continue;
    rects.push({ x0, z0, x1, z1 }); b++;
    const door = Math.floor(rnd() * 4), gap = 2.8;
    const side = (ax: number, az: number, bx: number, bz: number, withDoor: boolean) => {
      const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
      const seg = (t0: number, t1: number) => { if (t1 - t0 < .6) return; if (rnd() < .12) t1 = t0 + (t1 - t0) * .5; const m = (t0 + t1) / 2; walls.push({ x: ax + (bx - ax) * m / len, z: az + (bz - az) * m / len, len: t1 - t0, yaw }); };
      if (withDoor) { const m = len * (.3 + rnd() * .4); seg(0, m - gap / 2); seg(m + gap / 2, len); } else seg(0, len);
    };
    side(x0, z0, x1, z0, door === 0); side(x1, z0, x1, z1, door === 1); side(x1, z1, x0, z1, door === 2); side(x0, z1, x0, z0, door === 3);
    // Furnish: a table with chairs, or storage; often a chest.
    if (rnd() < .55) {
      props.push({ key: 'table', x: cx, z: cz, yaw: rnd() * Math.PI });
      for (const [dx, dz] of [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) if (rnd() < .7) props.push({ key: 'chair', x: cx + dx, z: cz + dz, yaw: Math.atan2(-dx, -dz) });
    } else for (let i = 0; i < 5; i++) props.push({ key: ['barrel', 'barrel_small', 'crate', 'crate_small', 'keg'][Math.floor(rnd() * 5)], x: x0 + 1.3 + rnd() * (w - 2.6), z: z0 + 1.3 + rnd() * (d - 2.6), yaw: rnd() * 6 });
    if (rnd() < .6) chests.push({ x: x0 + 1.4 + rnd() * (w - 2.8), z: z0 + 1.4 + rnd() * (d - 2.8), yaw: rnd() * 6 });
  }
  // Courtyard clutter: pot clusters and stacks between buildings.
  const clusters = 4 + Math.floor(half / 6);
  for (let c = 0; c < clusters; c++) {
    const cx = (rnd() * 2 - 1) * (half - 3), cz = (rnd() * 2 - 1) * (half - 3);
    if (!free(cx - 2, cz - 2, cx + 2, cz + 2, 0)) continue;
    const set = rnd() < .4 ? ['pot', 'pot', 'jar'] : rnd() < .5 ? ['barrel', 'barrel_small', 'keg'] : ['crate', 'crate_small', 'stool'];
    for (let i = 0; i < 3 + Math.floor(rnd() * 5); i++) props.push({ key: set[Math.floor(rnd() * set.length)], x: cx + (rnd() - .5) * 4, z: cz + (rnd() - .5) * 4, yaw: rnd() * 6 });
  }
  if (rnd() < .5) chests.push({ x: (rnd() * 2 - 1) * (half - 4), z: (rnd() * 2 - 1) * (half - 8), yaw: rnd() * 6 });
  // Enemies: count and mix scale with the floor.
  const foes: FloorPlan['foes'] = [];
  const count = kind === 'shrine' || kind === 'summit' ? 3 + Math.floor(floor / 15) : Math.min(30, 3 + Math.floor(floor * .55));
  for (let i = 0; i < count; i++) {
    const r = rnd();
    // Early floors are mostly raiders; archers from 4, soldiers from 3 (rising), mystics from 7.
    const k: FoeKind = floor >= 7 && r < .06 + floor * .002 ? 'mage' : floor >= 4 && r < .26 ? 'rogue' : floor >= 3 && r < .26 + Math.min(.34, (floor - 2) * .03) ? 'warrior' : 'minion';
    let x = 0, z = 0;
    for (let t = 0; t < 20; t++) { x = (rnd() * 2 - 1) * (half - 3); z = (rnd() * 2 - 1) * (half - 3); if (Math.hypot(x - start.x, z - start.z) > 14) break; }
    foes.push({ kind: k, x, z });
  }
  const tier = theme.tier;
  let boss: FloorPlan['boss'], god: God | undefined, shrine: FloorPlan['shrine'];
  const bossName = () => `${BOSS_FIRST[Math.floor(rnd() * BOSS_FIRST.length)]} ${BOSS_EPITHET[tier][Math.floor(rnd() * 3)]}`;
  if (kind === 'boss') boss = { kind: rnd() < .6 ? 'warrior' : 'minion', name: bossName(), x: 0, z: -half * .35, hpMul: 6 + floor * .25, dmgMul: 1.3 + floor * .02, scale: 1.3 };
  if (kind === 'shrine' || kind === 'summit') {
    god = GODS[Math.floor(rnd() * GODS.length)];
    shrine = { x: 0, z: -half * .45 };
    boss = { kind: 'warrior', name: kind === 'summit' ? `${god.name}, ${god.title}` : `Champion of ${god.name}`, x: 0, z: -half * .3, hpMul: (kind === 'summit' ? 30 : 9) + floor * .3, dmgMul: 1.5 + floor * .025, scale: kind === 'summit' ? 1.6 : 1.4 };
  }
  const objective = kind === 'battle' ? 'Defeat every foe on the floor' : kind === 'boss' ? `Defeat ${boss!.name}` : kind === 'shrine' ? `Defeat the ${boss!.name} and claim a boon` : `Face ${boss!.name}`;
  return { floor, seed: runSeed, half, theme, kind, walls, props, chests, foes, boss, god, shrine, start, exit, objective };
}

export { TIERS };
