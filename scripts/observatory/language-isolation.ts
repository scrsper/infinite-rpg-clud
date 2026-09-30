import { writeFile } from 'node:fs/promises';
import { createScenario } from '../../src/observatory/scenarios';
import { stepWorld } from '../../src/observatory/runtime';
import { canonicalDigest } from '../../src/observatory/fingerprint';
import { LocalLanguageClient, DEFAULT_LOCAL_CONFIG } from '../../src/language/client';
import { LanguageService } from '../../src/language/service';

const results = [];
for (const mode of ['qwen3:8b', 'disabled', 'offline'] as const) {
  const { world, sim } = createScenario('ordinary', 918271);
  for (let i = 0; i < 20; i++) stepWorld(world, sim);
  const before = canonicalDigest(world), count = world.events.length;
  const config = { ...DEFAULT_LOCAL_CONFIG, model: 'qwen3:8b', enabled: mode !== 'disabled', timeoutMs: 120000,
    baseUrl: mode === 'offline' ? 'http://127.0.0.1:65534/v1' : DEFAULT_LOCAL_CONFIG.baseUrl };
  const client = new LocalLanguageClient(config);
  const reply = await new LanguageService(client).thought(world.livingPersons()[0]);
  const after = canonicalDigest(world), eventsAddedByExpression = world.events.length - count;
  for (let i = 0; i < 100; i++) stepWorld(world, sim);
  results.push({ mode, before, after, expressionUnchanged: before === after, eventsAddedByExpression,
    final: canonicalDigest(world), generated: reply.generated, note: reply.note });
  client.cancelAll();
}
const report = { results, identicalMechanics: results.every(r => r.final === results[0].final), readOnlyExpression: results.every(r => r.expressionUnchanged),
  scope: 'Real local qwen wording vs disabled and refused loopback connection. Same seed, 20 steps before expression, 100 after. No player conversational input. Injection and canonical conversation fallback additionally covered by observatory-language.test.ts.' };
await writeFile(process.argv[2] ?? '.debug/observatory-hardening/language-isolation-v2.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ identicalMechanics: report.identicalMechanics, readOnlyExpression: report.readOnlyExpression, modes: results.map(r => ({ mode: r.mode, fallback: r.generated.fallback, final: r.final })) }));
if (!report.identicalMechanics || !report.readOnlyExpression) process.exitCode = 1;
