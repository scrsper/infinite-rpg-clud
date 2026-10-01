import { Mesh, Plane, Scene } from '@babylonjs/core';
import { B } from '../../sim/physical/blocks';
import type { MaterialLibrary, MatName } from '../render/materials';
import { hash2 } from '../render/noise';
import type { PlaceProjection, RegionProjection } from '../net/messages';
import { MeshBatch, type V } from './meshBatch';

/**
 * Buildings from the exact projected voxel structure.
 *
 *   walls    exposed faces of wall cells with baked corner occlusion; timber trim stands proud of the plaster
 *   windows  the glazing cells become recessed frames, mullions, panes, sills and shutters
 *   roofs    every building in this world uses the same 45-degree stepped gable with a one-cell overhang;
 *            each is rebuilt as a clean, watertight gable and *verified against the real roof cells*,
 *            falling back to raw voxel faces if a roof ever does not fit
 *   others   chimneys, awnings, hay, ovens, gravestones, torches
 *
 * Nothing here decides where a wall is: cells come from the server. Presentation only.
 */
export interface WorldLight { x: number; y: number; z: number; color: [number, number, number]; intensity: number; range: number; kind: 'torch' | 'window' }
export interface StructureBuild { meshes: Mesh[]; lights: WorldLight[]; panes: Map<string, Mesh>; stats: { cells: number; faces: number; roofsAnalytic: number; roofsVoxel: number; windows: number } }

const ROOF_MATERIAL: Record<number, MatName> = { [B.RoofTile]: 'roofTile', [B.Thatch]: 'thatch', [B.DarkPlanks]: 'roofSlate' };
const WALL_MATERIAL: Record<number, MatName> = {
  [B.Plaster]: 'plaster', [B.Planks]: 'planks', [B.DarkPlanks]: 'darkwood', [B.Log]: 'log', [B.Log2]: 'log', [B.StoneBrick]: 'stone', [B.Mossy]: 'moss',
  [B.Stone]: 'stone', [B.Cobble]: 'cobble', [B.Brick]: 'stone', [B.Chimney]: 'stone', [B.Well]: 'moss', [B.Furnace]: 'stone', [B.Hay]: 'hay',
};
const CLOTH: Record<number, MatName> = { [B.Cloth]: 'cloth', [B.ClothRed]: 'clothRed', [B.ClothBlue]: 'clothBlue', [B.Wool]: 'cloth' };
const NON_OCCLUDING = new Set<number>([0, B.Glass, B.Torch, B.Cloth, B.ClothRed, B.ClothBlue, B.Wool, B.Gravestone]);
/** Whether a projected structure block would hide the camera (walls and roofs do; glass, cloth and torches do not). */
export const blocksCamera = (b: number): boolean => !NON_OCCLUDING.has(b);
const T = 0.42; // vertical roof thickness (metres)

