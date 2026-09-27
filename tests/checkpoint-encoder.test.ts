import { describe, expect, it, vi } from 'vitest';
import { CheckpointEncoder } from '../src/server/checkpointEncoder';
import { decodeEventTable } from '../src/sim/persist/eventTable';
import { newWorld, serializeChunks, serializeParts } from '../src/sim/persist/save';

describe('checkpoint storage worker', () => {
  it('prepares owned capacity before the first capture without moving snapshot work out of encode', async () => {
    const allocate = vi.spyOn(Buffer, 'allocUnsafeSlow'), encoder = new CheckpointEncoder();
    try {
      encoder.prepare(2 * 1048576);
      const preparedAllocations = allocate.mock.calls.length;
      let captured = false;
      const pending = encoder.encode((function* () { captured = true; yield '{"events":[],"text":"早い🙂"}'; })());
      expect(captured).toBe(true);
      expect(() => encoder.prepare(2 * 1048576)).toThrow('already in flight');
      expect(JSON.parse((await pending).bytes.toString()).text).toBe('早い🙂');
      expect(allocate.mock.calls.length).toBe(preparedAllocations);
      expect(encoder.lastCaptureMs).toBeGreaterThan(0);
    } finally { await encoder.close(); allocate.mockRestore(); }
  });

  it('reuses owned input capacity across smaller and rejected captures without changing prior output', async () => {
    const allocate = vi.spyOn(Buffer, 'allocUnsafeSlow'), encoder = new CheckpointEncoder();
    try {
      const payload = '🙂漢字'.repeat(65536);
      const first = await encoder.encode(JSON.stringify({ events: [], payload }));
      const original = first.bytes.toString(), allocations = allocate.mock.calls.length;
      expect(allocations).toBeGreaterThan(0);
      const small = JSON.parse((await encoder.encode(['{"events":[],"payload":', '"短"', '}'])).bytes.toString());
      expect(small.payload).toBe('短');
      await expect(encoder.encode('{"events":[')).rejects.toThrow();
      const recovered = JSON.parse((await encoder.encode('{"events":[],"payload":"after error"}')).bytes.toString());
      expect(recovered.payload).toBe('after error');
      expect(allocate.mock.calls.length).toBe(allocations);
      const larger = 'long'.repeat(500000);
      expect(JSON.parse((await encoder.encode(JSON.stringify({ events: [], payload: larger }))).bytes.toString()).payload).toBe(larger);
      expect(allocate.mock.calls.length).toBe(allocations + 1);
      expect(first.bytes.toString()).toBe(original);
      expect(JSON.parse(original).payload).toBe(payload);
    } finally { await encoder.close(); allocate.mockRestore(); }
  });

  it('packs only the captured snapshot while subsequent canonical mutations remain independent', async () => {
    const encoder = new CheckpointEncoder();
    try {
      const { world } = newWorld(731), parts = serializeParts(world), original = JSON.parse(parts.join(''));
      let drained = false;
      const captured = encoder.encode((function* () { yield* serializeChunks(world); drained = true; })());
      expect(drained).toBe(true);
      world.persons()[0].wealth += 7;
      world.emit('perceived', { summary: 'After snapshot — 林', data: { encounter: true } });
      const result = await captured, stored = JSON.parse(result.bytes.toString());
      expect(result.encodeMs).toBeGreaterThan(0);
      stored.events = decodeEventTable({ ...stored.eventEncoding, rows: stored.events });
      delete stored.eventEncoding;
      expect(stored).toEqual({ ...original, savedAt: stored.savedAt });
      const next = JSON.parse((await encoder.encode(serializeParts(world))).bytes.toString());
      expect(next.persons[0].wealth).toBe(original.persons[0].wealth + 7);
      expect(next.events.length).toBe(original.events.length + 1);
    } finally { await encoder.close(); }
  });

  it('grows while synchronously draining chunks and recovers from a throwing producer', async () => {
    const encoder = new CheckpointEncoder();
    try {
      const chunk = '🙂漢字'.repeat(65536);
      const result = await encoder.encode((function* () {
        yield '{"events":[],"payload":"';
        for (let i = 0; i < 5; i++) yield chunk;
        yield '"}';
      })(), 1);
      expect(JSON.parse(result.bytes.toString()).payload).toBe(chunk.repeat(5));
      expect(encoder.lastCaptureMs).toBeGreaterThan(0);
      expect(() => encoder.encode((function* () { yield '{"events":['; throw new Error('producer failed'); })())).toThrow('producer failed');
      expect(JSON.parse((await encoder.encode('{"events":[],"payload":"recovered"}')).bytes.toString()).payload).toBe('recovered');
      expect(JSON.parse(result.bytes.toString()).payload).toBe(chunk.repeat(5));
    } finally { await encoder.close(); }
  });

  it('rejects malformed snapshots without returning a checkpoint and rejects concurrent jobs', async () => {
    const encoder = new CheckpointEncoder();
    try {
      const job = encoder.encode('{"truncated');
      expect(() => encoder.encode('{"events":[]}')).toThrow('already in flight');
      await expect(job).rejects.toThrow();
      await expect(encoder.encode('{"events":[],"eventEncoding":{}}')).rejects.toThrow('unpacked');
      await expect(encoder.encode(['{"events":', '['])).rejects.toThrow();
      expect(JSON.parse((await encoder.encode('{"events":[]}')).bytes.toString()).events).toEqual([]);
    } finally { await encoder.close(); }
  });

  it('rejects an interrupted worker instead of acknowledging an unsaved checkpoint', async () => {
    const encoder = new CheckpointEncoder();
    const result = expect(encoder.encode('{"events":[]}')).rejects.toThrow('exited');
    await encoder.close();
    await result;
  });
});
