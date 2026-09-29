import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { LiveServer } from '../src/server/live';
import { loadConfig, type ReleaseIdentity } from '../src/server/config';
import { AccountRegistry } from '../src/server/accounts';
import { ProbeClient } from '../src/server/probeClient';
import { SAVE_VERSION } from '../src/sim/persist/save';
import { WebGateway } from '../src/webgate/gateway';

/**
 * Differential admission: the same scripted intents, in the same order, on two isolated worlds built from the same
 * seed: one driven by the native-style probe client (what Unreal speaks) and one by a browser through the gateway.
 * The admitted/rejected result of every command, in order, and the resulting canonical state, must be identical.
 * Rejected inputs are compared, not discarded. Only documented non-canonical metadata differs (ids of the
 * controller, timestamps): commands are matched by their sequence number.
 *
 * Scope, honestly: this compares *admission and its immediate canonical effect* on fresh same-seed worlds. It does
 * not run a long session, restart or save/reload cycle through both transports.
 */
const release: ReleaseIdentity = { version: 'test-diff', revision: 'test', dirty: false, builtAtIso: '', protocol: 1, saveSchema: SAVE_VERSION, generatorVersion: 'playable-3', node: process.version };
const quiet = () => {};
const roots: string[] = [];
const until = async (test: () => boolean, ms = 30_000) => { const t = Date.now(); while (!test()) { if (Date.now() - t > ms) throw new Error('until timeout'); await new Promise(r => setTimeout(r, 15)); } };
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Env { server: LiveServer; token: string; port: number; root: string }
async function makeEnv(webGateway: boolean, port: number): Promise<Env> {
  const root = mkdtempSync(join(tmpdir(), 'tvo-diff-')); roots.push(root);
  writeFileSync(join(root, 'config.json'), JSON.stringify({ env: 'dev', port, bind: ['127.0.0.1'], seed: 918271, createWorldIfMissing: true, checkpointSeconds: 3600, backupMinutes: 600, disconnectGraceSeconds: 1, maxConnections: 8, ...(webGateway ? { webGateway: true } : {}) }));
  mkdirSync(join(root, 'credentials'), { recursive: true });
  writeFileSync(join(root, 'credentials', 'admin.token'), 'test-admin-token-0123456789abcdef');
  const token = new AccountRegistry(join(root, 'credentials', 'accounts.json')).add('differ', 'Differ');
  const server = new LiveServer(loadConfig(join(root, 'config.json')), release, quiet);
  await server.open(); await server.listen();
  return { server, token, port, root };
}

type Step = { kind: 'command'; body: Record<string, unknown>; label: string } | { kind: 'intent'; body: Record<string, unknown>; label: string } | { kind: 'raw-command'; patch: Record<string, unknown>; label: string };
/** The script both transports run. Moves are single fixed steps so displacement does not depend on wall time. */
const SCRIPT: Step[] = [
  ...Array.from({ length: 6 }, (_, i): Step => ({ kind: 'command', label: `move ${i}`, body: { type: 'move', x: 0, z: -1, sprint: false, crouch: false } })),
  { kind: 'command', label: 'sprint step', body: { type: 'move', x: 1, z: 0, sprint: true, crouch: false } },
  { kind: 'command', label: 'guard on', body: { type: 'guard', held: true } },
  { kind: 'command', label: 'guard off', body: { type: 'guard', held: false } },
  { kind: 'command', label: 'sidestep', body: { type: 'defend', kind: 'sidestep', side: 1, direction: { x: 1, z: 0 } } },
  { kind: 'command', label: 'light attack (nobody there)', body: { type: 'attack', weight: 'light', trajectory: 'high' } },
  { kind: 'command', label: 'unknown command type', body: { type: 'fly', x: 1 } },
  { kind: 'raw-command', label: 'stale epoch', patch: { epoch: 'stale-epoch' } },
  { kind: 'raw-command', label: 'foreign body id', patch: { bodyId: 'b_not_yours' } },
  { kind: 'intent', label: 'talk to nobody', body: { type: 'talk', targetBodyId: 'b_does_not_exist' } },
  { kind: 'intent', label: 'dialogue option with no dialogue', body: { type: 'dialogue_option', optionId: 'x' } },
  { kind: 'intent', label: 'hush a non-target', body: { type: 'hush', targetBodyId: 'b_does_not_exist' } },
  { kind: 'intent', label: 'save', body: { type: 'save' } },
];

interface Outcome { label: string; result: string }
interface Run { outcomes: Outcome[]; position: { x: number; y: number; z: number }; name: string; gender: string; persons: number }

/** One transport: send a message object, get the messages it receives, read the hello. */
interface Transport { hello(): any; messages(): any[]; send(m: Record<string, unknown>): void; close(): Promise<void> }

