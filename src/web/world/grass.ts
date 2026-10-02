import { Material, Matrix, Mesh, PBRMaterial, Quaternion, Scene, Vector3, VertexData, Color3 } from '@babylonjs/core';
import { hash2, worldNoise } from '../render/noise';
import type { RegionManager } from './regionManager';
import { GrassWind } from './grassWind';

/**
 * Grass tufts around the camera: thin instances of a small nine-blade tuft, re-scattered as the camera
 * moves. Placement is deterministic per world cell (the same field of grass every time you stand
 * in the same spot) and only over open grass: never on paths, roads, water, farmland, structures or
 * through canonical props. Purely presentational: nothing here is saved or sent.
 */
export class GrassField {
  private readonly host: Mesh;
  private mat!: PBRMaterial;
  private readonly wind: GrassWind;
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
    // A small radial bouquet reads as a tuft at a distance and still has enough
    // silhouette variation up close. The profile is curved in four short sections
    // rather than being a single rigid triangle.
    for (let b = 0; b < 9; b++) {
      const a = b / 9 * Math.PI * 2 + 0.16 * (b % 3), lean = 0.2 + 0.09 * (b % 3), h = 0.17 + 0.035 * ((b * 3) % 5), w = 0.022 + 0.005 * (b % 3);
      const cx = Math.cos(a), cz = Math.sin(a), px = -cz, pz = cx, base = pos.length / 3;
      for (let row=0; row<=4; row++) {
        const t=row/4, r=.012+lean*h*Math.sin(t * Math.PI * 0.5), width=w*(1-t)+.00025, shade=.62+.36*t;
        for (const side of [-1,1]) { pos.push(cx*r+px*width*side, h*t,cz*r+pz*width*side); nrm.push(cx*.8,.6,cz*.8); col.push(shade,shade,shade,1); }
        if(row<4) { const j=base+row*2; idx.push(j,j+1,j+2,j+1,j+3,j+2); }
      }
    }
    this.host = new Mesh('grass', scene);
    const vd = new VertexData(); vd.positions = pos; vd.normals = nrm; vd.colors = col; vd.indices = idx; vd.applyToMesh(this.host);
    const m = new PBRMaterial('grass-mat', scene);
    m.albedoColor = Color3.White(); m.roughness = 0.94; m.specularIntensity = .12; m.metallic = 0; m.backFaceCulling = false; m.twoSidedLighting = true; m.environmentIntensity = 0.5; m.maxSimultaneousLights = 4;
    this.mat = m;
    this.wind = new GrassWind(m);
    this.host.material = m; this.host.isPickable = false; this.host.alwaysSelectAsActiveMesh = true; this.host.receiveShadows = true; this.host.setEnabled(false);
    this.host.thinInstanceSetBuffer('matrix', this.matrices, 16, false); this.host.thinInstanceSetBuffer('color', this.colors, 4, false); this.host.thinInstanceCount = 0;
  }

  /** Illumination follows the sky; material colour is already carried by the instances. */
  tint(_daylight: number): void { this.mat.albedoColor.set(.9, .96, .8); }
  /** Update the shared vertex breeze without touching deterministic instance transforms. */
  animate(dt: number, wind: number, reducedMotion = false): void { this.wind.setWind(dt, wind, reducedMotion); }
  /** Scatter around `cam` (simulation coordinates). Cheap enough to run whenever the camera has moved a few metres. */
  update(camX: number, camZ: number, force = false): void {
    if (!force && Math.hypot(camX - this.last.x, camZ - this.last.z) < 3.5) return;
    this.last.x = camX; this.last.z = camZ;
    const R = this.radius, step = 0.28, x0 = Math.floor((camX - R) / step), x1 = Math.floor((camX + R) / step), z0 = Math.floor((camZ - R) / step), z1 = Math.floor((camZ + R) / step);
    const o = this.regions.origin; let n = 0;
    const q = new Quaternion(), s = new Vector3(), p = new Vector3(), m = new Matrix();
    for (let ix = x0; ix <= x1 && n < this.cap; ix++) for (let iz = z0; iz <= z1 && n < this.cap; iz++) {
      const jx = hash2(ix, iz, 71), jz = hash2(ix, iz, 73), x = (ix + jx) * step, z = (iz + jz) * step;
      const dx = x - camX, dz = z - camZ, d = Math.hypot(dx, dz); if (d > R) continue;
      // Thin out toward the edge with a dithered fade so the field has no visible rim.
      const fade = 1 - Math.pow(d / R, 2.4); if (hash2(ix, iz, 79) > fade * 0.98) continue;
      const g = this.regions.grassAt(x, z); if (!g) continue;
      // Low-frequency noise creates coherent meadow patches, while the local
      // term keeps their edges soft instead of producing a checkerboard.
      const patch = worldNoise(x, z, 7.5, 211), local = worldNoise(x, z, 2.1, 223);
      const density = 0.24 + patch * 0.62 + local * 0.18;
      if (hash2(ix, iz, 227) > density) continue;
      const sc = (0.78 + hash2(ix, iz, 83) * 0.62) * (0.4 + 0.6 * fade) * (0.84 + patch * 0.28) * g.height;
      const macro = worldNoise(x, z, 60, 3), warm = patch * 0.7 + macro * 0.3, tone = 0.86 + hash2(ix, iz, 89) * 0.28;
      // Warm moss and sage variations keep the grass legible against the cool,
      // muddy ground without turning it into a saturated green carpet.
      const r = (0.36 + 0.08 * warm) * tone, gr = (0.43 + 0.09 * (1 - warm)) * tone, b = (0.25 + 0.06 * (1 - warm)) * tone;
      Quaternion.RotationAxisToRef(Vector3.Up(), hash2(ix, iz, 97) * 6.283, q); s.set(sc, sc * (0.8 + hash2(ix, iz, 101) * 0.6), sc); p.set(x - o.x, g.y - o.y - 0.02, z - o.z);
      Matrix.ComposeToRef(s, q, p, m); m.copyToArray(this.matrices, n * 16);
      this.colors[n * 4] = Math.pow(r, 2.2); this.colors[n * 4 + 1] = Math.pow(gr, 2.2); this.colors[n * 4 + 2] = Math.pow(b, 2.2); this.colors[n * 4 + 3] = 1; n++;
    }
    const wasEmpty = this.count === 0;
    this.count = n; this.host.thinInstanceCount = n; this.host.setEnabled(n > 0);
    // Readiness can compile the hidden, empty host before its first scatter. Crossing
    // zero changes INSTANCESCOLOR even though the vertex-buffer layout stays the same.
    if (wasEmpty !== (n === 0)) this.mat.markAsDirty(Material.AttributesDirtyFlag);
    this.host.thinInstanceBufferUpdated('matrix'); this.host.thinInstanceBufferUpdated('color');
  }
  /** The scene origin moved: positions were built against the old one, so rebuild on the next update. */
  invalidate(): void { this.last.x = 1e9; }
  dispose(): void { this.host.dispose(); }
}
