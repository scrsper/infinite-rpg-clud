/** Isolated step-by-step receipt around a body's transition into a blocked region. */
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { deserialize } from '../../src/sim/persist/save';
import { Simulation } from '../../src/sim/mind/agent';
import { stepWorld } from '../../src/observatory/runtime';
import { canonicalDigest } from '../../src/observatory/fingerprint';

const [input, actor, through, output] = process.argv.slice(2);
const loaded = deserialize(gunzipSync(await readFile(input)).toString());
if (!loaded) throw Error('Rejected checkpoint');
const w = loaded.world, sim = new Simulation(w), p = w.person(actor)!;
if (!p || !Number.isFinite(Number(through)) || Number(through) <= w.now) throw Error('Invalid actor/end time');
const events: unknown[] = [], transitions: unknown[] = [];
w.onEvent(e => { if (e.actor === actor || e.target === actor) { events.push(structuredClone(e)); if (events.length > 40) events.shift(); } });
const snapshot = () => {
  const b = w.primaryBody(actor)!;
  return structuredClone({ tick: w.now, physicalTime: w.physicalTime, pos: b.pos, vel: b.vel, pose: b.pose,
    goal: p.mind.goal, plan: p.mind.plan, path: b.path, pathIndex: b.pathIndex, action: b.combatAction });
};
while (w.now < Number(through)) {
  const before = snapshot(); stepWorld(w, sim, .15); const after = snapshot();
  if (Math.floor(before.pos.x) === Math.floor(after.pos.x) && Math.floor(before.pos.z) === Math.floor(after.pos.z) && Math.abs(after.pos.y - before.pos.y) <= 1.05) continue;
  if (w.nav.findPath(after.pos, before.pos)) continue;
  const x = Math.floor(after.pos.x), z = Math.floor(after.pos.z);
  const cells = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) cells.push({ x: x + dx, z: z + dz, y: w.nav.floorY(x + dx, z + dz), cost: w.nav.walkCost(x + dx, z + dz) });
  transitions.push({ before, after, cells, events: structuredClone(events) });
}
await writeFile(output, JSON.stringify({ input, actor, through: w.now, finalHash: canonicalDigest(w), transitions }, null, 2));
console.log(JSON.stringify({ output, transitions: transitions.length }));
