import { readFile, writeFile } from 'node:fs/promises';
const input = process.argv[2];
const profile = JSON.parse(await readFile(input, 'utf8'));
const nodes = new Map(profile.nodes.map(n => [n.id, n]));
const parents = new Map();
for (const n of profile.nodes) for (const id of n.children ?? []) parents.set(id, n.id);
const own = new Map(), inclusive = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  let id = profile.samples[i]; const ms = (profile.timeDeltas[i] ?? 0) / 1000;
  own.set(id, (own.get(id) ?? 0) + ms);
  while (id) { inclusive.set(id, (inclusive.get(id) ?? 0) + ms); id = parents.get(id); }
}
const grouped = new Map();
for (const n of profile.nodes) {
  const f = n.callFrame; if (!f.url.includes('/src/sim/')) continue;
  const key = `${f.functionName} ${f.url.split('/src/')[1]}:${f.lineNumber + 1}`;
  const row = grouped.get(key) ?? { function: key, selfMs: 0, inclusiveMs: 0 };
  row.selfMs += own.get(n.id) ?? 0; row.inclusiveMs += inclusive.get(n.id) ?? 0; grouped.set(key, row);
}
const rows = [...grouped.values()];
const report = { input, elapsedMs: (profile.endTime - profile.startTime) / 1000,
  self: rows.slice().sort((a, b) => b.selfMs - a.selfMs), inclusive: rows.sort((a, b) => b.inclusiveMs - a.inclusiveMs),
  caveat: 'Statistical V8 CPU samples, inclusive scopes overlap. Wall-time and instrumentation cost are reported separately.' };
await writeFile(`${input}.summary.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ elapsedMs: report.elapsedMs, self: report.self.slice(0, 18), inclusive: report.inclusive.slice(0, 18) }, null, 2));
