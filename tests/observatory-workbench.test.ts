import { describe, it, expect } from 'vitest';
import { Observatory } from '../src/observatory/runtime';
import { canonicalDigest } from '../src/observatory/fingerprint';
import { BridgeSession } from '../src/bridge/session';
import { projectRegion, regionDynamics } from '../src/bridge/regions';
import { isExternallyControlled } from '../src/sim/runtime/controllers';
import { createObservatoryServer } from '../src/observatory/server';

describe('same-world Observatory workbench', () => {
  it('requires the Observatory session for viewport access and rejects asset traversal', async () => {
    const { server, runtime } = createObservatoryServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      expect((await fetch(base + '/api/viewport/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403);
      expect((await fetch(base + '/game/..%2fpackage.json')).status).toBe(403);
      const html = await (await fetch(base)).text(), token = html.match(/name="observatory-token" content="([^"]+)"/)![1];
      const response = await fetch(base + '/api/viewport/connect', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Observatory-Token': token }, body: JSON.stringify({ personId: runtime.world.persons().find(p => p.alive)!.id }) });
      expect(response.status).toBe(200);
      const connection = await response.json();
      const frame = await (await fetch(base + '/api/viewport/frame?lease=' + connection.lease, { headers: { 'X-Observatory-Token': token } })).json();
      expect(frame.snapshot.tick).toBe(runtime.world.physicalTime);
      expect(frame.paused).toBe(true);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  }, 30000);
  it('advances the inspected and rendered world together and invalidates a restored controller', async () => {
    const r = new Observatory();
    try {
      const p = r.world.persons().find(p => p.alive)!;
      const c = r.viewport.connect(p.id), before = r.world.now;
      r.saveCheckpoint();
      await r.advance(3600);
      expect(r.world.now - before).toBeCloseTo(3600, 4);
      expect(r.viewport.frame(c.lease).snapshot!.worldTime).toBe(r.world.now);
      r.loadCheckpoint();
      expect(r.world.now).toBe(before);
      expect(() => r.viewport.frame(c.lease)).toThrow('expired');
      expect(isExternallyControlled(r.world.person(p.id)!)).toBe(false);
    } finally { r.close(); }
  }, 60000);
  it('projects the dense reference village without mutating canonical state', () => {
    const r = new Observatory();
    try {
      const before = canonicalDigest(r.world);
      const b = new BridgeSession(r.world.seed, { state: r.state, defaultPlayer: false });
      expect(b.world).toBe(r.world); expect(b.sim).toBe(r.sim);
      const region = projectRegion(r.world, 0, 0, { structures: true });
      expect(region.structures!.runs.length).toBeGreaterThan(0);
      expect(region.terrain.columns.length).toBeGreaterThan(0);
      regionDynamics(r.world, new Set(['0,0']));
      expect(canonicalDigest(r.world)).toBe(before);
    } finally { r.close(); }
  }, 30000);
  it('uses a single controller, rejects paused input, and moves the inspected body through canonical commands', () => {
    const r = new Observatory();
    try {
      const p = r.world.persons().find(p => p.alive && r.world.primaryBody(p.id)?.present)!;
      const initialTime = r.world.physicalTime;
      const c = r.viewport.connect(p.id);
      expect(isExternallyControlled(p)).toBe(true);
      expect(r.world.physicalTime).toBe(initialTime);
      expect(() => r.viewport.connect(p.id)).toThrow('already controls');
      const command = { version: 2, type: 'command', ...c.hello.interaction, sequence: 0, commandId: 'test-0', clientTimeMs: 0, command: { type: 'move', x: 1, z: 0, sprint: false, crouch: false } };
      expect(() => r.viewport.command(c.lease, command)).toThrow('Resume');
      r.control(false, 1);
      const f = r.viewport.frame(c.lease);
      command.epoch = f.hello.interaction!.epoch;
      const before = { ...r.world.primaryBody(p.id)!.pos };
      expect(r.viewport.command(c.lease, command)?.status).toBe('received');
      expect(r.viewport.step(.15)).toBe(true);
      const after = r.viewport.frame(c.lease);
      expect(after.snapshot!.tick).toBe(r.world.physicalTime);
      expect(r.world.physicalTime - initialTime).toBeCloseTo(.15, 8);
      expect(after.receipts.some((r: any) => r.status === 'applied')).toBe(true);
      expect(r.world.primaryBody(p.id)!.pos).not.toEqual(before);
      r.control(true, 1);
      expect(() => r.viewport.command(c.lease, command)).toThrow('Resume');
      r.viewport.disconnect(c.lease); expect(isExternallyControlled(p)).toBe(false);
    } finally { r.close(); }
  }, 30000);
  it('invalidates old connections after reset without advancing the replacement world', () => {
    const r = new Observatory();
    try {
      const p = r.world.persons().find(p => p.alive)!;
      const c = r.viewport.connect(p.id);
      r.reset('ordinary', 23);
      const before = canonicalDigest(r.world);
      expect(() => r.viewport.frame(c.lease)).toThrow('expired');
      expect(() => r.viewport.command(c.lease, {})).toThrow('expired');
      expect(r.viewport.enabled).toBe(false);
      expect(canonicalDigest(r.world)).toBe(before);
    } finally { r.close(); }
  }, 30000);
});
