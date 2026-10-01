import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { WorldGeography } from '../src/sim/world/geography';
// Captured before the order-preserving queue/cache repair; includes every site and road point.
it.each([
  [918271, 'bca23e8d73c474d45dcdf9289c7846ab3408b51d5365df8a8fca172e1f397175'],
  [44017, '8ddf824bed9faf7e60a8eaa545a593fe3e764adb3bc4c5fccdd4967ab191b0f1'],
  [741, 'bd8f9d01abfe869f1493ca655ef1133fdc67d47bc900efa050e3caa3d83ef0fd'],
])('preserves complete pre-repair geographic output for seed %s', (seed, expected) => {
  const g = new WorldGeography(Number(seed));
  expect(createHash('sha256').update(JSON.stringify({ sites: g.sites, roads: g.roads })).digest('hex')).toBe(expected);
});
