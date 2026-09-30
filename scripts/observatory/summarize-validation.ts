import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const primary = process.argv[2] ?? '.debug/observatory-hardening/reviewed-918271';
const others = process.argv[3];
if (!others) throw Error('Provide the matrix output directory');
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const gz = async (path: string) => JSON.parse(gunzipSync(await readFile(path)).toString());
const rows = [], runs = [];
for (const seed of [918271, 918272, 918273]) {
  const dir = seed === 918271 ? primary : `${others}/repaired-${seed}`;
  const report = await json(`${dir}/report.json`), hourly = await gz(`${dir}/hourly.json.gz`), review = await json(`${dir}/health-review-summary.json`);
  const source = await json(`${dir}/source.json`);
  const simulationSourceHash = createHash('sha256').update(JSON.stringify(Object.entries(source.sources).filter(([path]) => path.startsWith('src/sim/')))).digest('hex');
  runs.push({ seed, dir, sourceDigest: source.sourceDigest, simulationSourceHash, foodLedger: report.foodLedger, finalHash: report.finalHash, performance: { median: report.performance.median, p95: report.performance.p95, max: report.performance.max }, hardFailures: review.failures, warningGroups: review.groups.length });
  for (const days of [1, 7, 30]) {
    const s = await json(`${dir}/day-${days}.summary.json`), events = s.lifetimeEvents;
    const saved = await gz(`${dir}/day-${days}.save.json.gz`);
    const impossibleResources = [
      ...saved.items.filter((i: any) => !Number.isFinite(i.quantity) || i.quantity < 0).map((i: any) => ({ kind: 'item', id: i.id, quantity: i.quantity })),
      ...(saved.resourceNodes ?? []).filter((n: any) => !Number.isFinite(n.remaining) || n.remaining < 0 || n.remaining > n.capacity + 1e-6).map((n: any) => ({ kind: 'resource-node', id: n.id, remaining: n.remaining, capacity: n.capacity })),
    ];
    const identities = [...saved.persons, ...saved.bodies, ...saved.items, ...(saved.containers ?? []), ...(saved.creatures ?? [])].map((e: any) => e.id);
    const seen = new Set<string>(), duplicateIdentities = identities.filter((id: string) => { if (seen.has(id)) return true; seen.add(id); return false; });
    const samples = hourly.filter((h: any) => h.tick <= s.tick);
    const sumEvents = (types: string[]) => types.reduce((n, t) => n + (events[t] ?? 0), 0);
    rows.push({ seed, days, population: s.population, food: s.food,
      stressedHouseholds: s.households.filter((h: any) => h.hungry.length || h.thirsty.length).length,
      lowHealthBodies: s.people.filter((p: any) => p.alive).flatMap((p: any) => p.bodies).filter((b: any) => b && b.health < b.maxHealth).length,
      productionReceipts: sumEvents(['resource_transformed', 'resource_extracted', 'crop_harvested']),
      purchases: events.purchase_made ?? 0, deliveredHauls: events.resource_delivered ?? 0, conflictsStarted: events.conflict_started ?? 0,
      knowledge: s.knowledge, knowledgeGained: events.knowledge_gained ?? 0,
      retainedEvents: s.eventCount, emittedEvents: Object.values(events).reduce((n: number, v: any) => n + v, 0),
      relationships: s.outcomes.relationships, relationshipChanges: events.relationship_changed ?? 0,
      labor: s.outcomes.labor, progression: s.outcomes.progression,
      hourlySamples: samples.length, hardFailureSamples: samples.filter((h: any) => h.health.checks.some((c: any) => c.status === 'FAIL')).length,
      impossibleResources, duplicateIdentities,
      hash: s.hash });
  }
}
const continuation = await gz(`${others}/continuation-diff.json.gz`);
const replays = await Promise.all([1, 7, 30].map(async days => ({ days, ...await gz(`${others}/repeat-day-${days}-diff.json.gz`) })));
const result = { scope: 'Ordinary autonomous fixture. All persisted canonical fields compared; only envelope savedAt excluded. Horizons are checkpoints along continuous 30-day runs. Outcomes are not health verdicts.', primary, others, runs, rows, continuation, replays };
await writeFile('.debug/observatory-hardening/validation-summary.json', JSON.stringify(result, null, 2));
const columns = ['Seed', 'Days', 'Alive', 'Food', 'Stressed households', 'Low-HP bodies', 'Production receipts', 'Purchases', 'Delivered hauls', 'Conflicts started', 'Knowledge', 'Emitted events'];
const table = [columns.join(' | '), columns.map(() => '---').join(' | '), ...rows.map(r => [r.seed, r.days, r.population, r.food, r.stressedHouseholds, r.lowHealthBodies, r.productionReceipts, r.purchases, r.deliveredHauls, r.conflictsStarted, r.knowledge, r.emittedEvents].join(' | '))].map(s => '| ' + s + ' |').join('\n');
await writeFile('.debug/observatory-hardening/validation-table.md', table + '\n');
console.log(JSON.stringify({ rows: rows.length, hardFailures: runs.map(r => [r.seed, r.hardFailures.length]), continuationDifferences: continuation.differences, replayDifferences: replays.map(r => [r.days, r.differences]) }));