const DIRS: { n: V; corners: [number, number, number][] }[] = [
  { n: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
];
const AO = [0.52, 0.68, 0.84, 1];

export class Cells {
  private readonly m = new Map<number, number>();
  constructor(readonly x0: number, readonly z0: number) {}
  private key(x: number, y: number, z: number): number { return ((((x - this.x0 + 2) << 9) | (z - this.z0 + 2)) << 8) | (y & 255); }
  set(x: number, y: number, z: number, b: number): void { this.m.set(this.key(x, y, z), b); }
  get(x: number, y: number, z: number): number { return this.m.get(this.key(x, y, z)) ?? 0; }
  get size(): number { return this.m.size; }
  *entries(): Generator<[number, number, number, number]> {
    for (const [k, b] of this.m) yield [(k >> 17) - 2 + this.x0, k & 255, ((k >> 8) & 511) - 2 + this.z0, b];
  }
}
/** Decode `structures.runs` (x, z, n, then n triples of y, length, block) into a cell lookup. */
export function decodeStructure(runs: number[], x0: number, z0: number): Cells {
  const cells = new Cells(x0, z0);
  for (let i = 0; i < runs.length;) {
    const x = runs[i++], z = runs[i++], n = runs[i++];
    for (let k = 0; k < n; k++, i += 3) for (let y = runs[i]; y < runs[i] + runs[i + 1]; y++) cells.set(x, y, z, runs[i + 2]);
  }
  return cells;
}

interface RoofFit { roofY: number; alongX: boolean; material: MatName; wall: MatName }

/** Whole-region build in one go (tests, showroom). The streaming path drives `buildStructuresSteps` inside a frame budget. */
export function buildStructures(scene: Scene, mats: MaterialLibrary, r: RegionProjection, litPlaces: ReadonlySet<string> = new Set()): StructureBuild {
  const steps = buildStructuresSteps(scene, mats, r, litPlaces);
  for (;;) { const s = steps.next(); if (s.done) return s.value; }
}
/** The same build, yielding every few milliseconds so a large settlement never holds a frame. */
export function* buildStructuresSteps(scene: Scene, mats: MaterialLibrary, r: RegionProjection, litPlaces: ReadonlySet<string> = new Set()): Generator<void, StructureBuild, void> {
  const out: StructureBuild = { meshes: [], lights: [], panes: new Map(), stats: { cells: 0, faces: 0, roofsAnalytic: 0, roofsVoxel: 0, windows: 0 } };
  if (!r.structures?.runs.length) return out;
  const x0 = r.bounds.x0, z0 = r.bounds.z0, cells = decodeStructure(r.structures.runs, x0, z0);
  out.stats.cells = cells.size;
  let activePlace: PlaceProjection | undefined;
  const batches = new Map<string, { batch: MeshBatch; material: MatName; place?: PlaceProjection }>();
  const batch = (m: MatName) => { const key = (activePlace?.id ?? '') + ':' + m; let b = batches.get(key); if (!b) { b = { batch: new MeshBatch(), material: m, place: activePlace }; batches.set(key, b); } return b.batch; };
  const L = (x: number, z: number): [number, number] => [x - x0, z - z0];
  const buildings = r.places.filter(p => p.indoor);
  const placeOf = (x: number, z: number): PlaceProjection | undefined => buildings.find(p => x >= p.bounds.x0 - 1 && x <= p.bounds.x1 + 1 && z >= p.bounds.z0 - 1 && z <= p.bounds.z1 + 1);
  const solid = (x: number, y: number, z: number) => !NON_OCCLUDING.has(cells.get(x, y, z));
  const glassBatches = new Map<string, MeshBatch>();
  function paneBatch(id: string): MeshBatch { let g = glassBatches.get(id); if (!g) glassBatches.set(id, g = new MeshBatch()); return g; }

  // ── roofs: fit each building's analytic gable to its actual roof cells ─────────────────────────
  const fits = new Map<string, RoofFit>();
  for (const p of buildings) {
    const fit = fitRoof(cells, p);
    if (!fit) { out.stats.roofsVoxel++; continue; }
    fits.set(p.id, fit); out.stats.roofsAnalytic++;
    activePlace = p; buildGableRoof(batch, mats, p, fit, x0, z0);
  }
  const insideFittedRoof = (x: number, y: number, z: number, b: number): boolean => {
    const p = placeOf(x, z); if (!p) return false;
    const fit = fits.get(p.id); if (!fit || y < fit.roofY) return false;
    // Everything above the wall top under a fitted roof is replaced by the analytic gable, except chimneys and torches.
    return b !== B.Chimney && b !== B.Torch;
  };

  // ── walls and other cells ──────────────────────────────────────────────────────────────────────
  let sliceAt = performance.now(), visited = 0;
  for (const [x, y, z, b] of cells.entries()) {
    if ((++visited & 127) === 0 && performance.now() - sliceAt > 3) { yield; sliceAt = performance.now(); }
    if (insideFittedRoof(x, y, z, b)) continue;
    const place = placeOf(x, z), variation = 0.95 + hash2(x, z, 11) * 0.05 + hash2(x + y * 7, z, 3) * 0.04;
    activePlace = place;
    const buildingTint = place ? 0.92 + hash2(place.visualSeed | 0, 5, 1) * 0.16 : 1;
    if (b === B.Glass) { windowAt(x, y, z, place); continue; }
    if (b === B.Torch) { out.lights.push({ x: x - x0 + 0.5, y: y + 0.75, z: z - z0 + 0.5, color: [1, 0.66, 0.32], intensity: 1.1, range: 9, kind: 'torch' }); torchAt(x, y, z); continue; }
    if (CLOTH[b] !== undefined) { awning(x, y, z, CLOTH[b]); continue; }
    if (b === B.Gravestone) { const [lx, lz] = L(x, z); batch('stone').box([lx + 0.2, y, lz + 0.42], [lx + 0.8, y + 0.9, lz + 0.58], [0.85, 0.85, 0.85], mats.tilesPerMetre('stone')); continue; }
    let mat = WALL_MATERIAL[b]; if (!mat) { const roof = ROOF_MATERIAL[b]; if (!roof) continue; mat = roof; }
    if (b === B.DarkPlanks && place) { const fit = fits.get(place.id); if (fit && y < fit.roofY) { trimAt(x, y, z, mat); continue; } }
    if (ROOF_MATERIAL[b] && b !== B.DarkPlanks && place && !fits.has(place.id)) mat = ROOF_MATERIAL[b];
    const bt = batch(mat), tpm = mats.tilesPerMetre(mat), [lx, lz] = L(x, z);
    for (const d of DIRS) {
      const nx = x + d.n[0], ny = y + d.n[1], nz = z + d.n[2];
      if (solid(nx, ny, nz) && cells.get(nx, ny, nz) !== 0) continue;
      const pts = d.corners.map(c => [lx + c[0], y + c[1], lz + c[2]] as V);
      const tints = d.corners.map(c => {
        const ax = d.n[0] ? 0 : d.n[1] ? 1 : 2, t1 = (ax + 1) % 3, t2 = (ax + 2) % 3, s1 = c[t1] ? 1 : -1, s2 = c[t2] ? 1 : -1;
        const at = (a: number, b2: number) => { const q = [nx, ny, nz]; q[t1] += a; q[t2] += b2; return solid(q[0], q[1], q[2]) && cells.get(q[0], q[1], q[2]) !== 0 ? 1 : 0; };
        const e1 = at(s1, 0), e2 = at(0, s2), cr = at(s1, s2), ao = e1 && e2 ? 0 : 3 - (e1 + e2 + cr), k = AO[ao] * variation * buildingTint;
        return [k, k, k] as V;
      });
      bt.quad(pts[0], pts[1], pts[2], pts[3], tints, tpm, { normal: d.n });
      out.stats.faces++;
    }
  }

  function trimAt(x: number, y: number, z: number, mat: MatName): void {
    // Timber posts and beams stand 4 cm proud of the plaster; faces shared with other trim are dropped.
    const bt = batch(mat), tpm = mats.tilesPerMetre(mat), [lx, lz] = L(x, z), e = 0.04;
    for (const d of DIRS) {
      if (cells.get(x + d.n[0], y + d.n[1], z + d.n[2]) === B.DarkPlanks) continue;
      const pts = d.corners.map(c => [lx + c[0] + (c[0] ? e : -e), y + c[1] + (c[1] ? e : -e), lz + c[2] + (c[2] ? e : -e)] as V);
      bt.quad(pts[0], pts[1], pts[2], pts[3], [0.78, 0.78, 0.78], tpm, { normal: d.n });
    }
  }
  function torchAt(x: number, y: number, z: number): void {
    const [lx, lz] = L(x, z), bt = batch('darkwood');
    bt.box([lx + 0.45, y, lz + 0.45], [lx + 0.55, y + 0.62, lz + 0.55], [1, 1, 1], mats.tilesPerMetre('darkwood'));
    batch('gold').box([lx + 0.4, y + 0.62, lz + 0.4], [lx + 0.6, y + 0.72, lz + 0.6], [1.6, 1.3, 0.7], mats.tilesPerMetre('gold'));
  }
  function awning(x: number, y: number, z: number, mat: MatName): void {
    const [lx, lz] = L(x, z), sag = 0.06 * Math.sin((x * 1.7 + z * 2.3)), bt = batch(mat);
    bt.box([lx, y + 0.82 + sag, lz], [lx + 1, y + 0.96 + sag, lz + 1], [1, 1, 1], mats.tilesPerMetre(mat));
  }
  function windowAt(x: number, y: number, z: number, place: PlaceProjection | undefined): void {
    out.stats.windows++;
    const [lx, lz] = L(x, z), alongX = (solid(x - 1, y, z) && solid(x + 1, y, z)) || !(solid(x, y, z - 1) && solid(x, y, z + 1));
    const frame = batch('darkwood'), glass = paneBatch(place?.id ?? '');
    const ftpm = mats.tilesPerMetre('darkwood'), gtpm = mats.tilesPerMetre('glass'), fw = 0.09, ft = 0.07;
    // Outer side: toward the nearest outside face of the owning building; inner is the other.
    let outer = -1;
    if (place) outer = alongX ? (z <= place.bounds.z0 ? -1 : 1) : (x <= place.bounds.x0 ? -1 : 1);
    const dark: V = [0.85, 0.85, 0.85];
    const bar = (min: V, max: V) => frame.box(min, max, dark, ftpm);
    if (alongX) {
      const pz = lz + 0.5; glass.quad([lx, y, pz], [lx + 1, y, pz], [lx + 1, y + 1, pz], [lx, y + 1, pz], [1, 1, 1], gtpm, { normal: [0, 0, 1] });
      glass.quad([lx, y, pz], [lx, y + 1, pz], [lx + 1, y + 1, pz], [lx + 1, y, pz], [1, 1, 1], gtpm, { normal: [0, 0, -1] });
      for (const zz of [lz - 0.02, lz + 1 - ft + 0.02]) { bar([lx, y, zz], [lx + fw, y + 1, zz + ft]); bar([lx + 1 - fw, y, zz], [lx + 1, y + 1, zz + ft]); bar([lx, y, zz], [lx + 1, y + fw, zz + ft]); bar([lx, y + 1 - fw, zz], [lx + 1, y + 1, zz + ft]); }
      bar([lx + 0.48, y, pz - 0.02], [lx + 0.52, y + 1, pz + 0.02]); bar([lx, y + 0.48, pz - 0.02], [lx + 1, y + 0.52, pz + 0.02]);
      const oz = outer < 0 ? lz - 0.12 : lz + 1.02;
      bar([lx - 0.04, y - 0.06, oz], [lx + 1.04, y + 0.03, oz + 0.12]);
      if (hash2(x, z, 77) > 0.4 && outer !== 0) { const sz = outer < 0 ? lz - 0.05 : lz + 1.0; bar([lx - 0.5, y, sz], [lx - 0.03, y + 1, sz + 0.05]); bar([lx + 1.03, y, sz], [lx + 1.5, y + 1, sz + 0.05]); }
    } else {
      const px = lx + 0.5; glass.quad([px, y, lz + 1], [px, y, lz], [px, y + 1, lz], [px, y + 1, lz + 1], [1, 1, 1], gtpm, { normal: [1, 0, 0] });
      glass.quad([px, y, lz], [px, y, lz + 1], [px, y + 1, lz + 1], [px, y + 1, lz], [1, 1, 1], gtpm, { normal: [-1, 0, 0] });
      for (const xx of [lx - 0.02, lx + 1 - ft + 0.02]) { bar([xx, y, lz], [xx + ft, y + 1, lz + fw]); bar([xx, y, lz + 1 - fw], [xx + ft, y + 1, lz + 1]); bar([xx, y, lz], [xx + ft, y + fw, lz + 1]); bar([xx, y + 1 - fw, lz], [xx + ft, y + 1, lz + 1]); }
      bar([px - 0.02, y, lz + 0.48], [px + 0.02, y + 1, lz + 0.52]); bar([px - 0.02, y + 0.48, lz], [px + 0.02, y + 0.52, lz + 1]);
      const ox = outer < 0 ? lx - 0.12 : lx + 1.02;
      bar([ox, y - 0.06, lz - 0.04], [ox + 0.12, y + 0.03, lz + 1.04]);
      if (hash2(x, z, 77) > 0.4) { const sx = outer < 0 ? lx - 0.05 : lx + 1.0; bar([sx, y, lz - 0.5], [sx + 0.05, y + 1, lz - 0.03]); bar([sx, y, lz + 1.03], [sx + 0.05, y + 1, lz + 1.5]); }
    }
    if (place && litPlaces.has(place.id)) out.lights.push({ x: lx + 0.5, y: y + 0.5, z: lz + 0.5, color: [1, 0.72, 0.4], intensity: 0.5, range: 6, kind: 'window' });
  }
  for (const [key, entry] of batches) {
    const mesh = entry.batch.build(`structure-${r.id}-${key}`, scene, mats.get(entry.material), { receiveShadow: true });
    if (mesh) {
      if (entry.place) {
        const material = mesh.material!.clone(mesh.name + '-cutaway')!;
        material.clipPlane = new Plane(0, 1, 0, -1e8); mesh.material = material;
        mesh.metadata = { cutawayBounds: entry.place.bounds, ownsCutawayMaterial: true };
      }
      out.meshes.push(mesh);
    }
    yield;
  }
  for (const [id, gb] of glassBatches) {
    const mesh = gb.build(`panes-${r.id}-${id}`, scene, mats.get('glass'), { receiveShadow: false });
    if (mesh) {
      const place = buildings.find(p => p.id === id);
      if (place) { const material = mesh.material!.clone(mesh.name + '-cutaway')!; material.clipPlane = new Plane(0, 1, 0, -1e8); mesh.material = material; mesh.metadata = { cutawayBounds: place.bounds, ownsCutawayMaterial: true }; }
      out.meshes.push(mesh); out.panes.set(id, mesh);
    }
    yield;
  }
  return out;
}

/** Find the building's roof from its real cells, or null if it is not the standard gable. */
function fitRoof(cells: Cells, p: PlaceProjection): RoofFit | null {
  const { x0, x1, z0, z1 } = p.bounds;
  let roofY = Infinity, mat: MatName | null = null;
  for (let y = 0; y < 128; y++) { const b = cells.get(x0 - 1, y, z0 - 1); if (ROOF_MATERIAL[b]) { roofY = y; mat = ROOF_MATERIAL[b]; break; } }
  if (mat === null) return null;
  const alongZ = !!ROOF_MATERIAL[cells.get(x0 - 1, roofY, z0)] && !ROOF_MATERIAL[cells.get(x0, roofY, z0 - 1)];
  const alongX = !alongZ;
  // Expected roof cells for the standard construction.
  const expect = new Set<string>();
  const [a0, a1, b0, b1] = alongX ? [x0 - 1, x1 + 1, z0 - 1, z1 + 1] : [z0 - 1, z1 + 1, x0 - 1, x1 + 1];
  for (let i = 0; ; i++) {
    const ba = b0 + i, bb = b1 - i; if (ba > bb) break; const y = roofY + i;
    for (let a = a0; a <= a1; a++) for (const bcell of ba === bb ? [ba] : [ba, bb]) expect.add(alongX ? `${a},${y},${bcell}` : `${bcell},${y},${a}`);
  }
  let matches = 0, extra = 0;
  for (let x = x0 - 1; x <= x1 + 1; x++) for (let z = z0 - 1; z <= z1 + 1; z++) for (let y = roofY; y < roofY + 40; y++) {
    if (!ROOF_MATERIAL[cells.get(x, y, z)]) continue;
    if (expect.has(`${x},${y},${z}`)) matches++; else extra++;
  }
  // A chimney or torch may stand where one roof cell would be; a few missing cells are fine, foreign cells are not.
  if (extra > 0 || expect.size - matches > Math.max(3, expect.size * 0.04)) return null;
  // The wall material is whatever stands in the footprint ring just under the roof.
  let wall: MatName = 'plaster';
  scan: for (let y = roofY - 2; y >= roofY - 4; y--) for (const [x, z] of [[x0, z0 + 2], [x0 + 2, z0], [x1, z1 - 2], [x1 - 2, z1]]) {
    const b = cells.get(x, y, z); if (b && b !== B.DarkPlanks && b !== B.Glass && WALL_MATERIAL[b]) { wall = WALL_MATERIAL[b]; break scan; }
  }
  return { roofY, alongX, material: mat, wall };
}

/** A watertight gable: two slopes, ridge, fascias, gable ends and eave friezes down to the wall tops. */
function buildGableRoof(batch: (m: MatName) => MeshBatch, mats: MaterialLibrary, p: PlaceProjection, fit: RoofFit, rx: number, rz: number): void {
  const { x0, x1, z0, z1 } = p.bounds, y0 = fit.roofY, alongX = fit.alongX;
  // Work in (a = across the ridge, b = along the ridge) then map to x/z.
  const a0 = alongX ? z0 - 1 : x0 - 1, a1 = alongX ? z1 + 2 : x1 + 2, b0 = alongX ? x0 - 1 : z0 - 1, b1 = alongX ? x1 + 2 : z1 + 2;
  const ac = (a0 + a1) / 2, top = (a: number) => y0 + 0.5 + Math.min(a - a0, a1 - a), under = (a: number) => top(a) - T;
  const P = (a: number, b: number, y: number): V => alongX ? [b - rx, y, a - rz] : [a - rx, y, b - rz];
  const roof = batch(fit.material), rt = mats.tilesPerMetre(fit.material), wallBatch = batch(fit.wall), wt = mats.tilesPerMetre(fit.wall);
  const tint: V = [1, 1, 1];
  const slope = (aa: number, ab: number, up: boolean) => {
    // top surface and underside for one slope between aa and ab
    const t0 = top(aa), t1 = top(ab);
    const q: V[] = [P(aa, b0, t0), P(aa, b1, t0), P(ab, b1, t1), P(ab, b0, t1)];
    const u: V[] = [P(aa, b0, t0 - T), P(aa, b1, t0 - T), P(ab, b1, t1 - T), P(ab, b0, t1 - T)];
    // orientation: make the normal point up for the top, down for the underside
    const n = cross3(sub3(q[1], q[0]), sub3(q[3], q[0]));
    const flipTop = n[1] < 0;
    roof.quad(q[0], q[1], q[2], q[3], tint, rt, { flip: flipTop });
    roof.quad(u[0], u[1], u[2], u[3], [0.72, 0.72, 0.72], rt, { flip: !flipTop });
    void up;
  };
  slope(a0, ac, true); slope(ac, a1, false);
  // Eave and barge fascia (the roof's edge thickness), in dark timber.
  const fas = batch('darkwood'), ft = mats.tilesPerMetre('darkwood'), dk: V = [0.9, 0.9, 0.9];
  const edge = (pts: V[], normal: V) => fas.polygon(pts, normal, dk, ft);
  const nA0: V = alongX ? [0, 0, -1] : [-1, 0, 0], nA1: V = alongX ? [0, 0, 1] : [1, 0, 0], nB0: V = alongX ? [-1, 0, 0] : [0, 0, -1], nB1: V = alongX ? [1, 0, 0] : [0, 0, 1];
  edge([P(a0, b1, top(a0)), P(a0, b0, top(a0)), P(a0, b0, under(a0)), P(a0, b1, under(a0))], nA0);
  edge([P(a1, b0, top(a1)), P(a1, b1, top(a1)), P(a1, b1, under(a1)), P(a1, b0, under(a1))], nA1);
  for (const [b, nrm, flip] of [[b0, nB0, false], [b1, nB1, true]] as [number, V, boolean][]) {
    const prof = (aa: number, ab: number) => [P(aa, b, top(aa)), P(ab, b, top(ab)), P(ab, b, under(ab)), P(aa, b, under(aa))];
    for (const [aa, ab] of [[a0, ac], [ac, a1]]) { const q = prof(aa, ab); edge(flip ? q : q.slice().reverse(), nrm); }
  }
  // Ridge cap.
  const rr = ac, ty = top(rr);
  fas.box(alongX ? [b0 - rx - 0.06, ty - 0.02, rr - rz - 0.16] : [rr - rx - 0.16, ty - 0.02, b0 - rz - 0.06], alongX ? [b1 - rx + 0.06, ty + 0.16, rr - rz + 0.16] : [rr - rx + 0.16, ty + 0.16, b1 - rz + 0.06], dk, ft);
  // Wall fill from the wall top to the roof underside: eave friezes and gable ends, outside and in.
  const wallTop = y0;
  const fill = (aLo: number, aHi: number, bPlane: number, outward: -1 | 1, nrm: V) => {
    // A face on the plane b = bPlane spanning a in [aLo, aHi], from wallTop up to the roof underside.
    const pts: V[] = [P(aLo, bPlane, wallTop), P(aHi, bPlane, wallTop)];
    const steps = [aHi, ...(aHi > ac && aLo < ac ? [ac] : []), aLo].filter((v, i, arr) => i === 0 || v !== arr[i - 1]);
    for (const a of steps) pts.push(P(a, bPlane, Math.max(wallTop, under(a))));
    const ordered = outward < 0 ? pts : pts;
    wallBatch.polygon(ordered.length > 3 ? fixWinding(ordered, nrm) : ordered, nrm, [0.94, 0.94, 0.94], wt);
  };
  // gable ends (b planes): outer at b0+1 / b1-1 (wall faces), inner one cell in
  fill(a0 + 1, a1 - 1, b0 + 1, -1, nB0); fill(a0 + 2, a1 - 2, b0 + 2, 1, nB1.map(v => -v) as V);
  fill(a0 + 1, a1 - 1, b1 - 1, 1, nB1); fill(a0 + 2, a1 - 2, b1 - 2, -1, nB0.map(v => -v) as V);
  // eave friezes (a planes), outer and inner
  const frieze = (a: number, nrm: V) => {
    const h = Math.max(wallTop, under(a)); if (h - wallTop < 0.02) return;
    const q: V[] = [P(a, b0 + 1, wallTop), P(a, b1 - 1, wallTop), P(a, b1 - 1, h), P(a, b0 + 1, h)];
    wallBatch.polygon(fixWinding(q, nrm), nrm, [0.94, 0.94, 0.94], wt);
  };
  frieze(a0 + 1, nA0); frieze(a0 + 2, nA1); frieze(a1 - 1, nA1); frieze(a1 - 2, nA0);
}
const sub3 = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Reverse the point order if it winds clockwise relative to the requested outward normal. */
function fixWinding(points: V[], normal: V): V[] {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
  return nx * normal[0] + ny * normal[1] + nz * normal[2] < 0 ? points.slice().reverse() : points;
}
