import { describe, expect, it } from 'vitest';
import { architectureGrammar } from '../src/web/world/architecturalGrammar';
import type { PlaceProjection } from '../src/web/net/messages';

const p = (type: string, family: string, width: number, depth: number): PlaceProjection => ({ id: type, type, family, bounds: { x0: 10, z0: 10, x1: 10 + width - 1, z1: 10 + depth - 1, y0: 1, y1: 12 }, inside: { x: 11, y: 2, z: 11 }, door: { x: 12, y: 2, z: 10 }, indoor: true, visualSeed: 9, wallHeight: 5 });

describe('web architectural grammar', () => {
  it('derives visibly distinct families from projected place semantics and scale', () => {
    expect(architectureGrammar(p('house', 'dwelling', 8, 8), null).kind).toBe('cottage');
    expect(architectureGrammar(p('house', 'dwelling', 14, 12), null).kind).toBe('townhouse');
    expect(architectureGrammar(p('tavern', 'shop', 16, 13), null).kind).toBe('tavern');
    expect(architectureGrammar(p('bakery', 'shop', 12, 11), null).kind).toBe('shop');
    expect(architectureGrammar(p('chapel', 'community', 11, 11), null).kind).toBe('civic');
    expect(architectureGrammar(p('mill', 'production', 12, 11), null).kind).toBe('workshop');
  });

  it('keeps family accents bounded to presentation profile choices', () => {
    const cottage = architectureGrammar(p('house', 'dwelling', 8, 8), null), civic = architectureGrammar(p('chapel', 'community', 11, 11), null);
    expect(cottage.bay).toBeGreaterThanOrEqual(3);
    expect(cottage.eave).toBeLessThan(civic.eave);
    expect(cottage.entry).toBe(true);
    expect(architectureGrammar(p('tavern', 'shop', 16, 13), null).edge).toBe('pediment');
  });
});
