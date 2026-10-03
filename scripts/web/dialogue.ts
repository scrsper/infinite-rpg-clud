/** Isolated deterministic conversation UI acceptance. Never uses a saved user world/profile. */
import { chromium } from 'playwright';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { LiveServer } from '../../src/server/live';
import { loadConfig, type ReleaseIdentity } from '../../src/server/config';
import { AccountRegistry } from '../../src/server/accounts';
import { WebGateway } from '../../src/webgate/gateway';
import { SAVE_VERSION } from '../../src/sim/persist/save';
import { setExternalControl } from '../../src/sim/runtime/controllers';

const root = mkdtempSync(join(tmpdir(), 'tvo-dialogue-ui-')), out = resolve('.debug/dialogue'); mkdirSync(out, { recursive: true });
const reserve = createServer(); await new Promise<void>(r => reserve.listen(0, '127.0.0.1', r));
const port = (reserve.address() as { port: number }).port; await new Promise<void>(r => reserve.close(() => r()));
const path = join(root, 'config.json');
writeFileSync(path, JSON.stringify({ env: 'dev', port, bind: ['127.0.0.1'], webGateway: true, seed: 918271, createWorldIfMissing: true, checkpointSeconds: 3600, backupMinutes: 600 }));
mkdirSync(join(root, 'credentials')); writeFileSync(join(root, 'credentials', 'admin.token'), 'isolated-dialogue-ui-admin-0123456789');
const token = new AccountRegistry(join(root, 'credentials', 'accounts.json')).add('dialogue-ui', 'Dialogue UI acceptance');
const release: ReleaseIdentity = { version: 'dialogue-ui', revision: 'test', dirty: false, builtAtIso: '', protocol: 1, saveSchema: SAVE_VERSION, generatorVersion: 'playable-1', node: process.version };
const server = new LiveServer(loadConfig(path), release, () => {});
const gateway = new WebGateway({ port: 0, upstream: { host: '127.0.0.1', port }, credentials: { account: 'dialogue-ui', token }, staticDir: resolve('dist-web') });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [], modelRequests: string[] = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (/:(11434|1234)\b|chat\/completions/.test(r.url())) modelRequests.push(r.url()); });
await page.addInitScript('window.__name = (f) => f;');
const fetchBefore = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('No inference HTTP networking permitted'); };
try {
  await server.open(); await server.listen(); await gateway.listen();
  await page.goto(gateway.issueLaunchUrl()); await page.goto(`${gateway.url}/?autoplay=1&name=Traveler`);
  await page.waitForFunction(() => (window as any).__tv?.ready === true, undefined, { timeout: 120000 });
  const playerId = await page.evaluate(() => (window as any).__tv.link.hello.playerId);
  const w = server.session.world, player = w.person(playerId)!, pb = w.primaryBody(playerId)!;
  const npc = w.livingPersons().find(p => p.id !== playerId && !p.hostile && p.age > 20)!;
  const body = w.primaryBody(npc.id)!; setExternalControl(npc, true);
  // Disclosed UI fixture: co-locate a normal NPC and grant a direct observation. This is not
  // evidence of human travel/aiming. Text entry and suggested choices below use the real UI.
  body.pos = { ...pb.pos, x: pb.pos.x + 1 }; body.pose = 'stand';
  player.mind.percepts = [{ entityId: npc.id, bodyId: body.id, how: 'saw', pos: { ...body.pos }, tick: w.now, distance: 1 }];
  await page.evaluate(async id => { const r = await (window as any).__tv.link.intent({ type: 'talk', targetBodyId: id }); if (r.result !== 'accepted') throw new Error(r.result); }, body.id);
  const input = page.locator('.tv-speech-input'); await input.waitFor({ state: 'visible' });
  await input.fill('Who are you?'); await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await page.waitForFunction(name => document.querySelector('.tv-transcript')?.textContent?.includes(`My name is ${name}`), npc.name);
  await input.fill('Where is he?'); await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.tv-transcript')?.textContent?.includes('Who do you mean?'));
  if (!await page.locator('.tv-options button').count()) throw new Error('Suggested conversation choices disappeared');
  await page.screenshot({ path: join(out, 'gameplay-conversation.png') });
  if (errors.length || modelRequests.length) throw new Error(JSON.stringify({ errors, modelRequests }));
  writeFileSync(join(out, 'browser-evidence.json'), JSON.stringify({ status: 'VERIFIED', surface: 'production web bundle + authenticated gateway + real authoritative server', fixture: 'explicit NPC co-location/direct observation; genuine browser text entry and button clicks', modelRequests, errors, checks: ['free-text introduction', 'pronoun clarification', 'suggested choices remain visible', 'inference HTTP forbidden in server process'] }, null, 2));
  console.log('Gameplay dialogue UI acceptance passed.');
} finally { globalThis.fetch = fetchBefore; await browser.close(); await gateway.close(); await server.stopInProcess('dialogue UI complete'); rmSync(root, { recursive: true, force: true }); }
