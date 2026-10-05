/**
 * Tower of Chrysanthus: capability is the truth, classes are summaries (Constitution §12, §IX).
 *
 * A run's CapabilitySheet records what the climber can actually do (style proficiencies, elemental
 * affinities, body) and what they have done (history). Classes *emerge* when the sheet matches a
 * qualifying pattern: a dominant fighting style, a dominant affinity and enough history. The name is
 * composed from those parts, so any combination can surface as a class. Every discovery is written
 * to the Codex (§60: knowledge of mechanics becomes power, and spreads).
 */
export type Style = 'fists' | 'blade' | 'heavy' | 'axe' | 'bow';
/** Elements (display names in magic.ts): fire, ice, lightning, wind, earth, shadow, life, water, gravity, time. */
export type Element = 'flame' | 'frost' | 'storm' | 'swift' | 'iron' | 'shadow' | 'verdance' | 'water' | 'gravity' | 'time';
export const ELEMENTS: Element[] = ['flame', 'frost', 'storm', 'swift', 'iron', 'shadow', 'verdance', 'water', 'gravity', 'time'];

/** Canonical power ontology names (Constitution §13); here a summary of measured capability. */
export const TIERS = ['Normal', 'Iron', 'Bronze', 'Silver', 'Gold', 'Diamond', 'God'] as const;
export type Tier = typeof TIERS[number];
export const TIER_COLOR: Record<Tier, string> = { Normal: '#c8c8c8', Iron: '#8f98a3', Bronze: '#c8874a', Silver: '#dfe6ee', Gold: '#ffd45c', Diamond: '#8fe8ff', God: '#ff9cf2' };

export interface CapabilitySheet {
  /** Proficiency per style: grows with landed hits and kills. */
  style: Record<Style, number>;
  /** Affinity per element: from tomes, boons and use. */
  affinity: Record<Element, number>;
  vitality: number; might: number; agility: number;
  /** Magic: forms of shaping mana that have been learned, and mana control (grows with casting). */
  forms: string[]; manaControl: number;
  history: { kills: number; bosses: number; floors: number; tomes: number; boons: number; nearDeaths: number; noWeaponFloors: number };
}

export const newSheet = (): CapabilitySheet => ({
  style: { fists: 0, blade: 0, heavy: 0, axe: 0, bow: 0 },
  affinity: { flame: 0, frost: 0, storm: 0, swift: 0, iron: 0, shadow: 0, verdance: 0, water: 0, gravity: 0, time: 0 },
  vitality: 0, might: 0, agility: 0, forms: [], manaControl: 0,
  history: { kills: 0, bosses: 0, floors: 0, tomes: 0, boons: 0, nearDeaths: 0, noWeaponFloors: 0 },
});

/** Proficiency points to style "levels" (diminishing): 0..10. */
export const rank = (p: number) => Math.min(10, Math.floor(Math.sqrt(p / 6)));

/** Overall measured power, summarized as a canonical tier name. */
export function tierOf(s: CapabilitySheet, level: number): Tier {
  const styles = Object.values(s.style).map(rank).sort((a, b) => b - a);
  const aff = Object.values(s.affinity).sort((a, b) => b - a);
  const score = level * 1.2 + styles[0] * 2 + styles[1] + aff[0] * 2.5 + aff[1] * 1.2 + s.vitality + s.might + s.agility + s.history.bosses * 2;
  const i = score < 12 ? 0 : score < 26 ? 1 : score < 44 ? 2 : score < 66 ? 3 : score < 92 ? 4 : score < 125 ? 5 : 6;
  return TIERS[i];
}

export interface EmergedClass {
  id: string;           // pattern key, e.g. "blade+flame"
  name: string;         // composed name, e.g. "Flamebrand"
  pattern: string;      // human-readable qualifying pattern
  boon: { stat: 'damage' | 'speed' | 'vitality' | 'affinity'; amount: number; element?: Element };
  tier: Tier;
}

const STYLE_WORDS: Record<Style, [string, string]> = { fists: ['fist', 'Brawler'], blade: ['brand', 'Blademaster'], heavy: ['breaker', 'Warden'], axe: ['cleaver', 'Reaver'], bow: ['shot', 'Ranger'] };
const ELEMENT_WORDS: Record<Element, string> = { flame: 'Flame', frost: 'Rime', storm: 'Storm', swift: 'Gale', iron: 'Iron', shadow: 'Shade', verdance: 'Thorn', water: 'Tide', gravity: 'Grave', time: 'Chrono' };

/**
 * Qualifying patterns. Classes surface from capability + history, not choice:
 *   style rank >= 2 alone            -> a plain style class (Brawler, Blademaster, ...)
 *   style rank >= 2 + affinity >= 2  -> an elemental composite (Flamebrand, Stormfist, Rimeshot, ...)
 *   fists rank >= 4 and no weapon used on 3+ floors -> Iron Ascetic (an earned exception)
 * The strongest qualifying pattern wins; a new pattern replaces the class (classes evolve).
 */
export function emergentClass(s: CapabilitySheet, level: number): EmergedClass | null {
  const tier = tierOf(s, level);
  if (s.style.fists && rank(s.style.fists) >= 4 && s.history.noWeaponFloors >= 3 && Object.entries(s.style).every(([k, v]) => k === 'fists' || rank(v) < 2))
    return { id: 'fists+ascetic', name: 'Iron Ascetic', pattern: 'fists rank 4+, no weapon for 3+ floors', boon: { stat: 'damage', amount: .2 }, tier };
  const [style, sp] = (Object.entries(s.style) as [Style, number][]).sort((a, b) => b[1] - a[1])[0];
  const r = rank(sp);
  if (r < 2) return null;
  const [element, ev] = (Object.entries(s.affinity) as [Element, number][]).sort((a, b) => b[1] - a[1])[0];
  if (ev >= 2) {
    const name = ELEMENT_WORDS[element] + STYLE_WORDS[style][0];
    return { id: `${style}+${element}`, name, pattern: `${style} rank ${r}, ${element} affinity ${ev.toFixed(1)}`, boon: { stat: 'affinity', amount: 1, element }, tier };
  }
  return { id: style, name: STYLE_WORDS[style][1], pattern: `${style} rank ${r}`, boon: { stat: style === 'heavy' ? 'vitality' : style === 'bow' || style === 'fists' ? 'speed' : 'damage', amount: .1 }, tier };
}

// ---- Codex: every discovered class, kept across runs (localStorage) and exportable as JSON ----
export interface CodexEntry extends EmergedClass { firstSeen: string; floor: number; seed: number; times: number }
const KEY = 'tv.tower.codex.v1';
export function loadCodex(): CodexEntry[] { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } }
export function recordClass(c: EmergedClass, floor: number, seed: number): { entry: CodexEntry; isNew: boolean } {
  const codex = loadCodex();
  let entry = codex.find(e => e.id === c.id); const isNew = !entry;
  if (!entry) { entry = { ...c, firstSeen: new Date().toISOString(), floor, seed, times: 0 }; codex.push(entry); }
  entry.times++;
  try { localStorage.setItem(KEY, JSON.stringify(codex)); } catch { /* private mode: codex lives for the session */ }
  return { entry, isNew };
}
