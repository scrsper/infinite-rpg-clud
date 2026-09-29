import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { LiveServer } from '../src/server/live';
import { loadConfig, type ReleaseIdentity } from '../src/server/config';
import { AccountRegistry } from '../src/server/accounts';
import { ProbeClient } from '../src/server/probeClient';
import { CLOSE } from '../src/server/protocol';
import { SAVE_VERSION } from '../src/sim/persist/save';
import { WebGateway, MAX_BROWSER_MESSAGE_BYTES } from '../src/webgate/gateway';

/**
 * The browser path: gateway + admission adapter. What matters here is who may drive a character
 * (only a browser session that came through a launch link, from an allowed origin), what a browser
 * may say (an allowlist, never debug), and that nothing secret reaches the page.
 */
const release: ReleaseIdentity = { version: 'test-web', revision: 'test', dirty: false, builtAtIso: '', protocol: 1, saveSchema: SAVE_VERSION, generatorVersion: 'playable-3', node: process.version };
const quiet = () => {};
const port = 7900 + Math.floor(Math.random() * 90);
let root = '', server: LiveServer, gateway: WebGateway;
let token = '';
const openRoots: string[] = [];

const until = async (test: () => boolean, ms = 20_000) => { const t = Date.now(); while (!test()) { if (Date.now() - t > ms) throw new Error('until timeout'); await new Promise(r => setTimeout(r, 20)); } };
/** Follow the launch link like a browser would: consume the nonce, keep the cookie. */
async function launch(g: WebGateway): Promise<{ cookie: string; setCookie: string; status: number }> {
  const r = await fetch(g.issueLaunchUrl(), { redirect: 'manual' });
  const setCookie = r.headers.get('set-cookie') ?? '';
  return { cookie: setCookie.split(';')[0], setCookie, status: r.status };
}
interface Browser { ws: WebSocket; messages: any[]; closed: { code: number; reason: string } | null; rejected: number | null }
function browser(g: WebGateway, query: string, headers: Record<string, string>): Promise<Browser> {
  return new Promise(resolve => {
    const b: Browser = { ws: new WebSocket(`ws://127.0.0.1:${g.port}/ws?${query}`, { headers }), messages: [], closed: null, rejected: null };
    b.ws.on('message', raw => { try { b.messages.push(JSON.parse(raw.toString())); } catch { /* not json */ } });
    b.ws.on('close', (code, reason) => { b.closed = { code, reason: reason.toString() }; });
    b.ws.on('unexpected-response', (_req, res) => { b.rejected = res.statusCode ?? 0; resolve(b); });
    b.ws.on('error', () => { /* surfaced via close/unexpected-response */ });
    b.ws.on('open', () => resolve(b));
    b.ws.on('close', () => resolve(b));
  });
}
const goodHeaders = (g: WebGateway, cookie: string) => ({ Origin: g.url, Cookie: cookie });

