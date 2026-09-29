import { beforeAll, describe, expect, it } from 'vitest';
import { BridgeSession } from '../src/bridge/session';
import { projectRegion } from '../src/bridge/regions';
import { RegionalTransport } from '../src/bridge/streaming';
import { B } from '../src/sim/physical/blocks';

/** Decode `structures.runs`: x, z, n, then n triples (y, length, block). */
function decode(runs: number[]): Map<string, [number, number, number][]> {
  const cols = new Map<string, [number, number, number][]>();
  for (let i = 0; i < runs.length;) {
    const x = runs[i++], z = runs[i++], n = runs[i++], list: [number, number, number][] = [];
    for (let k = 0; k < n; k++) { list.push([runs[i], runs[i + 1], runs[i + 2]]); i += 3; }
    cols.set(`${x},${z}`, list);
  }
  return cols;
}
const solidAt = (cols: Map<string, [number, number, number][]>, x: number, y: number, z: number) =>
  (cols.get(`${x},${z}`) ?? []).some(([y0, len]) => y >= y0 && y < y0 + len);
const blockAt = (cols: Map<string, [number, number, number][]>, x: number, y: number, z: number) =>
  (cols.get(`${x},${z}`) ?? []).find(([y0, len]) => y >= y0 && y < y0 + len)?.[2];

describe('web region detail: exact built structure, additive and opt-in', () => {
  let session: BridgeSession, region: ReturnType<typeof projectRegion>, web: ReturnType<typeof projectRegion>;
  beforeAll(() => {
    session = new BridgeSession(918271, { playable: true, defaultPlayer: false });
    const size = session.world.geography!.spec.regionSize;
    const start = session.spawnPoint();
    const rx = Math.floor(start.x / size), rz = Math.floor(start.z / size);
    region = projectRegion(session.world, rx, rz);
    web = projectRegion(session.world, rx, rz, { structures: true });
  }, 120_000);

  it('leaves the native projection untouched: no structures key, everything else identical', () => {
    expect('structures' in region).toBe(false);
    const { structures, ...rest } = web as any;
    expect(structures).toBeDefined();
    expect(JSON.stringify(rest)).toBe(JSON.stringify(region));
  });

  it('a transport asks for structures only when told to', () => {
    const w = session.world, size = w.geography!.spec.regionSize, s = session.spawnPoint();
    const collect = (options?: { structures?: boolean }) => {
      const t = new RegionalTransport(() => {}, () => null, options); let text = '';
      const anchor = w.playerId ?? w.persons()[0].id; (t as any).observer = () => anchor;
      const state = t.state(w); expect(state).toBeTruthy();
      for (let i = 0; i < 4000; i++) { t.prepare(w, Infinity); const c = t.next(w); if (!c) continue; text += Buffer.from(c.data, 'base64').toString(); t.acknowledge(c.transferId, c.index); if (c.index + 1 === c.count) break; }
      void size; void s; return text;
    };
    if (!session.world.playerId) session.world.playerId = session.world.persons().find(p => p.occupation !== 'child')!.id;
    expect(collect()).not.toContain('"structures"');
    expect(collect({ structures: true })).toContain('"structures"');
  }, 120_000);

  it('describes the walls, door gap and roof of every house from the real voxel grid', () => {
    const cols = decode(web.structures!.runs);
    const houses = web.places.filter((p: any) => p.type === 'house' && p.indoor);
    expect(houses.length).toBeGreaterThan(0);
    for (const p of houses as any[]) {
      const { x0, x1, z0, z1, y0, y1 } = p.bounds;
      const ring: [number, number][] = [];
      for (let x = x0; x <= x1; x++) { ring.push([x, z0], [x, z1]); }
      for (let z = z0 + 1; z < z1; z++) { ring.push([x0, z]); ring.push([x1, z]); }
      const doorCell = p.door ? ring.filter(([x, z]) => Math.abs(x - p.door.x) + Math.abs(z - p.door.z) === 1) : [];
      // Walls stand on the footprint ring at floor level, except where the door is.
      const missing = ring.filter(([x, z]) => !solidAt(cols, x, y0 + 1, z) && !doorCell.some(([dx, dz]) => dx === x && dz === z));
      expect(missing, `house ${p.id} wall ring gaps`).toEqual([]);
      // Windows are glazing blocks in that wall.
      expect(ring.some(([x, z]) => blockAt(cols, x, y0 + 1, z) === B.Glass), `house ${p.id} glazing`).toBe(true);
      // A roof rises above the walls, and the projected top agrees with the place's own extent.
      const top = Math.max(...ring.flatMap(([x, z]) => (cols.get(`${x},${z}`) ?? []).map(([y, len]) => y + len)));
      expect(top).toBeGreaterThan(y0 + 3);
      expect(top).toBeLessThanOrEqual(y1 + 4);
    }
  });

  it('keeps the projection bounded: structure data is a small fraction of a region transfer', () => {
    const structureBytes = JSON.stringify(web.structures!).length, whole = JSON.stringify(web).length;
    expect(structureBytes).toBeLessThan(400_000);
    expect(structureBytes).toBeLessThan(whole);
  });
});
