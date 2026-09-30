/** Read-only receipts for isolated Observatory runs. No repair, RNG draws, or live saves. */
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createGzip, gzipSync, gunzipSync } from 'node:zlib';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { createScenario, SCENARIO_VERSION } from '../../src/observatory/scenarios';
import { stepWorld, STEP } from '../../src/observatory/runtime';
import { canonicalDigest } from '../../src/observatory/fingerprint';
import { healthSnapshot } from '../../src/observatory/health';
import { resourceState } from '../../src/observatory/readers';
import { serialize, deserialize, SAVE_VERSION } from '../../src/sim/persist/save';
import { Simulation } from '../../src/sim/mind/agent';
import type { World } from '../../src/sim/core/world';
import type { Person, WorldEvent } from '../../src/sim/core/types';
import { isFood } from '../../src/sim/world/factory';
import { RunDiagnostics } from '../../src/observatory/diagnostics';

const arg = (name: string, fallback: string) => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const days = Number(arg('days', '30')), seed = Number(arg('seed', '918271'));
if (!Number.isFinite(days) || days <= 0 || days > 30 || !Number.isInteger(seed) || seed < 0) throw new Error('Invalid isolated run arguments');
const out = arg('out', `.debug/observatory-hardening/run-${seed}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const input = arg('input', ''), capture = arg('capture', 'true') === 'true';
if (existsSync(`${out}/receipts.ndjson.gz`) || existsSync(`${out}/report.json`)) throw Error('Output already contains evidence; choose a new isolated output directory');
await mkdir(out, { recursive: true });
// Pin the running implementation even when later edits are made during a long run.
const sources: Record<string, string> = {};
for (const root of ['src/sim', 'src/observatory']) {
  for (const name of (await readdir(root, { recursive: true })).filter(n => n.endsWith('.ts')).sort()) {
    const file = `${root}/${name.replaceAll('\\', '/')}`;
    sources[file] = createHash('sha256').update(await readFile(file)).digest('hex');
  }
}
const sourceDigest = createHash('sha256').update(JSON.stringify(sources)).digest('hex');
await writeFile(`${out}/source.json`, JSON.stringify({ sourceDigest, sources }, null, 2));
const loaded = input ? deserialize(gunzipSync(await readFile(input)).toString()) : null;
if (input && !loaded) throw new Error('Checkpoint rejected');
const { world: w, sim } = loaded ? { world: loaded.world, sim: new Simulation(loaded.world) } : createScenario('ordinary', seed);
const diagnostics = new RunDiagnostics(w);
const start = w.now, to = start + days * 86400;
const stream = createGzip({ level: 1 }); const destination = createWriteStream(`${out}/receipts.ndjson.gz`);
stream.pipe(destination);
const done = finished(destination);
let pending: string[] = [], observerMs = 0, navCalls = 0, navMs = 0;
const eventCounts: Record<string, number> = {};
const foodLedger = { initial: 0, production: 0, consumption: 0, spoilage: 0, transformationInput: 0, final: 0, unexplained: 0 };
const foodUnits = () => w.items().filter(i => isFood(i.type)).reduce((n, i) => n + i.quantity, 0);
foodLedger.initial = foodUnits();
const frame = (p: Person) => ({ id: p.id, name: p.name, alive: p.alive, needs: p.needs, wealth: p.wealth,
  homeId: p.homeId, workId: p.workId, householdId: p.householdId, inventory: p.inventory.map(id => w.item(id)),
  bodies: p.bodies.map(id => { const b = w.body(id); return b && { id, pos: b.pos, health: b.health, maxHealth: b.maxHealth, injuries: b.injuries, dead: b.dead, present: b.present, path: b.path, pathGoal: b.pathGoal }; }),
  goal: p.mind.goal, plan: p.mind.plan, decision: p.mind.decision, commitment: p.mind.commitment,
  investigated: [...p.mind.investigated], cooldowns: p.mind.pursuitCooldowns, noFoodUntil: p.mind.noFoodUntil,
  goalBelief: p.mind.goal?.data?.key ? p.knowledge[String(p.mind.goal.data.key)] : undefined,
  targetLocation: p.mind.goal?.targetEntity ? p.knowledge[`loc:${p.mind.goal.targetEntity}`] : undefined,
  targetHome: p.mind.goal?.targetEntity ? p.knowledge[`home:${p.mind.goal.targetEntity}`] : undefined,
  percepts: p.mind.percepts,
});
const receipt = (e: WorldEvent) => {
  const at = performance.now();
  eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1;
  const d = e.data;
  if (e.type === 'food_consumed' && e.item && isFood(d.food)) foodLedger.consumption++;
  if (e.type === 'resource_spoiled' && isFood(d.resource as any)) foodLedger.spoilage += Number(d.lost);
  if (e.type === 'resource_transformed') {
    if (isFood(d.to as any)) foodLedger.production += Number(d.toQty);
    if (isFood(d.from as any)) foodLedger.transformationInput += Number(d.fromQty);
  }
  if (e.type === 'resource_extracted' && isFood(d.yield as any)) foodLedger.production += Number(d.amount);
  if (capture) {
    const p = e.actor ? w.person(e.actor) : undefined;
    const diagnostic = p && (['goal_changed', 'goal_abandoned', 'path_failure', 'investigation', 'work_blocked', 'attack'].includes(e.type)
      || e.type === 'perceived' && e.data.kind === 'failed_handoff'
      || e.type === 'goal_completed' && ['investigate', 'provide', 'attack', 'flee', 'eat', 'drink'].includes(String(e.data.goalType))) ? frame(p) : undefined;
    pending.push(JSON.stringify({ event: e, actorAtEmission: diagnostic }) + '\n');
  }
  observerMs += performance.now() - at;
};
w.onEvent(receipt);
// Existing non-canonical profiler and per-instance delegate: neither is serialized nor reads RNG.
sim.profile = {};
const findPath = w.nav.findPath.bind(w.nav);
w.nav.findPath = (...args: Parameters<typeof findPath>) => { const t = performance.now(); navCalls++; try { return findPath(...args); } finally { navMs += performance.now() - t; } };
const summary = () => ({ tick: w.now, physicalTime: w.physicalTime, population: w.livingPersons().length,
  food: foodUnits(), resources: resourceState(w), eventCount: w.events.length, lifetimeEvents: { ...eventCounts },
  knowledge: w.persons().reduce((n, p) => n + Object.keys(p.knowledge).length, 0),
  outcomes: { conflicts: w.conflicts.length, relationships: w.persons().reduce((n, p) => n + Object.keys(p.relationships).length, 0), labor: w.workStints, progression: w.persons().map(p => ({ id: p.id, skills: p.skills })) },
  people: w.persons().map(p => ({ id: p.id, name: p.name, alive: p.alive, needs: { ...p.needs }, goal: p.mind.goal?.type, wealth: p.wealth,
    work: p.workId, household: p.householdId, bodies: p.bodies.map(id => { const b = w.body(id); return b && { id, pos: { ...b.pos }, health: b.health, maxHealth: b.maxHealth, injuries: b.injuries }; }) })),
  households: w.households().map(h => ({ id: h.id, name: h.name, members: h.memberIds, wealth: h.wealth,
    hungry: h.memberIds.filter(id => (w.person(id)?.needs.hunger ?? 0) > .7), thirsty: h.memberIds.filter(id => (w.person(id)?.needs.thirst ?? 0) > .7) })),
});
const checkpoint = async (label: string) => {
  await writeFile(`${out}/${label}.save.json.gz`, gzipSync(serialize(w), { level: 1 }));
  await writeFile(`${out}/${label}.summary.json`, JSON.stringify({ ...summary(), hash: canonicalDigest(w) }, null, 2));
  await writeFile(`${out}/${label}.health.json.gz`, gzipSync(JSON.stringify(history), { level: 1 }));
};
const timings: number[] = [], slowest: any[] = [], history: any[] = [];
let previous: ReturnType<typeof healthSnapshot>['current'] | undefined;
let healthAt = start, lastProgress = performance.now();
const initial = summary(); const initialHash = canonicalDigest(w);
await checkpoint('initial');
const began = performance.now();
const checkpoints = new Set([1, 7, 15, 29.875, 30].filter(d => d <= days).map(d => start + d * 86400));
while (w.now < to - 1e-6) {
  const chunkEnd = performance.now() + 15;
  while (w.now < to - 1e-6 && performance.now() < chunkEnd) {
    const profileBefore = { ...sim.profile }, navBefore = navMs, callsBefore = navCalls, obsBefore = observerMs;
    const t = performance.now(); stepWorld(w, sim, Math.min(STEP, (to - w.now) / w.clock.timeScale)); const ms = performance.now() - t;
    timings.push(ms);
    if (slowest.length < 50 || ms > slowest.at(-1).ms) {
      slowest.push({ tick: w.now, ms, observerMs: observerMs - obsBefore, navMs: navMs - navBefore, navCalls: navCalls - callsBefore,
        subsystems: Object.fromEntries(Object.entries(sim.profile!).map(([k, v]) => [k, v - (profileBefore[k] ?? 0)])),
        events: w.events.length, knowledge: w.persons().reduce((n, p) => n + Object.keys(p.knowledge).length, 0), entities: w.entities.size });
      slowest.sort((a, b) => b.ms - a.ms); slowest.length = Math.min(50, slowest.length);
    }
    if (w.now - healthAt >= 3600) {
      const sample = healthSnapshot(w, { seed: w.seed, requestedDays: days, worldStart: start, startingPopulation: initial.population }, previous, [], ms, diagnostics.checks());
      previous = sample.current; healthAt = w.now;
      history.push({ tick: w.now, health: sample.report, state: summary() });
    }
    if (checkpoints.has(w.now)) { await checkpoint(`day-${(w.now - start) / 86400}`); checkpoints.delete(w.now); }
  }
  if (pending.length) { const data = pending.join(''); pending = []; if (!stream.write(data)) await once(stream, 'drain'); }
  if (performance.now() - lastProgress >= 30000) { console.log(JSON.stringify({ days: (w.now - start) / 86400, retainedEvents: w.events.length, food: foodUnits(), elapsedMs: performance.now() - began })); lastProgress = performance.now(); }
  await new Promise<void>(resolve => setImmediate(resolve));
}
stream.end(); await done;
await checkpoint('final');
foodLedger.final = foodUnits();
foodLedger.unexplained = foodLedger.final - (foodLedger.initial + foodLedger.production - foodLedger.consumption - foodLedger.spoilage - foodLedger.transformationInput);
const sorted = [...timings].sort((a, b) => a - b);
const finalHealth = healthSnapshot(w, { seed: w.seed, requestedDays: days, worldStart: start, startingPopulation: initial.population }, previous, [], timings.at(-1), diagnostics.checks()).report;
const report = { scenario: 'ordinary', scenarioVersion: SCENARIO_VERSION, sourceDigest, seed: w.seed, saveSchema: SAVE_VERSION, days, step: STEP, start, to: w.now, initialHash, finalHash: canonicalDigest(w),
  elapsedMs: performance.now() - began, initial, final: summary(), foodLedger, health: finalHealth,
  performance: { steps: timings.length, median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1), observerMs, navCalls, navMs, subsystems: sim.profile, slowest },
  limitations: ['Event receipts are immutable emission-time observations; later perceivedBy/effects edits remain in saves.', 'Timing includes the measured receipt observer cost; instrumented timings must not be reported as uninstrumented benchmarks.', 'Food ledger uses represented event receipts; nonzero unexplained balance is evidence of a gap, not normalized away.'] };
await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
await writeFile(`${out}/diagnostics.json`, JSON.stringify(diagnostics.summary(), null, 2));
await writeFile(`${out}/hourly.json.gz`, gzipSync(JSON.stringify(history), { level: 1 }));
await writeFile(`${out}/timings.json.gz`, gzipSync(JSON.stringify(timings), { level: 1 }));
console.log(JSON.stringify({ out, days, foodLedger, health: finalHealth.status, hash: report.finalHash, performance: { median: report.performance.median, p95: report.performance.p95, max: report.performance.max } }));
