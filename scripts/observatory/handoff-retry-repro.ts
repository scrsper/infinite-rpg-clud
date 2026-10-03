import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { deserialize } from '../../src/sim/persist/save';
import { Simulation } from '../../src/sim/mind/agent';
import { stepWorld } from '../../src/observatory/runtime';
const state = deserialize(gunzipSync(await readFile(process.argv[2])).toString())!;
const w = state.world, sim = new Simulation(w), rows: any[] = [];
while (w.now < 8943700) stepWorld(w, sim);
const p = w.person('p_27')!;
while (w.now < 8944380) {
  const before = JSON.stringify(p.mind.goal);
  stepWorld(w, sim);
  if (JSON.stringify(p.mind.goal) !== before || p.mind.plan.some(a => a.type === 'give')) rows.push(JSON.parse(JSON.stringify({ tick: w.now, goal: p.mind.goal, plan: p.mind.plan,
    loc: p.knowledge['loc:p_15'], home: p.knowledge['home:p_15'], percepts: p.mind.percepts.filter(pc => pc.entityId === 'p_15'),
    recipient: w.positionOf('p_15'), own: w.positionOf(p.id), pursuits: p.mind.pursuits?.filter(pu => pu.subjectId === 'p_15') })));
}
await writeFile(process.argv[3], JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows.slice(0, 5), null, 2));
