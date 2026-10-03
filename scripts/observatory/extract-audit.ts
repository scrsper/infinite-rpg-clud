import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createGunzip, gunzipSync, constants } from 'node:zlib';
import { createInterface } from 'node:readline';
import { deserialize } from '../../src/sim/persist/save';
import { findAccessibleFood } from '../../src/sim/world/metabolism';
import { isFood } from '../../src/sim/world/factory';

const dir = process.argv[2] ?? '.debug/observatory-hardening/baseline/replay-918271';
const label = process.argv[3] ?? 'final';
const loaded = deserialize(gunzipSync(await readFile(`${dir}/${label}.save.json.gz`)).toString());
if (!loaded) throw Error('Rejected save');
const w = loaded.world, start = 8666400, end = w.now;
const counts: Record<string, number> = {}, signatures = new Map<string, any>();
const flow = new Map<string, any>();
const completions = new Map<string, any>();
const failures: any[] = [], switches: any[] = [], attacks: any[] = [], workBlocks = new Map<string, any>();
const pathGroups = new Map<string, any>();
const foods = w.items().filter(i => isFood(i.type) && i.quantity > 0);
const finalInjured = w.bodies().filter(b => !b.dead && b.health < b.maxHealth);
const lines = createInterface({ input: createReadStream(`${dir}/receipts.ndjson.gz`).pipe(createGunzip({ finishFlush: constants.Z_SYNC_FLUSH })), crlfDelay: Infinity });
let receipts = 0, malformed = 0;
for await (const line of lines) {
  let row: any; try { row = JSON.parse(line); } catch { malformed++; continue; }
  const { event: e, actorAtEmission: a } = row;
  if (e.tick > end) break;
  receipts++; counts[e.type] = (counts[e.type] ?? 0) + 1;
  if (/resource_transformed|resource_extracted|crop_harvested|food_consumed|resource_spoiled|food_purchase_failed|work_blocked|resource_shortage|haul_failed|purchase_made|wholesale|bought|wage/.test(e.type)) {
    const key = [e.type, e.actor, e.placeId, e.data.from, e.data.to, e.data.resource, e.data.reason, e.data.food, e.data.need].join(':');
    const f = flow.get(key) ?? { type: e.type, actor: e.actor, place: e.placeId, data: e.data, count: 0, first: e.id, firstTick: e.tick, last: e.id, lastTick: e.tick, quantities: {} };
    f.count++; f.last = e.id; f.lastTick = e.tick; f.lastData = e.data;
    for (const [k, v] of Object.entries(e.data)) if (typeof v === 'number') f.quantities[k] = (f.quantities[k] ?? 0) + v;
    flow.set(key, f);
  }
  if (e.type === 'work_blocked') {
    const key = `${e.actor}:${e.placeId}:${e.data.reason}`; const f = workBlocks.get(key) ?? { count: 0, first: row, last: row };
    f.count++; f.last = row; workBlocks.set(key, f);
  }
  if (e.type === 'path_failure') {
    const key = `${e.actor}:${e.data.goal}:${JSON.stringify(e.data.destination)}`;
    const f = pathGroups.get(key) ?? { key, count: 0, first: row, last: row };
    f.count++; f.last = row; pathGroups.set(key, f);
  }
  if (e.type === 'goal_completed' && a?.goal?.type === 'investigate') {
    const key = `${e.actor}:${a.goal.createdAt}:${a.goal.data?.key}`;
    const f = completions.get(key) ?? { actor: e.actor, key: a.goal.data?.key, goalCreatedAt: a.goal.createdAt, count: 0, first: row, last: row };
    f.count++; f.last = row; completions.set(key, f);
  }
  if (e.type === 'attack' && finalInjured.some(b => b.ownerId === e.target)) attacks.push(row);
  if (e.tick >= end - 10800) {
    const key = `${e.type}:${e.actor ?? ''}:${e.target ?? ''}`;
    const f = signatures.get(key) ?? { key, count: 0, first: e.tick, last: e.tick, firstId: e.id, lastId: e.id };
    f.count++; f.last = e.tick; f.lastId = e.id; signatures.set(key, f);
    if (e.type === 'path_failure') failures.push(row);
    if (e.type === 'goal_changed') switches.push(row);
  }
}
const report = { from: start, to: end, receipts, malformed,
  counts, flows: [...flow.values()], workBlocks: [...workBlocks.values()], pathGroups: [...pathGroups.values()],
  investigatedPlanRepetitions: [...completions.values()].filter(f => f.count > 1).sort((a, b) => b.count - a.count),
  finalWindow: { signatures: [...signatures.values()].sort((a, b) => b.count - a.count), failures, switches },
  injured: finalInjured.map(b => ({ body: b, person: w.person(b.ownerId)?.name, lastAttacks: attacks.filter(r => r.event.target === b.ownerId).slice(-10) })),
  foodStock: foods, workplaces: w.places().filter(p => w.persons().some(q => q.workId === p.id)).map(p => ({ place: p, staff: w.persons().filter(q => q.workId === p.id).map(q => ({ id: q.id, name: q.name, skills: q.skills, physiology: q.physiology, goal: q.mind.goal })), stock: w.items().filter(i => i.placeId === p.id) })),
  stressedHouseholds: w.households().filter(h => h.memberIds.some(id => { const p = w.person(id); return p && (p.needs.hunger > .7 || p.needs.thirst > .7); })).map(h => ({ household: h,
    members: h.memberIds.map(id => { const p = w.person(id); if (!p) return { id }; const b = w.primaryBody(p.id); return { id, name: p.name, needs: p.needs, physiology: p.physiology, wealth: p.wealth, body: b, goal: p.mind.goal, plan: p.mind.plan, decision: p.mind.decision,
      accessibleFood: findAccessibleFood(w, p, b ? w.placeAt(b.pos)?.id ?? null : null), inventory: p.inventory.map(id => w.item(id)), ownedFood: foods.filter(i => i.ownerId === id),
      foodBeliefs: Object.values(p.knowledge).filter(k => /food|pantry|price|shortage|bakery|tavern|market|water|well/.test(JSON.stringify(k))).map(k => ({ key: k.key, claim: k.claim, source: k.source, learnedAt: k.learnedAt, confidence: k.confidence })),
    }; }),
  })),
};
await writeFile(`${dir}/${label}.evidence.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ path: `${dir}/${label}.evidence.json`, receipts, repeats: report.investigatedPlanRepetitions.slice(0, 5).map(({ actor, key, count, first, last }) => ({ actor, key, count, first: first.event.id, firstTick: first.event.tick, last: last.event.id, lastTick: last.event.tick })), signatures: report.finalWindow.signatures.slice(0, 12), failures: failures.length, injuries: report.injured.map(i => i.person) }, null, 2));
