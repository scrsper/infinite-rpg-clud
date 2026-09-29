import { Matrix, Mesh, Quaternion, Scene, Vector3, type Material } from '@babylonjs/core';
import type { MaterialLibrary } from '../render/materials';
import { hash2, mulberry, worldNoise } from '../render/noise';
import type { RegionProjection, ResourceProjection } from '../net/messages';
import { MeshBatch, type V } from './meshBatch';
import type { TerrainBuild } from './terrain';

/**
 * Trees, bushes, rocks and stumps built as code. Every species is a two-material prototype (bark
 * + leaf) with a few seeded variants; regions instance them with thin instances. Canonical
 * resource nodes (the trees people actually fell, the rocks they quarry) use the same prototypes at
 * their exact positions; decorative scatter only fills the space between and never touches routes.
 */
export type Species = 'oak' | 'birch' | 'pine' | 'bush' | 'berry' | 'rock' | 'stump' | 'sapling';
const VARIANTS = 4;
type Tint = [number, number, number];
const mixT = (a: Tint, b: Tint, t: number): Tint => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

let DETAIL = 0;
function blobGradient(b: MeshBatch, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, low: Tint, high: Tint, seed: number, seg = 9, ring = 6, jitter = 0.32): void {
  if (DETAIL) { seg = Math.max(5, Math.round(seg * 0.62)); ring = Math.max(3, Math.round(ring * 0.55)); }
  const pt = (i: number, j: number): { p: V; t: Tint } => {
    const th = (i % seg) / seg * Math.PI * 2, ph = j / ring * Math.PI, jit = 1 + (hash2(i % seg, j, seed) - 0.5) * jitter;
    const y = Math.cos(ph), p: V = [cx + Math.cos(th) * Math.sin(ph) * rx * jit, cy + y * ry * jit, cz + Math.sin(th) * Math.sin(ph) * rz * jit];
    const shade = 0.5 + 0.5 * y + (hash2(i % seg, j, seed + 7) - 0.5) * 0.18;
    return { p, t: mixT(low, high, Math.max(0, Math.min(1, shade))) };
  };
  for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) {
    const a = pt(i, j), bb = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
    // smooth-ish normal: from blob centre outward at the quad centre
    const mx = (a.p[0] + c.p[0]) / 2 - cx, my = (a.p[1] + c.p[1]) / 2 - cy, mz = (a.p[2] + c.p[2]) / 2 - cz, l = Math.hypot(mx, my, mz) || 1;
    b.quad(a.p, d.p, c.p, bb.p, [a.t, d.t, c.t, bb.t], 0.6, { normal: [mx / l, my / l, mz / l] });
  }
}
function tube(b: MeshBatch, from: V, to: V, r0: number, r1: number, sides: number, tint: Tint): void {
  if (DETAIL) { if (r0 < 0.12) return; sides = Math.max(4, sides - 3); }
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], len = Math.hypot(dx, dy, dz) || 1;
  const ax: V = [dx / len, dy / len, dz / len], ref: V = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(ax, ref)), v = cross(ax, u);
  const ring = (c: V, r: number) => Array.from({ length: sides }, (_, i) => { const a = i / sides * Math.PI * 2; return [c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r] as V; });
  const r0s = ring(from, r0), r1s = ring(to, r1);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, m = i / sides * Math.PI * 2 + Math.PI / sides;
    const nrm: V = [u[0] * Math.cos(m) + v[0] * Math.sin(m), u[1] * Math.cos(m) + v[1] * Math.sin(m), u[2] * Math.cos(m) + v[2] * Math.sin(m)];
    b.quad(r0s[j], r0s[i], r1s[i], r1s[j], tint, 0.7, { normal: nrm });
  }
}
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function buildSpecies(species: Species, seed: number, lod = 0): { bark: MeshBatch; leaf: MeshBatch } {
  DETAIL = lod;
  const bark = new MeshBatch(), leaf = new MeshBatch(), r = mulberry(seed * 977 + species.length * 31);
  const lerp = (a: number, b: number) => a + (b - a) * r();
  const greens: Record<string, [Tint, Tint]> = {
    oak: [[0.13, 0.27, 0.11], [0.42, 0.55, 0.2]], birch: [[0.27, 0.4, 0.14], [0.66, 0.72, 0.28]], bush: [[0.12, 0.24, 0.1], [0.34, 0.5, 0.2]],
    pine: [[0.07, 0.17, 0.11], [0.2, 0.36, 0.22]], berry: [[0.12, 0.25, 0.1], [0.32, 0.48, 0.2]], sapling: [[0.2, 0.35, 0.14], [0.5, 0.62, 0.25]],
  };
  switch (species) {
    case 'oak': {
      const h = lerp(4.6, 6), lean = lerp(-0.4, 0.4), tk: Tint = [0.33, 0.24, 0.17];
      tube(bark, [0, -0.2, 0], [lean * 0.4, h * 0.55, 0], 0.42, 0.3, 8, tk); tube(bark, [lean * 0.4, h * 0.55, 0], [lean, h, lerp(-0.3, 0.3)], 0.3, 0.18, 7, tk);
      const branches = 4 + Math.floor(r() * 3);
      for (let i = 0; i < branches; i++) {
        const a = i / branches * Math.PI * 2 + r(), len = lerp(1.6, 2.6), by = h * lerp(0.62, 0.9), tx = lean * 0.7 + Math.cos(a) * len, tz = Math.sin(a) * len, ty = by + lerp(0.6, 1.4);
        tube(bark, [lean * 0.6, by, 0], [tx, ty, tz], 0.13, 0.06, 6, tk);
        blobGradient(leaf, tx, ty + 0.7, tz, lerp(1.5, 2.1), lerp(1.2, 1.7), lerp(1.5, 2.1), greens.oak[0], greens.oak[1], seed * 17 + i);
      }
      blobGradient(leaf, lean, h + 1.2, 0, lerp(2.2, 2.9), lerp(1.7, 2.2), lerp(2.2, 2.9), greens.oak[0], greens.oak[1], seed * 13);
      break;
    }
    case 'birch': {
      const h = lerp(6.5, 8.5), lean = lerp(-0.3, 0.3), tk: Tint = [0.86, 0.84, 0.78];
      tube(bark, [0, -0.2, 0], [lean, h, 0], 0.16, 0.06, 6, tk);
      for (let i = 0; i < 5; i++) { const y = lerp(0.25, 0.9) * h; tube(bark, [lean * y / h, y, 0], [lean * y / h + Math.cos(i * 2.4) * 0.05, y + 0.02, Math.sin(i * 2.4) * 0.05], 0.17, 0.17, 6, [0.14, 0.13, 0.12]); }
      for (let i = 0; i < 5; i++) { const a = i * 2.4 + r(), y = h * lerp(0.55, 0.95), len = lerp(0.9, 1.6); blobGradient(leaf, lean + Math.cos(a) * len, y, Math.sin(a) * len, lerp(0.9, 1.3), lerp(1.1, 1.6), lerp(0.9, 1.3), greens.birch[0], greens.birch[1], seed * 11 + i, 8, 5); }
      blobGradient(leaf, lean, h + 0.6, 0, 1.2, 1.4, 1.2, greens.birch[0], greens.birch[1], seed * 3, 8, 5);
      break;
    }
    case 'pine': {
      const h = lerp(7, 10), tk: Tint = [0.28, 0.2, 0.15];
      tube(bark, [0, -0.2, 0], [0, h, 0], 0.26, 0.08, 7, tk);
      const tiers = DETAIL ? 4 : 6; for (let i = 0; i < tiers; i++) {
        const t = i / tiers, y = h * (0.22 + 0.72 * t), rad = lerp(2.4, 2.8) * (1 - t) + 0.45, hh = lerp(1.7, 2.3);
        const rot = r() * 6, seg = DETAIL ? 6 : 9; const apex: V = [0, y + hh, 0];
        for (let s = 0; s < seg; s++) {
          const a0 = rot + s / seg * Math.PI * 2, a1 = rot + (s + 1) / seg * Math.PI * 2, m = (a0 + a1) / 2, j = 1 + (hash2(s, i, seed) - 0.5) * 0.25;
          const p0: V = [Math.cos(a0) * rad * j, y, Math.sin(a0) * rad * j], p1: V = [Math.cos(a1) * rad * j, y, Math.sin(a1) * rad * j];
          const low = mixT(greens.pine[0], greens.pine[1], 0.2 + t * 0.4), high = mixT(greens.pine[0], greens.pine[1], 0.45 + t * 0.5);
          const nrm = norm([Math.cos(m) * hh, rad * 0.9, Math.sin(m) * hh]);
          leaf.quad(p1, p0, apex, apex, [low, low, high, high], 0.6, { normal: nrm });
        }
      }
      break;
    }
    case 'bush': case 'berry': {
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) blobGradient(leaf, Math.cos(i * 2.1) * 0.5, lerp(0.35, 0.6), Math.sin(i * 2.1) * 0.5, lerp(0.55, 0.85), lerp(0.4, 0.62), lerp(0.55, 0.85), greens[species][0], greens[species][1], seed * 19 + i, 7, 5);
      if (species === 'berry') for (let i = 0; i < 9; i++) { const a = r() * 6.28, rr = lerp(0.3, 0.75); blobGradient(leaf, Math.cos(a) * rr, lerp(0.35, 0.8), Math.sin(a) * rr, 0.06, 0.06, 0.06, [0.55, 0.08, 0.16], [0.8, 0.15, 0.25], seed + i, 5, 3, 0); }
      break;
    }
    case 'sapling': {
      const h = lerp(1.2, 2); tube(bark, [0, -0.1, 0], [0, h, 0], 0.05, 0.025, 5, [0.36, 0.26, 0.18]);
      for (let i = 0; i < 3; i++) blobGradient(leaf, Math.cos(i * 2.1) * 0.3, h * (0.55 + i * 0.2), Math.sin(i * 2.1) * 0.3, 0.42, 0.34, 0.42, greens.sapling[0], greens.sapling[1], seed * 7 + i, 7, 4);
      break;
    }
    case 'rock': {
      const s = lerp(0.6, 1.1), g: Tint = [0.42, 0.41, 0.4];
      blobGradient(bark, 0, s * 0.45, 0, s * 1.05, s * 0.72, s * 0.9, [g[0] * 0.7, g[1] * 0.7, g[2] * 0.7], [g[0] * 1.25, g[1] * 1.25, g[2] * 1.25], seed * 5, 8, 5, 0.5);
      if (r() > 0.4) blobGradient(bark, s * 0.9, s * 0.25, s * 0.3, s * 0.5, s * 0.34, s * 0.45, [g[0] * 0.6, g[1] * 0.6, g[2] * 0.6], [g[0] * 1.1, g[1] * 1.1, g[2] * 1.1], seed * 5 + 1, 7, 4, 0.5);
      break;
    }
    case 'stump': {
      tube(bark, [0, -0.15, 0], [0, 0.55, 0], 0.42, 0.34, 9, [0.3, 0.22, 0.16]);
      const cap = [0.72, 0.58, 0.38] as Tint; const pts: V[] = []; for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; pts.push([Math.cos(a) * 0.34, 0.55, Math.sin(a) * 0.34]); }
      bark.polygon(pts.slice().reverse(), [0, 1, 0], cap, 0.6);
      break;
    }
  }
  return { bark, leaf };
}

