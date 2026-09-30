import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createGunzip, gunzipSync } from 'node:zlib';
import { deserialize } from '../../src/sim/persist/save';
import { Simulation } from '../../src/sim/mind/agent';
import { stepWorld } from '../../src/observatory/runtime';

const dir = '.debug/observatory-hardening/repaired-918271';
const groups = new Map<string, any>();
const lines = createInterface({ input: createReadStream(`${dir}/receipts.ndjson.gz`).pipe(createGunzip()), crlfDelay: Infinity });
for await (const line of lines) {
  const row = JSON.parse(line), e = row.event;
  if (e.actor !== 'p_15' || e.tick < 8724000 || e.tick > 8749200 || !['goal_changed', 'goal_completed'].includes(e.type)) continue;
  const key = `${e.type}/${e.data.goalType ?? e.data.to}/${e.data.goalKey ?? ''}`;
  const g = groups.get(key) ?? { key, count: 0, first: row, last: row };
  g.count++; g.last = row; groups.set(key, g);
}
const restored = deserialize(gunzipSync(await readFile(`${dir}/day-29.875.save.json.gz`)).toString())!;
const w = restored.world, sim = new Simulation(w), observations: any[] = [];
w.onEvent(e => {
  if (e.type !== 'production_observed' || !e.data.fieldId || !['p_18', 'p_24'].includes(e.actor!)) return;
  const p = w.person(e.actor!)!, key = `field-observation:${e.data.fieldId}`;
  observations.push(JSON.parse(JSON.stringify({ event: e, previousBelief: p.knowledge[key] ?? null, knowledgeCount: Object.keys(p.knowledge).length })));
});
for (let i = 0; i < 1200; i++) stepWorld(w, sim);
const result = { groups: [...groups.values()], observations, note: 'Production observations captured immediately before the observer inserts its new belief. Null means bounded knowledge had no prior record; it is not evidence the field itself changed.' };
await writeFile(`${dir}/retry-investigation.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ goals: [...groups.values()].map(g => ({ key: g.key, count: g.count, first: g.first.event.id, last: g.last.event.id })), observations: observations.length, absentPrior: observations.filter(o => !o.previousBelief).length, changedPrior: observations.filter(o => o.previousBelief).map(o => ({ id: o.event.id, before: o.previousBelief.claim, after: o.event.data })).slice(0, 5) }, null, 2));
