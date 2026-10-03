import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { deserialize } from '../../src/sim/persist/save';
import { Simulation } from '../../src/sim/mind/agent';
import { stepWorld } from '../../src/observatory/runtime';
import { conflictBetween } from '../../src/sim/social/conflict';
const input = process.argv[2], output = process.argv[3];
const { world: w } = deserialize(gunzipSync(await readFile(input)).toString())!;
const sim = new Simulation(w), start = w.now, rows: any[] = [];
w.onEvent(e => {
  if (e.type !== 'goal_completed' || e.data.goalType !== 'attack' || e.actor !== 'p_37') return;
  const p = w.person(e.actor)!, target = p.mind.goal?.targetEntity, t = w.person(target);
  rows.push(JSON.parse(JSON.stringify({ e, actor: p, body: w.primaryBody(p.id), target: t,
    targetBody: target && w.primaryBody(target), conflict: target && conflictBetween(w, p.id, target) })));
});
while (w.now < start + 3 * 86400 && rows.length < 4) stepWorld(w, sim);
await writeFile(output, JSON.stringify(rows));
console.log(JSON.stringify(rows.map(r => ({ event: r.e, goal: r.actor.mind.goal, plan: r.actor.mind.plan,
  pos: r.body.pos, target: r.target?.id, pose: r.targetBody?.pose, targetGoal: r.target?.mind.goal, conflict: r.conflict }))));
