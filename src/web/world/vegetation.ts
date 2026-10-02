import { Material, Matrix, Mesh, Quaternion, Scene, Vector3 } from '@babylonjs/core';
import type { MaterialLibrary } from '../render/materials';
import { hash2, mulberry, worldNoise } from '../render/noise';
import type { RegionProjection, ResourceProjection } from '../net/messages';
import { MeshBatch, type V } from './meshBatch';
import type { TerrainBuild } from './terrain';

/**
 * Trees, bushes, rocks and stumps built as code. Every species is a two-material asset (bark
 * + leaf) with a few seeded variants; regions instance them with thin instances. Canonical
 * resource nodes (the trees people actually fell, the rocks they quarry) use the same prototypes at
 * their exact positions; decorative scatter only fills the space between and never touches routes.
 */
export type Species = 'oak' | 'birch' | 'pine' | 'bush' | 'berry' | 'rock' | 'stump' | 'sapling';
const VARIANTS = 4;
type Tint = [number, number, number];
const mixT = (a: Tint, b: Tint, t: number): Tint => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

let DETAIL = 0;
/** Layered branch sprays give a permeable canopy and soft silhouette at both LODs. */
function foliage(b: MeshBatch, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, low: Tint, high: Tint, seed: number, ..._unused: number[]): void {
  const rnd = mulberry(seed), count = DETAIL ? 18 : 38;
  for (let i = 0; i < count; i++) {
    const a = rnd()*Math.PI*2, ny = rnd()*2-1, radial = Math.sqrt(1-ny*ny), radius = .5 + rnd()*.5;
    const nx = Math.cos(a)*radial, nz = Math.sin(a)*radial;
    const c: V = [cx+nx*rx*radius, cy+ny*ry*radius, cz+nz*rz*radius];
    const normal = norm([nx, .5+Math.abs(ny), nz]);
    const u = norm(cross(normal, [0,1,.01])), v = cross(normal,u);
    const size = (DETAIL ? .95 : .7)*Math.max(.45, Math.min(rx,ry,rz))*(.7+rnd()*.6);
    const corner = (x: number, y: number): V => [c[0]+size*(u[0]*x+v[0]*y),c[1]+size*(u[1]*x+v[1]*y),c[2]+size*(u[2]*x+v[2]*y)];
    const start=b.uvs.length, shade=.72 + Math.max(0,ny)*.2 + rnd()*.12;
    b.quad(corner(-1,-1),corner(1,-1),corner(1,1),corner(-1,1),[shade,shade,shade],1,{normal});
    b.uvs.splice(start,8,0,1,1,1,1,0,0,0);
  }
  void low; void high;
}
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
    const start = b.normals.length, uvStart = b.uvs.length;
    b.quad(r0s[j], r0s[i], r1s[i], r1s[j], tint, 0.7, { normal: nrm });
    for (const [k, angle] of [j, i, i, j].map((q, k) => [k, q / sides * Math.PI * 2])) {
      b.normals[start+k*3] = u[0]*Math.cos(angle)+v[0]*Math.sin(angle);
      b.normals[start+k*3+1] = u[1]*Math.cos(angle)+v[1]*Math.sin(angle);
      b.normals[start+k*3+2] = u[2]*Math.cos(angle)+v[2]*Math.sin(angle);
    }
    const around = Math.PI*(r0+r1), u0=i/sides*around, u1=(i+1)/sides*around;
    b.uvs.splice(uvStart,8,u1,0,u0,0,u0,len*.65,u1,len*.65);
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
      tube(bark, [0, -.2, 0], [lean*.08, .75, 0], .49, .32, 14, tk);
      tube(bark, [lean*.08,.75,0], [lean*.4,h*.55,0], .32,.24,14,tk);
      tube(bark, [lean * 0.4, h * 0.55, 0], [lean, h, lerp(-0.3, 0.3)], .24, .055, 12, tk);
      for (let root=0; root<6; root++) { const a=root*2.4; tube(bark,[0,.45,0],[Math.cos(a)*.85,-.07,Math.sin(a)*.85],.19,.03,8,tk); }
      const branches = 4 + Math.floor(r() * 3);
      for (let i = 0; i < branches; i++) {
        const a = i / branches * Math.PI * 2 + r(), len = lerp(1.6, 2.6), by = h * lerp(0.62, 0.9), tx = lean * 0.7 + Math.cos(a) * len, tz = Math.sin(a) * len, ty = by + lerp(0.6, 1.4);
        const elbow: V=[tx*.55,by+.18,tz*.55], tip: V=[tx,ty,tz];
        tube(bark, [lean * 0.6, by, 0], elbow, .16,.085,10,tk);
        tube(bark, elbow, tip, .085,.012,8,tk);
        for (let fork=0;fork<3;fork++) { const fa=a+(fork-1)*.65; tube(bark,elbow,[tx+Math.cos(fa)*.65,ty+.3+fork*.15,tz+Math.sin(fa)*.65],.038,.006,7,tk); }
        foliage(leaf, tx, ty + 0.7, tz, lerp(1.5, 2.1), lerp(1.2, 1.7), lerp(1.5, 2.1), greens.oak[0], greens.oak[1], seed * 17 + i);
      }
      foliage(leaf, lean, h + 1.2, 0, lerp(2.2, 2.9), lerp(1.7, 2.2), lerp(2.2, 2.9), greens.oak[0], greens.oak[1], seed * 13);
      break;
    }
    case 'birch': {
      const h = lerp(6.5, 8.5), lean = lerp(-0.3, 0.3), tk: Tint = [0.86, 0.84, 0.78];
      tube(bark, [0, -0.2, 0], [lean, h, 0], 0.16, 0.06, 6, tk);
      for (let i = 0; i < 5; i++) { const y = lerp(0.25, 0.9) * h; tube(bark, [lean * y / h, y, 0], [lean * y / h + Math.cos(i * 2.4) * 0.05, y + 0.02, Math.sin(i * 2.4) * 0.05], 0.17, 0.17, 6, [0.14, 0.13, 0.12]); }
      for (let i = 0; i < 5; i++) { const a = i * 2.4 + r(), y = h * lerp(0.55, 0.95), len = lerp(0.9, 1.6); foliage(leaf, lean + Math.cos(a) * len, y, Math.sin(a) * len, lerp(0.9, 1.3), lerp(1.1, 1.6), lerp(0.9, 1.3), greens.birch[0], greens.birch[1], seed * 11 + i, 8, 5); }
      foliage(leaf, lean, h + 0.6, 0, 1.2, 1.4, 1.2, greens.birch[0], greens.birch[1], seed * 3, 8, 5);
      break;
    }
    case 'pine': {
      const h = lerp(7, 10), tk: Tint = [0.28, 0.2, 0.15];
      tube(bark, [0, -.2, 0], [.09,h*.5,0], .34,.17,14,tk);
      tube(bark, [.09,h*.5,0], [-.07,h,0], .17,.015,12,tk);
      // Individually swept needle boughs replace opaque conical tiers. Their broken ends
      // let the sky through and stay readable against the darker inner crown.
      const tiers = DETAIL ? 6 : 9;
      for (let i=0;i<tiers;i++) {
        const t=i/(tiers-1), y=h*(.27+.7*t), radius=(1-t)*2.3+.18;
        const count=DETAIL?5:7;
        for(let k=0;k<count;k++) {
          const a=k/count*Math.PI*2+i*1.91+r()*.35, len=radius*lerp(.8,1.1);
          const tip: V=[Math.cos(a)*len,y-.25+ t*.5,Math.sin(a)*len];
          tube(bark,[.05,y,0],tip,.07*(1-t)+.009,.005,7,tk);
          for(let spray=0;spray<(DETAIL?2:4);spray++) {
            const u=.28+spray/(DETAIL?2:4)*.75, c: V=[tip[0]*u,y+(tip[1]-y)*u,tip[2]*u];
            const radial: V=[Math.cos(a),.2,Math.sin(a)], across: V=[-Math.sin(a),.5,Math.cos(a)];
            const w=(.44+.6*(1-t))*(.7+r()*.3), l=(.38+.48*(1-t));
            const p=(x:number,z:number):V=>[c[0]+radial[0]*x*l+across[0]*z*w,c[1]+radial[1]*x*l+across[1]*z*w,c[2]+radial[2]*x*l+across[2]*z*w];
            const uv=leaf.uvs.length; leaf.quad(p(-1,-1),p(1,-1),p(1,1),p(-1,1),[.9,.96,.92],1,{normal:norm([tip[0]*.15,1,tip[2]*.15])});
            leaf.uvs.splice(uv,8,0,1,1,1,1,0,0,0);
          }
        }
      }
      break;
    }
    case 'bush': case 'berry': {
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) foliage(leaf, Math.cos(i * 2.1) * 0.5, lerp(0.35, 0.6), Math.sin(i * 2.1) * 0.5, lerp(0.55, 0.85), lerp(0.4, 0.62), lerp(0.55, 0.85), greens[species][0], greens[species][1], seed * 19 + i, 7, 5);
      if (species === 'berry') for (let i = 0; i < 9; i++) { const a = r() * 6.28, rr = lerp(0.3, 0.75); blobGradient(bark, Math.cos(a) * rr, lerp(0.35, 0.8), Math.sin(a) * rr, 0.04, 0.04, 0.04, [0.55, 0.08, 0.16], [0.8, 0.15, 0.25], seed + i, 7, 4, 0); }
      break;
    }
    case 'sapling': {
      const h = lerp(1.2, 2); tube(bark, [0, -0.1, 0], [0, h, 0], 0.05, 0.025, 5, [0.36, 0.26, 0.18]);
      for (let i = 0; i < 3; i++) foliage(leaf, Math.cos(i * 2.1) * 0.3, h * (0.55 + i * 0.2), Math.sin(i * 2.1) * 0.3, 0.42, 0.34, 0.42, greens.sapling[0], greens.sapling[1], seed * 7 + i, 7, 4);
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
    // Scans carry their own base colour. The earlier colour-only asset palette must not
    // multiply brown bark and grey stone a second time into near-black reflectance.
    for (let i=0;i<bark.colors.length;i+=4) {
      const tone=.76+.24*Math.max(bark.colors[i],bark.colors[i+1],bark.colors[i+2]);
      bark.colors[i]=bark.colors[i+1]=bark.colors[i+2]=tone;
    }
    const barkMat: Material = this.mats.get(species === 'rock' ? 'rock' : 'bark'), leafMat: Material = this.mats.get(species === 'pine' ? 'leafDark' : 'leaf');
    const bm = bark.linearize().build(`veg-${key}-bark`, this.scene, barkMat, { receiveShadow: true }); if (bm) meshes.push(bm);
    const lm = leaf.linearize().build(`veg-${key}-leaf`, this.scene, leafMat, { receiveShadow: true }); if (lm) meshes.push(lm);
    m = meshes.length > 1 ? Mesh.MergeMeshes(meshes, true, true, undefined, false, true)! : meshes[0];
    m.sideOrientation = Material.CounterClockWiseSideOrientation;
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
/** How much of the camera's way a plant or rock takes: trunk radius and height above the base, at scale 1. */
const OBSTACLE: Partial<Record<Species, { r: number; h: number }>> = {
  oak: { r: 0.38, h: 6 }, birch: { r: 0.22, h: 6 }, pine: { r: 0.3, h: 7 }, bush: { r: 0.85, h: 1.2 }, berry: { r: 0.7, h: 1.1 }, rock: { r: 0.8, h: 1.0 }, stump: { r: 0.35, h: 0.6 },
};
/** Bucket size (m) of the obstacle lookup used to keep the camera from sitting inside a trunk, bush or rock. */
const OBSTACLE_CELL = 4;
export class InstanceSet {
  readonly hosts: Mesh[] = [];
  /** Solid-ish things the camera must not enter, in region-local coordinates, bucketed by ground cell. */
  private readonly obstacles: { x: number; y: number; z: number; r: number; h: number }[] = [];
  private readonly obstacleGrid = new Map<number, number[]>();
  /** True if the region-local point is inside a trunk, bush or rock. */
  obstructs(lx: number, ly: number, lz: number): boolean {
    if (!this.obstacles.length) return false;
    const cx = Math.floor(lx / OBSTACLE_CELL), cz = Math.floor(lz / OBSTACLE_CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = this.obstacleGrid.get((cx + dx) * 4099 + (cz + dz)); if (!list) continue;
      for (const i of list) { const o = this.obstacles[i]; if (ly < o.y - 0.1 || ly > o.y + o.h) continue; const ex = lx - o.x, ez = lz - o.z; if (ex * ex + ez * ez < o.r * o.r) return true; }
    }
    return false;
  }
  private readonly groups = new Map<string, Group>();
  count = 0;
  add(_lib: VegetationLibrary, species: Species, variant: number, pos: Vector3, yaw: number, scale: number): void {
    const key = `${species}:${variant % VARIANTS}`;
    let g = this.groups.get(key); if (!g) this.groups.set(key, g = { species, variant: variant % VARIANTS, matrices: [], positions: [], near: null, far: null, nearBuf: new Float32Array(0), farBuf: new Float32Array(0) });
    const ob = OBSTACLE[species];
    if (ob) {
      const idx = this.obstacles.length; this.obstacles.push({ x: pos.x, y: pos.y, z: pos.z, r: ob.r * scale, h: ob.h * scale });
      const key = Math.floor(pos.x / OBSTACLE_CELL) * 4099 + Math.floor(pos.z / OBSTACLE_CELL); const cell = this.obstacleGrid.get(key); if (cell) cell.push(idx); else this.obstacleGrid.set(key, [idx]);
    }
    const m = Matrix.Compose(new Vector3(scale, scale, scale), Quaternion.RotationAxis(Vector3.Up(), yaw), pos);
    g.matrices.push(...m.toArray()); g.positions.push(pos.x, pos.z); this.count++;
  }
  finish(lib: VegetationLibrary, parent: import('@babylonjs/core').TransformNode, name: string, castShadow: (m: Mesh) => void): void {
    for (const _ of this.finishSteps(lib, parent, name, castShadow)) void _;
  }
  /** The same work as `finish`, one host mesh per step, so streaming can spread it over frames. */
  *finishSteps(lib: VegetationLibrary, parent: import('@babylonjs/core').TransformNode, name: string, castShadow: (m: Mesh) => void): Generator<void, void, void> {
    for (const [key, g] of this.groups) {
      const n = g.positions.length / 2;
      for (const lod of [0, 1]) {
        const host = lib.get(g.species, g.variant, lod).clone(`${name}-${key}-${lod}`, parent);
        host.makeGeometryUnique(); host.isPickable = false; host.alwaysSelectAsActiveMesh = true; host.setEnabled(false);
        const buf = new Float32Array(n * 16);
        host.thinInstanceSetBuffer('matrix', buf, 16, false); host.thinInstanceCount = 0;
        if (lod === 0) { g.near = host; g.nearBuf = buf; castShadow(host); } else { g.far = host; g.farBuf = buf; }
        this.hosts.push(host);
        yield;
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
    const settlement = region.settlements.some(s => x >= s.bounds.x0 && x <= s.bounds.x1 && z >= s.bounds.z0 && z <= s.bounds.z1);
    const grove = worldNoise(x,z,38,137), f = g.forest[k];
    // Clearings and groves have different canopy density. A few small garden trees
    // occupy unused settlement grass; exact buildings, work areas and routes stay clear.
    const p = Math.max(0, Math.min(1, (f - 0.32) / 0.5)) * density * (settlement ? .045 : .32 + grove*.94);
    if (roll > p) { // open ground: the occasional bush or rock
      if (f > 0.2 && roll2 < (settlement ? .10 : .075) * density && !excluded(x, z) && !nearRoad(x, z, 3) && !nearPath(x, z, 2) && !nearCanonical(x,z)) { inst.add(lib, roll3 < 0.85 ? 'bush' : 'rock', Math.floor(roll * 97), new Vector3(x - x0, terrain.heightAt(x, z) - 0.05, z - z0), roll3 * 6.28, .45 + roll3*.55); placed++; }
      continue;
    }
    if (excluded(x, z) || nearRoad(x, z, 5) || nearPath(x, z, 2) || nearCanonical(x, z)) continue;
    const n = worldNoise(x, z, 150, 21), species: Species = settlement ? (roll3 < .65 ? 'birch' : 'oak') : n < 0.38 ? 'oak' : n < 0.62 ? (roll3 < 0.55 ? 'birch' : 'oak') : n < 0.8 ? (roll3 < 0.5 ? 'pine' : 'birch') : 'pine';
    inst.add(lib, species, Math.floor(roll2 * 97), new Vector3(x - x0, terrain.heightAt(x, z) - 0.1, z - z0), roll3 * 6.28, settlement ? .6+roll2*.32 : .64 + roll2 * .95); placed++;
    if (roll3 < 0.55) {
      const a = roll * 6.28, sx=x+Math.cos(a)*2.4, sz=z+Math.sin(a)*2.4;
      const si=Math.max(0,Math.min(g.n-1,Math.round((sx-g.x0)/g.stride))), sj=Math.max(0,Math.min(g.n-1,Math.round((sz-g.z0)/g.stride))), sk=si*g.n+sj;
      if (sx>=x0 && sx<x0+size && sz>=z0 && sz<z0+size && g.water[sk]<0 && g.block[sk]===1 && !excluded(sx,sz) && !nearRoad(sx,sz,3) && !nearPath(sx,sz,2) && !nearCanonical(sx,sz)) {
        inst.add(lib, roll2<.25?'sapling':'bush', Math.floor(roll3*97), new Vector3(sx-x0,terrain.heightAt(sx,sz)-.05,sz-z0),a,.55+roll2*.65); placed++;
      }
    }
  }
  return placed;
}
