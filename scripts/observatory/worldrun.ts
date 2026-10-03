import { mkdir, writeFile } from 'node:fs/promises';
import { Observatory } from '../../src/observatory/runtime';

const days = Number(process.argv[2] ?? 1), scenario = process.argv[3] ?? 'ordinary';
if (![1, 7, 30].includes(days)) throw new Error('Use 1, 7 or 30 days');
const r = new Observatory(); r.reset(scenario, 918271);
const progress = setInterval(() => console.log(JSON.stringify({ elapsedDays: (r.world.now - r.start) / 86400, retainedEvents: r.world.events.length, health: r.health.status })), 30000);
try {
  await r.advance(days * 86400, true);
  await mkdir('.debug/observatory', { recursive: true });
  await writeFile(`.debug/observatory/world-${scenario}-${days}d.json`, JSON.stringify({ report: r.report, health: r.health, final: r.snapshot() }, null, 2));
  console.log(JSON.stringify({ days, scenario, completed: (r.report as any).completed, population: (r.report as any).population, elapsedMs: (r.report as any).elapsedMs, health: r.health.status, failed: r.health.checks.filter(c => c.status === 'FAIL').map(c => ({ id: c.id, evidence: c.evidence })) }));
} finally { clearInterval(progress); r.close(); }
