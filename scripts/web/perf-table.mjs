import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Print a Markdown table from perf.ts result files:  node scripts/web/perf-table.mjs <dir> [--phase overall] */
const dir = resolve(process.argv[2] ?? '.debug/web/perf');
const phase = process.argv.includes('--phase') ? process.argv[process.argv.indexOf('--phase') + 1] : 'overall';
const rows = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'manifest.json').sort().map(f => ({ f, r: JSON.parse(readFileSync(join(dir, f), 'utf8')) })).filter(x => x.r.phases);
console.log('| Renderer | Size | Refresh cap | Tier | Median | p95 | p99 | Max | Frames >50 ms | Frames |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const { r } of rows) {
  const s = phase === 'overall' ? r.overall : r.phases[phase]; if (!s) continue;
  console.log(`| ${r.info.webgpu ? 'WebGPU' : 'WebGL 2'} | ${r.requested.width}×${r.requested.height} | ${r.uncapped ? "lifted" : "on (display refresh)"} | ${r.info.quality.tier}${r.info.quality.resolutionScale < 1 ? ` (${r.info.quality.resolutionScale}×)` : ''} | ${s.medianMs} ms | ${s.p95Ms} ms | ${s.p99Ms} ms | ${s.maxMs} ms | ${s.over50} | ${s.frames} |`);
}
