import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { deserialize, serialize } from '../../src/sim/persist/save';
import { Simulation } from '../../src/sim/mind/agent';
import { stepWorld } from '../../src/observatory/runtime';
import { canonicalSave, canonicalDigest } from '../../src/observatory/fingerprint';

export function differences(a: any, b: any, path = '$', rows: any[] = []): any[] {
  if (a === b) return rows;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], `${path}.${key}`, rows);
  } else rows.push({ path, a, b });
  return rows;
}
const file = process.argv[2], steps = Number(process.argv[3] ?? 0);
const original = JSON.parse(gunzipSync(await readFile(file)).toString()); delete original.savedAt;
const stable = (v: any): any => v && typeof v === 'object' ? Array.isArray(v) ? v.map(stable) : Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const restored = deserialize(JSON.stringify(original)); if (!restored) throw Error('Rejected save');
const { world } = restored, sim = new Simulation(world);
const rows = differences(stable(original), canonicalSave(world));
for (let i = 0; i < steps; i++) stepWorld(world, sim);
const result = { input: file, steps, initialDifferences: rows.length, differences: rows, hash: canonicalDigest(world) };
await writeFile(`${file}.continuity.json.gz`, gzipSync(JSON.stringify(result), { level: 1 }));
if (steps) await writeFile(`${file}.continued-${steps}.json.gz`, gzipSync(serialize(world), { level: 1 }));
console.log(JSON.stringify({ ...result, differences: rows.slice(0, 12) }, null, 2));
