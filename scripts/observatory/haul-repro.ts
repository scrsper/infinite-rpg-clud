/** Exact weak-worker regression setup; retain the reason its accepted task ends. */
import { writeFile } from 'node:fs/promises';
import { newWorld } from '../../src/sim/persist/save';
import { Simulation } from '../../src/sim/mind/agent';
import { makeItem } from '../../src/sim/world/factory';
import { createHaulTask, claimHaulTask, personalCarryUnits } from '../../src/sim/logistics/haul';
const { world: w, gen } = newWorld(5502), sim = new Simulation(w), p = gen.people.bors;
p.attributes.strength = 2;
const mill = w.places().find(p => p.type === 'mill')!, bakery = w.places().find(p => p.type === 'bakery')!;
makeItem(w, 'plank', 'plank', { placeId: mill.id, pos: { ...mill.inside }, quantity: 40 });
const task = createHaulTask(w, { resource: 'plank', quantity: 10, sourcePlaceId: mill.id, destPlaceId: bakery.id, reason: 'x', requesterId: null, priority: .95 });
claimHaulTask(w, task, p);
const start = w.now, rows: unknown[] = [];
w.onEvent(e => {
  if (e.actor !== p.id && e.data.haulId !== task.id) return;
  if (['goal_changed', 'goal_abandoned', 'path_failure', 'haul_failed', 'resource_delivered', 'haul_started', 'haul_picked_up'].includes(e.type)) rows.push(JSON.parse(JSON.stringify({ event: e, goal: p.mind.goal, plan: p.mind.plan, pos: w.positionOf(p.id), task })));
});
while (!['delivered', 'failed', 'cancelled'].includes(task.status) && w.now - start < 10 * 3600) {
  const wd = w.clock.advance(.15); w.physicalTime += .15; sim.step(.15, wd); sim.flushSpeech();
}
const result = { start, end: w.now, perTrip: personalCarryUnits(w, p, 'plank'), task, rows };
await writeFile(process.argv[2], JSON.stringify(result, null, 2));
console.log(JSON.stringify({ start, end: w.now, task, rows: rows.length }));