export class VegetationLibrary {
  private readonly protos = new Map<string, Mesh>();
  constructor(private readonly scene: Scene, private readonly mats: MaterialLibrary) {}
  /** lod 0 is the full model; lod 1 is a much cheaper silhouette used beyond the near ring. */
  get(species: Species, variant: number, lod = 0): Mesh {
    const key = `${species}:${variant % VARIANTS}:${lod}`;
    let m = this.protos.get(key); if (m) return m;
    const { bark, leaf } = buildSpecies(species, variant % VARIANTS + 1, lod);
    const meshes: Mesh[] = [];
    const barkMat: Material = this.mats.get('bark'), leafMat: Material = this.mats.get(species === 'rock' ? 'rock' : 'leaf');
    const bm = bark.linearize().build(`veg-${key}-bark`, this.scene, barkMat, { receiveShadow: true }); if (bm) meshes.push(bm);
    const lm = leaf.linearize().build(`veg-${key}-leaf`, this.scene, leafMat, { receiveShadow: true }); if (lm) meshes.push(lm);
    m = meshes.length > 1 ? Mesh.MergeMeshes(meshes, true, true, undefined, false, true)! : meshes[0];
    m.name = `proto-${key}`; m.setEnabled(false); m.isPickable = false; this.protos.set(key, m);
    return m;
  }
  dispose(): void { for (const m of this.protos.values()) m.dispose(); this.protos.clear(); }
}

