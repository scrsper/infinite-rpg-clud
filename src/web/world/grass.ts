import { Matrix, Mesh, PBRMaterial, Quaternion, Scene, Vector3, VertexData, Color3 } from '@babylonjs/core';
import { hash2, worldNoise } from '../render/noise';
import type { RegionManager } from './regionManager';

/**
 * Grass tufts around the camera: thin instances of a small five-blade tuft, re-scattered as the camera
 * moves. Placement is deterministic per world cell (the same field of grass every time you stand
 * in the same spot) and only over open grass: never on paths, roads, water, farmland, structures or
 * through canonical props. Purely presentational: nothing here is saved or sent.
 */
export class GrassField {
  private readonly host: Mesh;
  private mat!: PBRMaterial;
  private readonly cap: number;
  private readonly matrices: Float32Array;
  private readonly colors: Float32Array;
  private last = { x: 1e9, z: 1e9 };
  count = 0;
  radius: number;
  constructor(scene: Scene, private readonly regions: RegionManager, opts: { radius: number; capacity: number }) {
    this.radius = opts.radius; this.cap = opts.capacity;
    this.matrices = new Float32Array(this.cap * 16); this.colors = new Float32Array(this.cap * 4);
    const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
    // Five blades: each a tapered triangle leaning outward, dark at the root and bright at the tip.
    for (let b = 0; b < 7; b++) {
      const a = b / 7 * Math.PI * 2 + 0.3 * b, lean = 0.16 + 0.12 * (b % 2), h = 0.22 + 0.10 * ((b * 7) % 3), w = 0.030 + 0.008 * (b % 2);
      const cx = Math.cos(a), cz = Math.sin(a), px = -cz, pz = cx, base = pos.length / 3;
      const r = 0.035;
      pos.push(cx * r - px * w, 0, cz * r - pz * w, cx * r + px * w, 0, cz * r + pz * w, cx * (r + lean * h) + px * 0.002, h, cz * (r + lean * h) + pz * 0.002);
      for (let k = 0; k < 3; k++) nrm.push(cx * 0.3, 0.9, cz * 0.3);
      col.push(0.32, 0.32, 0.32, 1, 0.32, 0.32, 0.32, 1, 1.0, 1.0, 1.0, 1);
      idx.push(base, base + 1, base + 2);
    }
    this.host = new Mesh('grass', scene);
    const vd = new VertexData(); vd.positions = pos; vd.normals = nrm; vd.colors = col; vd.indices = idx; vd.applyToMesh(this.host);
    const m = new PBRMaterial('grass-mat', scene);
    m.albedoColor = Color3.White(); m.roughness = 0.85; m.metallic = 0; m.backFaceCulling = false; m.twoSidedLighting = true; m.environmentIntensity = 0.5; m.maxSimultaneousLights = 4;
    this.mat = m;
    this.host.material = m; this.host.isPickable = false; this.host.alwaysSelectAsActiveMesh = true; this.host.receiveShadows = true; this.host.setEnabled(false);
    this.host.thinInstanceSetBuffer('matrix', this.matrices, 16, false); this.host.thinInstanceSetBuffer('color', this.colors, 4, false); this.host.thinInstanceCount = 0;
  }

  /** The blades' own colours are light; at full white albedo daylight blows them out to white. Scale them to a natural green by day, and dimmer still under moonlight (where they otherwise glow violet against the dark ground). */
  tint(daylight: number): void { const k = Math.max(0, Math.min(1, daylight)); this.mat.albedoColor.set(0.14 + 0.08 * k, 0.24 + 0.18 * k, 0.14 + 0.06 * k); }
  /** Scatter around `cam` (simulation coordinates). Cheap enough to run whenever the camera has moved a few metres. */
  update(camX: number, camZ: number, force = false): void {
    if (!force && Math.hypot(camX - this.last.x, camZ - this.last.z) < 3.5) return;
    this.last.x = camX; this.last.z = camZ;
    const R = this.radius, step = 0.30, x0 = Math.floor((camX - R) / step), x1 = Math.floor((camX + R) / step), z0 = Math.floor((camZ - R) / step), z1 = Math.floor((camZ + R) / step);
    const o = this.regions.origin; let n = 0;
    const q = new Quaternion(), s = new Vector3(), p = new Vector3(), m = new Matrix();
    for (let ix = x0; ix <= x1 && n < this.cap; ix++) for (let iz = z0; iz <= z1 && n < this.cap; iz++) {
      const jx = hash2(ix, iz, 71), jz = hash2(ix, iz, 73), x = (ix + jx) * step, z = (iz + jz) * step;
      const dx = x - camX, dz = z - camZ, d = Math.hypot(dx, dz); if (d > R) continue;
      // Thin out toward the edge with a dithered fade so the field has no visible rim.
      const fade = 1 - Math.pow(d / R, 2.4); if (hash2(ix, iz, 79) > fade * 0.98) continue;
      const g = this.regions.grassAt(x, z); if (!g) continue;
      const sc = (0.75 + hash2(ix, iz, 83) * 0.7) * (0.35 + 0.65 * fade) * g.height;
      const macro = worldNoise(x, z, 60, 3), tone = 0.8 + hash2(ix, iz, 89) * 0.35;
      const warm = macro, r = (0.30 + 0.30 * warm) * tone, gr = (0.52 + 0.08 * (1 - warm)) * tone, b = (0.26 + 0.05 * (1 - warm)) * tone;
      Quaternion.RotationAxisToRef(Vector3.Up(), hash2(ix, iz, 97) * 6.283, q); s.set(sc, sc * (0.8 + hash2(ix, iz, 101) * 0.6), sc); p.set(x - o.x, g.y - o.y - 0.02, z - o.z);
      Matrix.ComposeToRef(s, q, p, m); m.copyToArray(this.matrices, n * 16);
      this.colors[n * 4] = Math.pow(r, 2.2); this.colors[n * 4 + 1] = Math.pow(gr, 2.2); this.colors[n * 4 + 2] = Math.pow(b, 2.2); this.colors[n * 4 + 3] = 1; n++;
    }
    this.count = n; this.host.thinInstanceCount = n; this.host.setEnabled(n > 0);
    this.host.thinInstanceBufferUpdated('matrix'); this.host.thinInstanceBufferUpdated('color');
  }
  /** The scene origin moved: positions were built against the old one, so rebuild on the next update. */
  invalidate(): void { this.last.x = 1e9; }
  dispose(): void { this.host.dispose(); }
}