describe.sequential('Web gateway and admission adapter', () => {
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'tvo-webgate-')); openRoots.push(root);
    writeFileSync(join(root, 'config.json'), JSON.stringify({ env: 'dev', port, bind: ['127.0.0.1'], seed: 918271, createWorldIfMissing: true, checkpointSeconds: 3600, backupMinutes: 600, disconnectGraceSeconds: 1, maxConnections: 4, webGateway: true }));
    mkdirSync(join(root, 'credentials'), { recursive: true });
    writeFileSync(join(root, 'credentials', 'admin.token'), 'test-admin-token-0123456789abcdef');
    token = new AccountRegistry(join(root, 'credentials', 'accounts.json')).add('webby', 'Webby');
    server = new LiveServer(loadConfig(join(root, 'config.json')), release, quiet);
    await server.open(); await server.listen();
    gateway = new WebGateway({ port: 0, upstream: { host: '127.0.0.1', port }, credentials: { account: 'webby', token }, log: quiet });
    await gateway.listen();
  }, 180_000);
  afterAll(async () => { await gateway?.close(); await server?.stopInProcess('test end').catch(() => {}); for (const r of openRoots) rmSync(r, { recursive: true, force: true }); });

  it('binds loopback only and refuses an upstream it was not configured with', () => {
    expect(() => new WebGateway({ port: 0, host: '0.0.0.0', upstream: { host: '127.0.0.1', port }, credentials: { account: 'a', token: 'b' } })).toThrow(/loopback only/);
    expect(() => new WebGateway({ port: 0, upstream: { host: '127.0.0.1', port }, upstreamAllow: ['10.0.0.9:7400'], credentials: { account: 'a', token: 'b' } })).toThrow(/allowlist/);
    expect(() => new WebGateway({ port: 0, upstream: { host: '127.0.0.1', port }, credentials: { account: '', token: '' } })).toThrow(/credentials/);
  });

  it('starts a session only from a one-time launch link, with an HttpOnly same-site cookie', async () => {
    const url = gateway.issueLaunchUrl();
    const first = await fetch(url, { redirect: 'manual' });
    expect(first.status).toBe(302);
    const cookie = first.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/HttpOnly/); expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).not.toContain(token);
    const replay = await fetch(url, { redirect: 'manual' });
    expect(replay.status).toBe(403);
    const bogus = await fetch(`${gateway.url}/launch/not-a-real-nonce`, { redirect: 'manual' });
    expect(bogus.status).toBe(403);
    expect((await fetch(`${gateway.url}/api/session`)).status).toBe(401);
    expect((await fetch(`${gateway.url}/api/session`, { headers: { cookie: cookie.split(';')[0] } })).status).toBe(200);
  });

  it('refuses a socket without a session, from a foreign origin, with no origin, or for another host', async () => {
    const { cookie } = await launch(gateway);
    const noSession = await browser(gateway, 'character=auto', { Origin: gateway.url });
    expect(noSession.rejected).toBe(401);
    const foreign = await browser(gateway, 'character=auto', { Origin: 'https://evil.example', Cookie: cookie });
    expect(foreign.rejected).toBe(403);
    const noOrigin = await browser(gateway, 'character=auto', { Cookie: cookie });
    expect(noOrigin.rejected).toBe(403);
    const otherPort = await browser(gateway, 'character=auto', { Origin: `http://127.0.0.1:${gateway.port + 1}`, Cookie: cookie });
    expect(otherPort.rejected).toBe(403);
    const rebound = await browser(gateway, 'character=auto', { Origin: gateway.url, Cookie: cookie, Host: 'attacker.example' });
    expect(rebound.rejected).toBe(421);
    const badCharacter = await browser(gateway, 'character=%3Cscript%3E', goodHeaders(gateway, cookie));
    expect(badCharacter.rejected).toBe(400);
  });

  it('exposes no admin or debug route and never a credential', async () => {
    const { cookie } = await launch(gateway);
    for (const path of ['/admin/status', '/admin/debug/snapshot', '/api/operator/launch']) {
      const r = await fetch(`${gateway.url}${path}`, { headers: { cookie } });
      expect([403, 404, 405]).toContain(r.status);
      expect(await r.text()).not.toContain(token);
    }
    const health = await fetch(`${gateway.url}/api/upstream-health`, { headers: { cookie } });
    const text = await health.text();
    expect(text).toMatch(/reachable/); expect(text).not.toContain(token);
    const operator = await fetch(`${gateway.url}/api/operator/launch`, { method: 'POST', headers: { 'x-torn-veil-gateway-operator': 'wrong' } });
    expect(operator.status).toBe(403);
    const minted = await fetch(`${gateway.url}/api/operator/launch`, { method: 'POST', headers: { 'x-torn-veil-gateway-operator': gateway.operatorSecret } });
    expect(minted.status).toBe(200);
  });

  it('admits a browser through the gateway to a real character, and the credential never reaches the page', async () => {
    const { cookie } = await launch(gateway);
    const b = await browser(gateway, 'character=new&name=Web%20Tester&sex=m', goodHeaders(gateway, cookie));
    await until(() => b.messages.some(m => m.type === 'snapshot') || !!b.closed);
    expect(b.closed).toBeNull();
    const hello = b.messages.find(m => m.type === 'hello');
    expect(hello.controls).toBe(true);
    expect(hello.interaction?.epoch).toBeTruthy();
    expect(hello.character.name).toBe('Web Tester');
    expect(server.session.world.person(hello.playerId)!.gender).toBe('m');
    expect(JSON.stringify(b.messages)).not.toContain(token);
    // Ordinary play works through the bridge: an epoch-bound command is received and applied.
    const cmd = { version: 2, type: 'command', epoch: hello.interaction.epoch, controllerId: hello.interaction.controllerId, bodyId: hello.interaction.bodyId, sequence: 1, commandId: `${hello.interaction.controllerId}-1`, specRevision: hello.interaction.specRevision, clientTimeMs: 1, command: { type: 'move', x: 0, z: 0, sprint: false } };
    b.ws.send(JSON.stringify(cmd));
    await until(() => b.messages.some(m => m.type === 'command_receipt' && m.commandId === cmd.commandId && m.status !== 'received'));
    expect(b.messages.find(m => m.type === 'command_receipt' && m.status !== 'received').result).toBe('accepted');
    // The regional presentation stream arrives and can be acknowledged through the same socket.
    await until(() => b.messages.some(m => m.type === 'presentation_chunk'));
    const chunk = b.messages.find(m => m.type === 'presentation_chunk');
    b.ws.send(JSON.stringify({ version: 1, type: 'presentation_ack', transferId: chunk.transferId, index: chunk.index }));
    b.ws.close();
    await until(() => !!b.closed);
  }, 60_000);

  it('drops message types a browser has no business sending, including debug inspection', async () => {
    const { cookie } = await launch(gateway);
    const b = await browser(gateway, 'character=auto', goodHeaders(gateway, cookie));
    await until(() => b.messages.some(m => m.type === 'snapshot') || !!b.closed);
    const before = gateway.counters.droppedMessages;
    b.ws.send(JSON.stringify({ version: 1, sequence: 90, type: 'debug_inspect', personId: 'p_1' }));
    b.ws.send(JSON.stringify({ version: 1, sequence: 91, type: 'move', x: 1, z: 0 }));
    b.ws.send(JSON.stringify({ version: 1, sequence: 92, type: 'admin_shutdown' }));
    b.ws.send('not json');
    await until(() => gateway.counters.droppedMessages >= before + 4);
    await new Promise(r => setTimeout(r, 200));
    expect(b.messages.some(m => m.type === 'debug_inspection')).toBe(false);
    expect(b.messages.some(m => m.type === 'result' && [90, 91, 92].includes(m.sequence))).toBe(false);
    b.ws.close();
  }, 60_000);

  it('closes a browser that sends an oversized message or floods', async () => {
    const { cookie } = await launch(gateway);
    const big = await browser(gateway, 'character=auto', goodHeaders(gateway, cookie));
    await until(() => big.messages.some(m => m.type === 'hello') || !!big.closed);
    // The ws server itself enforces the byte ceiling before the gateway sees the frame.
    big.ws.send(JSON.stringify({ version: 1, type: 'talk', pad: 'x'.repeat(MAX_BROWSER_MESSAGE_BYTES + 10) }));
    await until(() => !!big.closed);
    expect(big.closed!.code).toBe(1009);
    const { cookie: cookie2 } = await launch(gateway);
    const flood = await browser(gateway, 'character=auto', goodHeaders(gateway, cookie2));
    await until(() => flood.messages.some(m => m.type === 'hello') || !!flood.closed);
    for (let i = 0; i < 600 && !flood.closed; i++) flood.ws.send(JSON.stringify({ version: 1, type: 'clock_probe', clientTimeMs: i }));
    await until(() => !!flood.closed);
    expect([1008]).toContain(flood.closed!.code);
  }, 60_000);

  it('relays the server refusal (e.g. no character yet) with its own code and reason', async () => {
    const acct = new AccountRegistry(join(root, 'credentials', 'accounts.json')).add('fresh', 'Fresh');
    const g2 = new WebGateway({ port: 0, upstream: { host: '127.0.0.1', port }, credentials: { account: 'fresh', token: acct }, log: quiet });
    await g2.listen();
    try {
      const { cookie } = await launch(g2);
      const b = await browser(g2, 'character=auto', goodHeaders(g2, cookie));
      await until(() => !!b.closed);
      expect(b.closed!.code).toBe(CLOSE.noCharacter);
      expect(b.closed!.reason).toMatch(/No character yet/);
    } finally { await g2.close(); }
  }, 60_000);

  it('a second browser for the same account takes over exactly as a second native client would', async () => {
    const { cookie } = await launch(gateway);
    const first = await browser(gateway, 'character=auto', goodHeaders(gateway, cookie));
    await until(() => first.messages.some(m => m.type === 'hello'));
    const { cookie: cookie2 } = await launch(gateway);
    const second = await browser(gateway, 'character=auto', goodHeaders(gateway, cookie2));
    await until(() => second.messages.some(m => m.type === 'hello'));
    await until(() => !!first.closed);
    expect(first.closed!.code).toBe(CLOSE.superseded);
    second.ws.close();
  }, 60_000);
});

