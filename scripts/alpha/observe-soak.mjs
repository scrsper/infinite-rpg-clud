// Read-only wall-clock observation of a running isolated alpha service. No time acceleration.
// node scripts/alpha/observe-soak.mjs --root <environment> --out <new-directory> --seconds 7200
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
assert(arg('root') && arg('out'), '--root and --out required');
const root = resolve(arg('root')), out = resolve(arg('out')), seconds = Number(arg('seconds') ?? 7200);
assert(seconds >= 60 && seconds <= 14400 && !existsSync(out), 'Bounded duration and new evidence directory required');
const config = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8'));
const token = readFileSync(join(root, 'credentials', 'admin.token'), 'utf8').trim();
mkdirSync(out, { recursive: true });
const began = Date.now(), samples = [], errors = [];
writeFileSync(join(out, 'run.json'), JSON.stringify({ root, seconds, beganAt: new Date(began).toISOString(), pid: process.pid }, null, 2));
async function recordSample() {
  const at = Date.now();
  try {
    const response = await fetch(`http://127.0.0.1:${config.port}/admin/status`, { headers: { 'x-torn-veil-admin': token }, signal: AbortSignal.timeout(5000) });
    assert(response.ok, `status HTTP ${response.status}`);
    const state = await response.json();
    const sample = { at: new Date().toISOString(), elapsedSeconds: (Date.now() - began) / 1000, responseMs: Date.now() - at, ...state };
    samples.push(sample); appendFileSync(join(out, 'samples.jsonl'), JSON.stringify(sample) + '\n');
  } catch (error) { const e = { at: new Date().toISOString(), error: String(error) }; errors.push(e); appendFileSync(join(out, 'errors.jsonl'), JSON.stringify(e) + '\n'); }
}
while (Date.now() - began < seconds * 1000) {
  await recordSample();
  const remaining = seconds * 1000 - (Date.now() - began);
  if (remaining > 0) await new Promise(r => setTimeout(r, Math.min(10_000, remaining)));
}
// A ten-second sample can land inside an ordinary checkpoint pause. Observe actual
// recovery for at most ten additional seconds; never replace a sample or relax the
// zero-debt assertion. Persistent debt and every cumulative peak remain failures.
await recordSample();
const settlingBegan = Date.now();
while (samples.at(-1)?.scheduler.debtMs > 0 && Date.now() - settlingBegan < 10_000) {
  await new Promise(r => setTimeout(r, 1000));
  await recordSample();
}
const settlingSeconds = (Date.now() - settlingBegan) / 1000;
const first = samples[0], last = samples.at(-1), peak = read => Math.max(0, ...samples.map(read));
const checks = {
  completeDuration: Date.now() - began >= seconds * 1000,
  statusAvailable: errors.length === 0 && samples.length >= Math.floor(seconds / 11),
  sameWorld: !!first && samples.every(s => s.worldId === first.worldId),
  sameRelease: !!first && samples.every(s => s.release.version === first.release.version),
  uninterruptedService: !!first && samples.every((s, i) => i === 0 || s.uptimeSeconds >= samples[i - 1].uptimeSeconds),
  clockAdvanced: !!last && last.world.physicalTime - first.world.physicalTime >= seconds * .95,
  rssUnder2GiB: peak(s => s.memory.rss) < 2 * 1024 ** 3,
  checkpointSerializationUnder250ms: peak(s => s.metrics.maxSerializeMs) <= 250,
  debtClears: !!last && last.scheduler.debtMs === 0,
  zeroClientPeriodObserved: samples.some(s => s.connections.length === 0),
};
const growth = (range) => {
  if (range.length < 2) return null;
  const first = range[0], last = range.at(-1), hours = (last.elapsedSeconds - first.elapsedSeconds) / 3600;
  return { hours, checkpointBytesPerHour: hours > 0 ? (last.metrics.lastBytes - first.metrics.lastBytes) / hours : null,
    eventsPerHour: hours > 0 ? (last.world.events - first.world.events) / hours : null,
    knowledgePerHour: hours > 0 ? (last.world.knowledge - first.world.knowledge) / hours : null };
};
const cpuSamples = samples.slice(1).flatMap((s, i) => {
  const p = samples[i]; if (!s.cpuMicroseconds || !p.cpuMicroseconds) return [];
  return [(s.cpuMicroseconds.user + s.cpuMicroseconds.system - p.cpuMicroseconds.user - p.cpuMicroseconds.system) / ((s.elapsedSeconds - p.elapsedSeconds) * 1e6)];
});
const report = { runtime: last?.runtime, connectedClientPeriodObserved: samples.some(s => s.connections.length > 0),
  growth: { whole: growth(samples), firstHalf: growth(samples.filter(s => s.elapsedSeconds <= seconds / 2)), lastHalf: growth(samples.filter(s => s.elapsedSeconds > seconds / 2)),
    quarters: Array.from({ length: 4 }, (_, i) => growth(samples.filter(s => s.elapsedSeconds > seconds * i / 4 && s.elapsedSeconds <= seconds * (i + 1) / 4))) },
  release: last?.release,
  normalCheckpointsObserved: first && last ? last.metrics.checkpoints - first.metrics.checkpoints : 0,
  normalBackupsObserved: first && last ? last.metrics.backups - first.metrics.backups : 0,
  cpuCores: { mean: cpuSamples.length ? cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length : null, peak: Math.max(0, ...cpuSamples) },
  peakCheckpointCommitMs: peak(s => s.metrics.lastCommitMs),
  peakBackgroundEncodeMs: peak(s => s.metrics.maxEncodeMs ?? 0),
  peakCheckpointEndToEndMs: peak(s => s.metrics.lastCheckpointMs ?? 0),
  kind: 'server-only realtime soak; client FPS/UI separate', root, requestedSeconds: seconds, elapsedSeconds: (Date.now() - began) / 1000, settlingSeconds,
  sampleCount: samples.length, checks, passed: Object.values(checks).every(Boolean), errors,
  peakRssBytes: peak(s => s.memory.rss), peakSerializeMs: peak(s => s.metrics.maxSerializeMs),
  // Cumulative service maxima include stalls between ten-second observations.
  peakDebtMs: peak(s => s.scheduler.maxDebtMs), peakSampledDebtMs: peak(s => s.scheduler.debtMs),
  peakEventLoopMs: peak(s => s.eventLoopMs.max),
  snapshotEventLoopP99ms: peak(s => s.eventLoopMs.p99), first: first?.world, last: last?.world,
};
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, report: join(out, 'report.json'), checks }));
process.exitCode = report.passed ? 0 : 1;
