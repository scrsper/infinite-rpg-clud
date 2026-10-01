import { it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { LiveServer } from '../src/server/live';
import { loadConfig, type ReleaseIdentity } from '../src/server/config';
import { AccountRegistry } from '../src/server/accounts';
import { ProbeClient } from '../src/server/probeClient';
import { SAVE_VERSION } from '../src/sim/persist/save';
import { setExternalControl } from '../src/sim/runtime/controllers';

it('plays through the real authenticated server conversation transport with inference networking forbidden', async () => {
  const reserve = createServer(); await new Promise<void>(r => reserve.listen(0, '127.0.0.1', r));
  const port = (reserve.address() as { port: number }).port; await new Promise<void>(r => reserve.close(() => r()));
  const root = mkdtempSync(join(tmpdir(), 'tvo-dialogue-')), path = join(root, 'config.json');
  writeFileSync(path, JSON.stringify({ env: 'dev', port, bind: ['127.0.0.1'], seed: 918271, createWorldIfMissing: true, checkpointSeconds: 3600, backupMinutes: 600, disconnectGraceSeconds: 1, maxConnections: 2 }));
  mkdirSync(join(root, 'credentials')); writeFileSync(join(root, 'credentials', 'admin.token'), 'dialogue-test-admin-token-0123456789');
  const token = new AccountRegistry(join(root, 'credentials', 'accounts.json')).add('dialogue', 'Traveler');
  const release: ReleaseIdentity = { version: 'dialogue-test', revision: 'test', dirty: false, builtAtIso: '', protocol: 1, saveSchema: SAVE_VERSION, generatorVersion: 'playable-1', node: process.version };
  const server = new LiveServer(loadConfig(path), release, () => {}); let client: ProbeClient | undefined;
  const fetcher = vi.fn(() => { throw new Error('Inference network is forbidden'); }); vi.stubGlobal('fetch', fetcher);
  try {
    await server.open(); await server.listen(); client = await ProbeClient.connect({ port, account: 'dialogue', token, character: 'new', name: 'Traveler', sex: 'm' });
    expect(client.closed).toBeNull(); expect(client.hello).toBeTruthy();
    const w = server.session.world, player = w.person(client.personId)!;
    const npc = w.livingPersons().find(p => p.id !== player.id && !p.hostile && p.age > 20)!;
    const body = w.primaryBody(npc.id)!; body.pose = 'stand'; setExternalControl(npc, true);
    w.primaryBody(player.id)!.pos = { ...body.pos };
    player.mind.percepts = [{ entityId: npc.id, bodyId: body.id, how: 'saw', pos: { ...body.pos }, tick: w.now, distance: 0 }];
    expect((await client.intent({ type: 'talk', targetBodyId: body.id })).result).toBe('accepted');
    let revision = 0;
    const timeout = Date.now() + 10000;
    while (!client.lastSnapshot?.dialogue && Date.now() < timeout) await new Promise(r => setTimeout(r, 25));
    revision = client.lastSnapshot!.dialogue.revision;
    const reply = await client.intent({ type: 'dialogue_text', revision, text: 'Hello' });
    expect(reply.result).toBe('spoken'); expect(reply.speech).toContain(npc.name); expect(reply.fallback).toBe(false);
    expect(reply).not.toHaveProperty('parsed'); expect(reply).not.toHaveProperty('semantic');
    const unknown = await client.intent({ type: 'dialogue_text', revision, text: 'Where is he?' });
    expect(unknown.result).toBe('spoken'); expect(unknown.speech).toContain('Who do you mean');
    expect(fetcher).not.toHaveBeenCalled();
    await client.intent({ type: 'dialogue_close' });
    expect((await client.intent({ type: 'dialogue_text', revision, text: 'Hello' })).result).toBe('conversation_changed');
    expect((await server.checkpoint('deterministic dialogue acceptance')).generation).toBeGreaterThan(0);
  } finally { await client?.close(); await server.stopInProcess('dialogue test complete'); vi.unstubAllGlobals(); rmSync(root, { recursive: true, force: true }); }
}, 120000);