interface Group { species: Species; variant: number; matrices: number[]; positions: number[]; near: Mesh | null; far: Mesh | null; nearBuf: Float32Array; farBuf: Float32Array }
/**
 * Thin-instance hosts for one region: one near (full detail) and one far (cheap silhouette) host
 * per species and variant. Each refresh classifies every instance by its distance to the camera:
 * near ring -> full model (and shadow casting), middle ring -> cheap model, beyond or clearly behind
 * the camera -> not drawn. That keeps a dense forest inside a few hundred thousand triangles with a
 * few hundred draw calls, and the classification is a few thousand distance tests.
 */
export class InstanceSet {
  readonly hosts: Mesh[] = [];
  private readonly groups = new Map<string, Group>();
  count = 0;
  add(_lib: VegetationLibrary, species: Species, variant: number, pos: Vector3, yaw: number, scale: number): void {
    const key = `${species}:${variant % VARIANTS}`;
    let g = this.groups.get(key); if (!g) this.groups.set(key, g = { species, variant: variant % VARIANTS, matrices: [], positions: [], near: null, far: null, nearBuf: new Float32Array(0), farBuf: new Float32Array(0) });
    const m = Matrix.Compose(new Vector3(scale, scale, scale), Quaternion.RotationAxis(Vector3.Up(), yaw), pos);
    g.matrices.push(...m.toArray()); g.positions.push(pos.x, pos.z); this.count++;
  }
  finish(lib: VegetationLibrary, parent: import('@babylonjs/core').TransformNode, name: string, castShadow: (m: Mesh) => void): void {
    for (const [key, g] of this.groups) {
      const n = g.positions.length / 2;
      for (const lod of [0, 1]) {
        const host = lib.get(g.species, g.variant, lod).clone(`${name}-${key}-${lod}`, parent);
        host.makeGeometryUnique(); host.isPickable = false; host.alwaysSelectAsActiveMesh = true; host.setEnabled(false);
        const buf = new Float32Array(n * 16);
        host.thinInstanceSetBuffer('matrix', buf, 16, false); host.thinInstanceCount = 0;
        if (lod === 0) { g.near = host; g.nearBuf = buf; castShadow(host); } else { g.far = host; g.farBuf = buf; }
        this.hosts.push(host);
      }
    }
  }
  /** `rootX/rootZ`: the region root's render position. `cam`: camera render position and horizontal forward. */
  refresh(rootX: number, rootZ: number, camX: number, camZ: number, fwdX: number, fwdZ: number, nearDist: number, farDist: number): void {
    const n2 = nearDist * nearDist, f2 = farDist * farDist;
    for (const g of this.groups.values()) {
      if (!g.near || !g.far) continue;
      let nn = 0, nf = 0; const P = g.positions, M = g.matrices;
      for (let i = 0, j = 0; i < P.length; i += 2, j += 16) {
        const dx = P[i] + rootX - camX, dz = P[i + 1] + rootZ - camZ, d2 = dx * dx + dz * dz;
        if (d2 > f2) continue;
        if (d2 > 900 && dx * fwdX + dz * fwdZ < -0.25 * Math.sqrt(d2) - 8) continue;   // well behind the camera
        const out = d2 < n2 ? g.nearBuf : g.farBuf, o = (d2 < n2 ? nn++ : nf++) * 16;
        for (let k = 0; k < 16; k++) out[o + k] = M[j + k];
      }
      g.near.thinInstanceCount = nn; g.far.thinInstanceCount = nf;
      if (nn) g.near.thinInstanceBufferUpdated('matrix'); if (nf) g.far.thinInstanceBufferUpdated('matrix');
      g.near.setEnabled(nn > 0); g.far.setEnabled(nf > 0);
    }
  }
  dispose(): void { for (const h of this.hosts) h.dispose(); this.hosts.length = 0; this.groups.clear(); }
}

