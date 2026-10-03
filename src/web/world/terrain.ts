import { Mesh, Scene, VertexData } from '@babylonjs/core';
import { B } from '../../sim/physical/blocks';
import type { MaterialLibrary } from '../render/materials';
import { clamp01, hash2, lerp, worldNoise } from '../render/noise';
import type { RegionProjection } from '../net/messages';

/**
 * A region's ground: a smooth heightfield over the projected surface columns (stride 8 m in the
 * wilderness, 2 m in settlements), tinted per vertex, plus a water sheet. It is presentation only:
 * the canonical surface is whatever `columns` say, and the mesh follows it exactly at every sample.
 */
export interface TerrainBuild {
  mesh: Mesh;
  water: Mesh | null;
  grid: { n: number; stride: number; x0: number; z0: number; top: Float32Array; block: Uint8Array; forest: Float32Array; water: Float32Array };
  heightAt(x: number, z: number): number;
}

type RGB = [number, number, number];
/** Painterly ground palette: muted, warm-cool broken colour rather than saturated voxel primaries. */
const GROUND: Record<number, RGB> = {
  [B.Grass]: [0.42, 0.56, 0.26], [B.Dirt]: [0.42, 0.32, 0.21], [B.Stone]: [0.46, 0.47, 0.47], [B.Cobble]: [0.5, 0.48, 0.45],
  [B.Sand]: [0.78, 0.71, 0.5], [B.Farmland]: [0.27, 0.19, 0.12], [B.Path]: [0.58, 0.48, 0.32], [B.Gravel]: [0.52, 0.5, 0.47],
  [B.Mud]: [0.3, 0.23, 0.16], [B.Snow]: [0.9, 0.93, 0.98],
};
const GRASS_WARM: RGB = [0.60, 0.60, 0.30], GRASS_COOL: RGB = [0.30, 0.52, 0.30], FOREST_FLOOR: RGB = [0.22, 0.36, 0.20];
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function buildTerrain(scene: Scene, mats: MaterialLibrary, r: RegionProjection): TerrainBuild {
  const { stride, columns } = r.terrain, x0 = r.bounds.x0, z0 = r.bounds.z0;
  const n = Math.round((r.bounds.x1 - x0) / stride) + 1;
  const top = new Float32Array(n * n), block = new Uint8Array(n * n), forest = new Float32Array(n * n), water = new Float32Array(n * n).fill(-1);
  for (const [x, z, t, b, w, f] of columns) {
    const i = Math.round((x - x0) / stride), j = Math.round((z - z0) / stride);
    if (i < 0 || j < 0 || i >= n || j >= n) continue;
    const k = i * n + j; top[k] = t; block[k] = b; forest[k] = f; water[k] = w;
  }
  const positions = new Float32Array(n * n * 3), normals = new Float32Array(n * n * 3), uvs = new Float32Array(n * n * 2), colors = new Float32Array(n * n * 4);
  const tpm = mats.tilesPerMetre('terrain');
  const h = (i: number, j: number) => top[Math.max(0, Math.min(n - 1, i)) * n + Math.max(0, Math.min(n - 1, j))];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = i * n + j, wx = x0 + i * stride, wz = z0 + j * stride;
    positions[k * 3] = i * stride; positions[k * 3 + 1] = top[k]; positions[k * 3 + 2] = j * stride;
    const dx = (h(i - 1, j) - h(i + 1, j)) / (2 * stride), dz = (h(i, j - 1) - h(i, j + 1)) / (2 * stride), l = Math.hypot(dx, 1, dz);
    normals[k * 3] = dx / l; normals[k * 3 + 1] = 1 / l; normals[k * 3 + 2] = dz / l;
    uvs[k * 2] = wx * tpm; uvs[k * 2 + 1] = wz * tpm;
    let col: RGB = GROUND[block[k]] ?? GROUND[B.Grass];
    if (block[k] === B.Grass) {
      const macro = worldNoise(wx, wz, 60, 3), patch = worldNoise(wx, wz, 11, 8);
      col = mix(mix(GRASS_COOL, GRASS_WARM, macro), col, 0.35);
      col = mix(col, FOREST_FLOOR, clamp01((forest[k] - 0.45) * 1.6));
      const j2 = (patch - 0.5) * 0.12; col = [col[0] + j2, col[1] + j2 * 1.2, col[2] + j2 * 0.4];
    }
    const grain = (hash2(wx, wz, 5) - 0.5) * 0.05;
    // Scanned ground already carries its albedo. Vertex colour supplies subtle biome variation,
    // rather than multiplying two fully shaded colours into near-black terrain.
    colors[k * 4] = .55 + clamp01(col[0] + grain)*.65; colors[k * 4 + 1] = .55 + clamp01(col[1] + grain)*.65; colors[k * 4 + 2] = .55 + clamp01(col[2] + grain)*.65;
    colors[k * 4 + 3] = block[k] === B.Grass ? (.94 - clamp01((forest[k] - .5)*1.4)*.28) * (.86 + .14*worldNoise(wx,wz,9,8)) : 0;
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) {
    const a = i * n + j, b = (i + 1) * n + j, c = (i + 1) * n + j + 1, d = i * n + j + 1;
    // Counter-clockwise seen from above (+Y) for the right-handed scene.
    idx.push(a, b, d, b, c, d);
  }
  const mesh = new Mesh(`terrain-${r.id}`, scene);
  const vd = new VertexData(); vd.positions = positions; vd.normals = normals; vd.uvs = uvs; vd.colors = colors; vd.indices = idx; vd.applyToMesh(mesh);
  mesh.hasVertexAlpha = false; // vertex alpha carries the grass/soil blend weight
  mesh.material = mats.get("terrain"); mesh.receiveShadows = true; mesh.isPickable = false;

  // Water: a flat quad per cell that has any wet corner, at the local surface level.
  const wp: number[] = [], wi: number[] = [], wu: number[] = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) {
    const ks = [i * n + j, (i + 1) * n + j, (i + 1) * n + j + 1, i * n + j + 1], levels = ks.map(k => water[k]).filter(v => v >= 0);
    if (!levels.length) continue;
    const y = Math.max(...levels), base = wp.length / 3;
    for (const [di, dj] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { wp.push((i + di) * stride, y, (j + dj) * stride); wu.push((x0 + (i + di) * stride) / 6, (z0 + (j + dj) * stride) / 6); }
    wi.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
  }
  let waterMesh: Mesh | null = null;
  if (wp.length) {
    waterMesh = new Mesh(`water-${r.id}`, scene);
    const wd = new VertexData(); wd.positions = wp; wd.indices = wi; wd.uvs = wu;
    const wn: number[] = []; for (let k = 0; k < wp.length / 3; k++) wn.push(0, 1, 0); wd.normals = wn; wd.applyToMesh(waterMesh);
    waterMesh.material = mats.get("water"); waterMesh.isPickable = false;
  }
  const heightAt = (x: number, z: number) => {
    const fx = Math.max(0, Math.min(n - 1.001, (x - x0) / stride)), fz = Math.max(0, Math.min(n - 1.001, (z - z0) / stride));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    return lerp(lerp(top[i * n + j], top[(i + 1) * n + j], tx), lerp(top[i * n + j + 1], top[(i + 1) * n + j + 1], tx), tz);
  };
  return { mesh, water: waterMesh, grid: { n, stride, x0, z0, top, block, forest, water }, heightAt };
}
