import type { WeaponId } from '../combat';
import type { Element, Style } from './capability';

/**
 * Tower loot. Weapons are the user's Torn Veil Arsenal meshes; each item says which weapon slot
 * (moveset) it fights with and which style proficiency it trains. Quality rises with the floor.
 */
export const QUALITY = ['Worn', 'Common', 'Fine', 'Masterwork', 'Relic'] as const;
export const QUALITY_COLOR = ['#9a9a9a', '#e8e8e8', '#5fd16a', '#5aa8ff', '#ffb43c'];
export const QUALITY_MUL = [.75, 1, 1.2, 1.45, 1.8];

export type Item =
  | { kind: 'weapon'; id: string; name: string; slot: WeaponId; mesh: string; hand: 'r' | 'l'; style: Style; quality: number; element?: Element }
  | { kind: 'armor'; id: string; name: string; quality: number; reduction: number }
  | { kind: 'tome'; id: string; name: string; element: Element }
  | { kind: 'potion'; id: string; name: string; heal: number };

const W = (id: string, name: string, slot: WeaponId, mesh: string, style: Style, hand: 'r' | 'l' = 'r') => ({ id, name, slot, mesh: `W_${mesh}`, style, hand });
export const WEAPON_BASES = [
  W('oathbreaker', 'Oathbreaker', 'greatsword', 'oathbreaker', 'heavy'),
  W('execution-standard', 'Execution Standard', 'greatsword', 'execution-standard', 'heavy'),
  W('bell-of-ruin', 'Bell of Ruin', 'greatsword', 'bell-of-ruin', 'heavy'),
  W('veilguard', 'Veilguard', 'axe', 'veilguard', 'blade'),
  W('crimson-duel', 'Crimson Duel', 'axe', 'crimson-duel', 'blade'),
  W('serpent-tooth', 'Serpent Tooth', 'axe', 'serpent-tooth', 'blade'),
  W('widow-cleaver', 'Widow Cleaver', 'axe', 'widow-cleaver', 'axe'),
  W('ashwood-sentinel', 'Ashwood Sentinel', 'bow', 'ashwood-sentinel', 'bow', 'l'),
  W('briar-whisper', 'Briar Whisper', 'bow', 'briar-whisper', 'bow', 'l'),
];
/** Every arsenal mesh the tower may need loaded. */
export const ARSENAL_KEYS = [...new Set(WEAPON_BASES.map(w => w.mesh.slice(2))), 'night-thorn', 'elderroot', 'codex-of-the-veil'];

const TOMES: Record<Element, string> = {
  flame: 'Tome of Kindled Wrath', frost: 'Tome of the Long Winter', storm: 'Tome of Split Skies', swift: 'Tome of the Quick Step',
  iron: 'Tome of the Unbowed', shadow: 'Tome of the Quiet Knife', verdance: 'Tome of Green Return',
};
export const ELEMENT_COLOR: Record<Element, string> = { flame: '#ff7a2e', frost: '#8fdcff', storm: '#c9a4ff', swift: '#b8ffcf', iron: '#c0c6cf', shadow: '#8a6aa8', verdance: '#7fd36b' };
const ARMORS = ['Padded Jerkin', 'Leather Brigandine', 'Riveted Hauberk', 'Lamellar Coat', 'Wardplate'];

let serial = 0;
/** Floor-scaled quality: Worn early, Relic possible late. */
export function rollQuality(floor: number, rnd: () => number, bonus = 0): number {
  const base = floor / 25 + bonus;
  return Math.max(0, Math.min(4, Math.floor(base + rnd() * 1.6 - .4)));
}

export function rollLoot(floor: number, rnd: () => number, source: 'enemy' | 'chest' | 'boss'): Item[] {
  const out: Item[] = [];
  const chance = source === 'boss' ? 1 : source === 'chest' ? 1 : .16;
  const n = source === 'boss' ? 3 : source === 'chest' ? 1 + (rnd() < .4 ? 1 : 0) : 1;
  for (let i = 0; i < n; i++) {
    if (rnd() > chance) continue;
    const r = rnd(), bonus = source === 'boss' ? 1 : source === 'chest' ? .4 : 0;
    if (r < .42) {
      const b = WEAPON_BASES[Math.floor(rnd() * WEAPON_BASES.length)], q = rollQuality(floor, rnd, bonus);
      const element = q >= 3 && rnd() < .5 ? (['flame', 'frost', 'storm'] as Element[])[Math.floor(rnd() * 3)] : undefined;
      out.push({ kind: 'weapon', ...b, id: `${b.id}#${++serial}`, name: `${QUALITY[q]} ${b.name}${element ? ` of ${element[0].toUpperCase()}${element.slice(1)}` : ''}`, quality: q, element });
    } else if (r < .62) {
      const q = rollQuality(floor, rnd, bonus);
      out.push({ kind: 'armor', id: `armor#${++serial}`, name: `${QUALITY[q]} ${ARMORS[q]}`, quality: q, reduction: .06 + q * .055 });
    } else if (r < .8) {
      const e = (Object.keys(TOMES) as Element[])[Math.floor(rnd() * 7)];
      out.push({ kind: 'tome', id: `tome#${++serial}`, name: TOMES[e], element: e });
    } else out.push({ kind: 'potion', id: `potion#${++serial}`, name: 'Draught of Mending', heal: .35 });
  }
  return out;
}
