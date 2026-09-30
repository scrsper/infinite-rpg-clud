/** Preserve the unchanged eight-day regression's actual outcome for diagnosis. */
import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { Simulation } from '../../src/sim/mind/agent';
import { newWorld, serialize } from '../../src/sim/persist/save';
import { metabolismSummary } from '../../src/sim/world/metabolism';
import { RunDiagnostics } from '../../src/observatory/diagnostics';
const out = process.argv[2]; if (!out) throw Error('Output prefix required');
const { world: w } = newWorld(918271), sim = new Simulation(w), diagnostics = new RunDiagnostics(w);
const seconds = 8 * 86400 / 60, start = performance.now();
for (let e = 0; e < seconds; e += .15) {
  const dt = Math.min(.15, seconds - e), wd = w.clock.advance(dt); w.physicalTime += dt; sim.step(dt, wd); sim.flushSpeech();
}
const result = { elapsedMs: performance.now() - start, tally: w.runTally, summary: metabolismSummary(w), diagnostics: diagnostics.summary(),
  people: w.persons().map(p => ({ id: p.id, name: p.name, alive: p.alive, needs: p.needs, goal: p.mind.goal, plan: p.mind.plan,
    reports: p.mind.reports, lastDecisions: diagnostics.person(p.id) })) };
await writeFile(`${out}.json`, JSON.stringify(result));
await writeFile(`${out}.save.json.gz`, gzipSync(serialize(w), { level: 1 }));
console.log(JSON.stringify({ summary: result.summary, tally: result.tally, food: result.diagnostics.food, checks: result.diagnostics.checks }));
