import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createGunzip, gunzipSync, gzipSync, constants } from 'node:zlib';
import { createInterface } from 'node:readline';

const dir = process.argv[2];
if (!dir) throw Error('Run directory required');
const checkpoint = process.argv[3];
const hourly = JSON.parse(gunzipSync(await readFile(`${dir}/${checkpoint ? `${checkpoint}.health` : 'hourly'}.json.gz`)).toString());
const groups = new Map<string, any>();
const hard = ['dangling_cause', 'invalid_entity_reference', 'epistemic_leak', 'surrender_or_custody_ignored'];
const failures: any[] = [];
for (const h of hourly) {
  for (const c of h.health.checks) if (c.status === 'FAIL') failures.push({ tick: h.tick, check: c });
  for (const a of h.health.anomalies) {
    if (hard.includes(a.type)) failures.push({ tick: h.tick, anomaly: a });
    const key = `${a.type}:${a.entity ?? ''}:${a.data.key ?? ''}`;
    const old = groups.get(key);
    if (!old) groups.set(key, { key, samples: 1, first: h.tick, last: h.tick, worst: a, rows: [] });
    else { old.samples++; old.last = h.tick; if (a.occurrences > old.worst.occurrences) old.worst = a; }
  }
}
const wanted = [...groups.values()];
const lines = createInterface({ input: createReadStream(`${dir}/receipts.ndjson.gz`).pipe(createGunzip(checkpoint ? { finishFlush: constants.Z_SYNC_FLUSH } : {})), crlfDelay: Infinity });
for await (const line of lines) {
  let row; try { row = JSON.parse(line); } catch (error) { if (checkpoint) continue; throw error; }
  const e = row.event;
  for (const g of wanted) {
    const a = g.worst;
    if (e.tick < a.firstSeen || e.tick > a.lastSeen || a.entity && e.actor !== a.entity) continue;
    const matches = a.type === 'goal_churn' ? e.type === 'goal_changed' : a.type === 'stuck_agent' ? e.type === 'path_failure'
      : a.type === 'event_spam' ? `${e.type}:${e.actor ?? ''}:${e.target ?? ''}` === a.data.key : a.relatedEvents.includes(e.id);
    if (matches) g.rows.push(row);
  }
}
const prefix = checkpoint ? `${checkpoint}.health-review` : 'health-review';
await writeFile(`${dir}/${prefix}.json.gz`, gzipSync(JSON.stringify({ samples: hourly.length, failures, groups: wanted }), { level: 1 }));
const summary = { samples: hourly.length, failures, groups: wanted.map(({ rows, ...g }) => ({ ...g, captured: rows.length,
  eventTypes: [...new Set(rows.map((r: any) => r.event.type))], goalTypes: [...new Set(rows.map((r: any) => r.actorAtEmission?.goal?.type ?? r.event.data.goalType).filter(Boolean))] })) };
await writeFile(`${dir}/${prefix}-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ samples: hourly.length, failures: failures.length, groups: wanted.length }));