describe.sequential('Admission adapter is off unless an environment opts in', () => {
  it('refuses client kind web when the environment has not enabled it, and unknown kinds always', async () => {
    const r = mkdtempSync(join(tmpdir(), 'tvo-webgate-off-')); openRoots.push(r);
    const p = 7800 + Math.floor(Math.random() * 90);
    writeFileSync(join(r, 'config.json'), JSON.stringify({ env: 'dev', port: p, bind: ['127.0.0.1'], seed: 918271, createWorldIfMissing: true, checkpointSeconds: 3600, backupMinutes: 600 }));
    mkdirSync(join(r, 'credentials'), { recursive: true });
    writeFileSync(join(r, 'credentials', 'admin.token'), 'test-admin-token-0123456789abcdef');
    const tok = new AccountRegistry(join(r, 'credentials', 'accounts.json')).add('webby', 'Webby');
    const s = new LiveServer(loadConfig(join(r, 'config.json')), release, quiet);
    await s.open(); await s.listen();
    try {
      const web = await ProbeClient.connect({ port: p, account: 'webby', token: tok, client: 'web' });
      expect(web.closed).toMatchObject({ code: CLOSE.incompatible });
      expect(web.closed!.reason).toMatch(/not enabled/);
      const other = await ProbeClient.connect({ port: p, account: 'webby', token: tok, client: 'curl' });
      expect(other.closed).toMatchObject({ code: CLOSE.incompatible });
      const native = await ProbeClient.connect({ port: p, account: 'webby', token: tok, character: 'new', name: 'Native One' });
      expect(native.closed).toBeNull();
      await native.close();
    } finally { await s.stopInProcess('test end').catch(() => {}); }
  }, 180_000);
});