export interface ScatterInput {
  region: RegionProjection; terrain: TerrainBuild; density: number;
  canonical: ResourceProjection[]; exclusions: { x0: number; z0: number; x1: number; z1: number }[];
  /** Region-local origin subtraction: instances are placed at (x - region.bounds.x0, y, z - region.bounds.z0). */
}
/** Deterministic decorative scatter over forest density; never on routes, buildings, water or canonical nodes. */
export function scatterVegetation(lib: VegetationLibrary, inst: InstanceSet, input: ScatterInput, decorSeed: number): number {
  const { region, terrain, density, canonical, exclusions } = input, x0 = region.bounds.x0, z0 = region.bounds.z0, size = region.bounds.x1 - x0;
  const g = terrain.grid, rnd = mulberry(decorSeed >>> 0 || 1);
  const pathCells = new Set<number>(); for (const [x, , z] of region.paths) pathCells.add(x * 100003 + z);
  const roadSegs: [number, number, number, number][] = [];
  for (const road of region.roads) for (let i = 0; i < road.points.length - 1; i++) roadSegs.push([road.points[i].x, road.points[i].z, road.points[i + 1].x, road.points[i + 1].z]);
  const nearRoad = (x: number, z: number, d: number) => roadSegs.some(([ax, az, bx, bz]) => { const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1))); return Math.hypot(x - (ax + vx * t), z - (az + vz * t)) < d; });
  const nearPath = (x: number, z: number, d: number) => { for (let dx = -d; dx <= d; dx++) for (let dz = -d; dz <= d; dz++) if (pathCells.has(Math.floor(x + dx) * 100003 + Math.floor(z + dz))) return true; return false; };
  const excluded = (x: number, z: number) => exclusions.some(b => x >= b.x0 - 4 && x <= b.x1 + 5 && z >= b.z0 - 4 && z <= b.z1 + 5);
  const nearCanonical = (x: number, z: number) => canonical.some(c => Math.hypot(c.pos.x - x, c.pos.z - z) < 2.6);
  let placed = 0; const cell = 5.5;
  for (let cx = 0; cx < size; cx += cell) for (let cz = 0; cz < size; cz += cell) {
    const x = x0 + cx + rnd() * cell, z = z0 + cz + rnd() * cell, roll = rnd(), roll2 = rnd(), roll3 = rnd();
    const gi = Math.max(0, Math.min(g.n - 1, Math.round((x - g.x0) / g.stride))), gj = Math.max(0, Math.min(g.n - 1, Math.round((z - g.z0) / g.stride))), k = gi * g.n + gj;
    if (g.water[k] >= 0 || g.block[k] !== 1 /* grass */) continue;
    const f = g.forest[k], p = Math.max(0, Math.min(1, (f - 0.32) / 0.5)) * density;
    if (roll > p) { // open ground: the occasional bush or rock
      if (f > 0.2 && roll2 < 0.05 * density && !excluded(x, z) && !nearRoad(x, z, 3) && !nearPath(x, z, 2)) { inst.add(lib, roll3 < 0.7 ? 'bush' : 'rock', Math.floor(roll * 97), new Vector3(x - x0, terrain.heightAt(x, z) - 0.05, z - z0), roll3 * 6.28, 0.7 + roll2 * 0.7); placed++; }
      continue;
    }
    if (excluded(x, z) || nearRoad(x, z, 5) || nearPath(x, z, 2) || nearCanonical(x, z)) continue;
    const n = worldNoise(x, z, 150, 21), species: Species = n < 0.38 ? 'oak' : n < 0.62 ? (roll3 < 0.55 ? 'birch' : 'oak') : n < 0.8 ? (roll3 < 0.5 ? 'pine' : 'birch') : 'pine';
    inst.add(lib, species, Math.floor(roll2 * 97), new Vector3(x - x0, terrain.heightAt(x, z) - 0.1, z - z0), roll3 * 6.28, 0.8 + roll2 * 0.55); placed++;
    if (roll3 < 0.3) { const a = roll * 6.28; inst.add(lib, 'bush', Math.floor(roll3 * 97), new Vector3(x - x0 + Math.cos(a) * 2.4, terrain.heightAt(x + Math.cos(a) * 2.4, z + Math.sin(a) * 2.4) - 0.05, z - z0 + Math.sin(a) * 2.4), a, 0.8 + roll2 * 0.5); placed++; }
  }
  return placed;
}