async function nativeTransport(env: Env): Promise<Transport> {
  const c = await ProbeClient.connect({ port: env.port, account: 'differ', token: env.token, character: 'new', name: 'Diff Tester', sex: 'f', realtime: true });
  return { hello: () => c.hello, messages: () => c.messages, send: m => c.sendRaw(m), close: () => c.close() };
}
async function browserTransport(env: Env, gateway: WebGateway): Promise<Transport> {
  const r = await fetch(gateway.issueLaunchUrl(), { redirect: 'manual' });
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
  const msgs: any[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${gateway.port}/ws?character=new&name=Diff%20Tester&sex=f`, { headers: { Origin: gateway.url, Cookie: cookie } });
  ws.on('message', raw => { try { const m = JSON.parse(raw.toString()); if (m.type === 'presentation_chunk') ws.send(JSON.stringify({ version: 1, type: 'presentation_ack', transferId: m.transferId, index: m.index })); if (!['snapshot', 'local_state', 'presentation_chunk', 'combat_frame'].includes(m.type)) msgs.push(m); else if (m.type === 'snapshot') (ws as any).__snap = m; } catch { /* not json */ } });
  await until(() => msgs.some(m => m.type === 'hello') && !!(ws as any).__snap);
  return { hello: () => msgs.find(m => m.type === 'hello'), messages: () => msgs, send: m => ws.send(JSON.stringify(m)), close: async () => { const done = new Promise<void>(res => ws.once('close', () => res())); ws.close(); await done; } };
}

async function drive(t: Transport, env: Env): Promise<Run> {
  const hello = t.hello(), b = hello.interaction;
  let seq = 0, iseq = 0;
  const outcomes: Outcome[] = [];
  for (const step of SCRIPT) {
    if (step.kind === 'intent') {
      const sequence = ++iseq;
      t.send({ version: 1, sequence, ...step.body });
      await until(() => t.messages().some(m => m.type === 'result' && m.sequence === sequence));
      outcomes.push({ label: step.label, result: t.messages().find(m => m.type === 'result' && m.sequence === sequence).result });
      continue;
    }
    const sequence = ++seq, commandId = `${b.controllerId}-${sequence}`;
    const base = { version: 2, type: 'command', epoch: b.epoch, controllerId: b.controllerId, bodyId: b.bodyId, sequence, commandId, specRevision: b.specRevision, clientTimeMs: 1000 + sequence * 16 };
    const message = step.kind === 'command' ? { ...base, command: step.body } : { ...base, command: { type: 'move', x: 0, z: -1, sprint: false, crouch: false }, ...step.patch };
    t.send(message);
    await until(() => t.messages().some(m => m.type === 'command_receipt' && m.commandId === commandId && m.status !== 'received'));
    const receipt = t.messages().filter(m => m.type === 'command_receipt' && m.commandId === commandId).pop();
    outcomes.push({ label: step.label, result: `${receipt.status}:${receipt.result ?? receipt.reason ?? ''}` });
    await pause(40);
  }
  await pause(300);
  const world = env.server.session.world, person = world.person(hello.playerId)!;
  const pos = world.body(b.bodyId)?.pos ?? { x: NaN, y: NaN, z: NaN };
  return { outcomes, position: { x: pos.x, y: pos.y, z: pos.z }, name: person.name, gender: person.gender, persons: world.persons().length };
}

describe.sequential('Differential admission: native-style probe vs browser through the gateway', () => {
  const portA = 7700 + Math.floor(Math.random() * 45), portB = portA + 50;
  let A: Env, B: Env, gateway: WebGateway;
  let runA: Run, runB: Run;
  beforeAll(async () => {
    A = await makeEnv(false, portA);
    B = await makeEnv(true, portB);
    gateway = new WebGateway({ port: 0, upstream: { host: '127.0.0.1', port: portB }, credentials: { account: 'differ', token: B.token }, log: quiet });
    await gateway.listen();
    const ta = await nativeTransport(A); runA = await drive(ta, A); await ta.close();
    const tb = await browserTransport(B, gateway); runB = await drive(tb, B); await tb.close();
  }, 480_000);
  afterAll(async () => { await gateway?.close(); await A?.server.stopInProcess('test end').catch(() => {}); await B?.server.stopInProcess('test end').catch(() => {}); for (const r of roots) rmSync(r, { recursive: true, force: true }); });

  it('every command gets the same admitted/rejected result, in order, on both transports', () => {
    expect(runB.outcomes.map(o => o.label)).toEqual(runA.outcomes.map(o => o.label));
    expect(runB.outcomes).toEqual(runA.outcomes);
  });
  it('prints what was compared (for the record)', () => { console.log(JSON.stringify({ native: runA.outcomes, browser: runB.outcomes, position: [runA.position, runB.position] })); });
  it('the script exercised both acceptance and rejection (nothing was discarded to force equality)', () => {
    const results = runA.outcomes.map(o => o.result);
    expect(results.some(r => r.startsWith('applied') || r === 'accepted' || r === 'saved')).toBe(true);
    expect(results.some(r => r.startsWith('rejected'))).toBe(true);
  });
  it('the same person is created and ends up in the same place after the same admitted moves', () => {
    expect(runB.name).toBe(runA.name); expect(runB.gender).toBe(runA.gender); expect(runB.persons).toBe(runA.persons);
    expect(Number.isFinite(runA.position.x)).toBe(true);
    expect(runB.position.x).toBeCloseTo(runA.position.x, 3); expect(runB.position.z).toBeCloseTo(runA.position.z, 3); expect(runB.position.y).toBeCloseTo(runA.position.y, 3);
  });
});
