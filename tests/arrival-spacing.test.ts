import { describe, expect, it } from 'vitest';
import { BridgeSession } from '../src/bridge/session';

/** New arrivals stand apart on walkable ground; they used to appear on a 1 m grid, bunched on one another. */
describe('arrival spacing', () => {
  it('six new characters arrive on open ground at least a metre and a half apart', () => {
    const s = new BridgeSession(918271, { playable: true, defaultPlayer: false }), w = s.world;
    const ids = Array.from({ length: 6 }, (_, i) => s.createCharacter(`arrival-${i}`, `Arrival ${i}`, { gender: i % 2 ? 'm' : 'f' }));
    const pos = ids.map(id => w.positionOf(id)!);
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++)
      expect(Math.hypot(pos[i].x - pos[j].x, pos[i].z - pos[j].z)).toBeGreaterThanOrEqual(1.5);
    for (const p of pos) expect(w.nav.walkCost(Math.floor(p.x), Math.floor(p.z))).toBeLessThan(3);
  }, 120_000);
});
