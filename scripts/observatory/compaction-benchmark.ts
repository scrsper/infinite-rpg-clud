import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { transformSync } from 'esbuild';
import { deserialize } from '../../src/sim/persist/save';
import { Simulation } from '../../src/sim/mind/agent';
import { canonicalDigest } from '../../src/observatory/fingerprint';

// Reference algorithm from the preserved local commit, executed only on disposable copies.
const source = execFileSync('git', ['show', '633a5d2:src/sim/core/world.ts'], { encoding: 'utf8' });
const body = source.slice(source.indexOf('  compactEvents(keep'), source.indexOf('  distance(a: Vec3'));
const code = transformSync(`function ${body.trim()}`, { loader: 'ts', target: 'es2022' }).code;
const original = new Function(`${code}; return compactEvents;`)() as (keep?: number) => void;
const raw = gunzipSync(await readFile(process.argv[2])).toString(), results = [];
for (let trial = 0; trial < 6; trial++) for (const variant of trial % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
  const loaded = deserialize(raw); if (!loaded) throw Error('Rejected save');
  const w = loaded.world; new Simulation(w);
  const before = canonicalDigest(w), t = performance.now();
  if (variant === 'baseline') original.call(w); else w.compactEvents();
  const ms = performance.now() - t, after = canonicalDigest(w);
  results.push({ trial, variant, ms, before, after, events: w.events.length });
  console.log(JSON.stringify(results.at(-1)));
}
await writeFile(process.argv[3], JSON.stringify({ results }, null, 2));
