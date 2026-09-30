import { writeFile } from 'node:fs/promises';
import { createScenario } from '../../src/observatory/scenarios';
import { stepWorld } from '../../src/observatory/runtime';
const { world: w, sim } = createScenario('ordinary', 918271), start = w.now;
const rows: any[] = [];
w.onEvent(e => {
  if (!['goal_completed', 'goal_changed', 'pickup', 'gift', 'goal_abandoned'].includes(e.type) || e.actor !== 'p_15') return;
  const p = w.person(e.actor)!, g = p.mind.goal;
  if (g?.type !== 'provide') return;
  rows.push(JSON.parse(JSON.stringify({ e, pos: w.positionOf(p.id), goal: g, plan: p.mind.plan,
    source: w.item(g.data?.itemId), carried: p.inventory.map(id => w.item(id)), commitment: p.mind.commitment,
    destination: w.positionOf(g.targetEntity!), percepts: p.mind.percepts })));
});
while (w.now < start + 86400) stepWorld(w, sim);
const path = process.argv[2] ?? 'D:/TornVeilValidation/observatory-hardening-20260930/provide-before.json';
await writeFile(path, JSON.stringify(rows, null, 2));
console.log(JSON.stringify({ path, count: rows.length, first: rows.filter(r => r.e.type === 'goal_completed').slice(0, 3) }, null, 2));
