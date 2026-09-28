import { describe, it, expect } from 'vitest';
import { generateSettlementSpec, unusedName } from '../src/sim/world/settlementSpec';
import { World } from '../src/sim/core/world';
import { generatePlayableWorld } from '../src/sim/world/playable';
import { HOUSEHOLD_PLAYABLE_WORLD, PLAYABLE_WORLD } from '../src/sim/world/geography';

const site = { id: 'site_0', x: 256, z: 128 };

describe('generated names', () => {
  it('nobody is generated with a numeral for a name (naming revision 1)', () => {
    let residents = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const names = generateSettlementSpec(seed, site, undefined, 1).residents.map(r => r.name);
      residents += names.length;
      expect(names.filter(n => /\d/.test(n)), `seed ${seed}`).toEqual([]);
      expect(new Set(names).size).toBe(names.length);
    }
    expect(residents).toBeGreaterThan(600);
  });
  it('the revision changes names only; every other generated fact of the seed is unchanged', () => {
    // No RNG draw moves. (A renamed clash may take a name a later resident would have drawn,
    // who is then renamed in turn, so "only the clashes" would overstate it.)
    for (let seed = 1; seed <= 60; seed++) {
      const before = generateSettlementSpec(seed, site), after = generateSettlementSpec(seed, site, undefined, 1);
      const strip = (s: typeof before) => JSON.stringify({ ...s, residents: s.residents.map(r => ({ ...r, name: '' })) });
      expect(strip(after)).toBe(strip(before));
      after.residents.forEach((r, i) => expect(r.name.split(' ')[1]).toBe(before.residents[i].name.split(' ')[1]));
    }
    // Worlds recorded before the revision keep their names exactly.
    expect(generateSettlementSpec(1, site).residents.map(r => r.name)).toContain('Thora Pike 2');
  });
  it('a clash takes the next unused given name and keeps the family name', () => {
    const taken = new Set(['Rhea Ives', 'Silas Ives']);
    expect(unusedName('Rhea', 'Ives', ['Perrin', 'Rhea', 'Silas', 'Thora'], taken)).toBe('Thora Ives');
    expect(unusedName('Rhea', 'Moss', ['Perrin', 'Rhea', 'Silas', 'Thora'], taken)).toBe('Rhea Moss');
    expect(unusedName('Rhea', 'Ives', ['Rhea', 'Silas'], taken)).toBe('Rhea Ives 2');
  });
  it('a new playable world carries the revision; an older spec does not', () => {
    const fresh = new World(918271); generatePlayableWorld(fresh, PLAYABLE_WORLD, false);
    expect(fresh.persons().filter(p => /\d/.test(p.name)).map(p => p.name)).toEqual([]);
    const recorded = new World(918271); generatePlayableWorld(recorded, HOUSEHOLD_PLAYABLE_WORLD, false);
    expect(recorded.geography!.spec.namingVersion).toBeUndefined();
  }, 60000);
});
