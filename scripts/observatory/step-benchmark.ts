/** Benchmark an immutable isolated checkpoint. No event listeners or in-step diagnostics. */
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { deserialize } from '../../src/sim/persist/save';
import { Simulation } from '../../src/sim/mind/agent';
import { stepWorld } from '../../src/observatory/runtime';
import { canonicalDigest } from '../../src/observatory/fingerprint';

const input = process.argv[2], output = process.argv[3], hours = Number(process.argv[4] ?? 3);
if (!input || !output || !Number.isFinite(hours) || hours <= 0 || hours > 72) throw Error('Usage: checkpoint.gz output.json [hours <= 72]');
const raw = gunzipSync(await readFile(input)).toString(), runs = [];
for (let run = 0; run < 3; run++) {
  const state = deserialize(raw); if (!state) throw Error('Rejected checkpoint');
  const w = state.world, sim = new Simulation(w), target = w.now + hours * 3600;
  const times: number[] = [], initialHash = canonicalDigest(w), started = performance.now();
  while (w.now < target - 1e-6) { const t = performance.now(); stepWorld(w, sim, Math.min(.15, (target - w.now) / w.clock.timeScale)); times.push(performance.now() - t); }
  const wallMs = performance.now() - started, finalHash = canonicalDigest(w), sorted = times.slice().sort((a, b) => a - b);
  runs.push({ run, initialHash, finalHash, worldTime: w.now, steps: times.length, wallMs, median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1), finalStep: times.at(-1), navSearches: w.nav.searches, navCacheHits: w.nav.cacheHits });
  console.log(JSON.stringify(runs.at(-1)));
}
await writeFile(output, JSON.stringify({ input, hours, instrumentation: 'No in-step profiler or event listeners. Includes cold path caches on each independent restore. Three consecutive trials; shared-host wall times.', runs }, null, 2));
