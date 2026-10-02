import { PBRMaterial, Scene, type Mesh } from '@babylonjs/core';
import type { MaterialLibrary } from '../render/materials';
import { worldNoise } from '../render/noise';
import type { RegionProjection } from '../net/messages';
import { MeshBatch, type V } from './meshBatch';

/** A single coverage layer over projected routes, with no overlapping cell decals. */
export function buildPaths(scene: Scene, mats: MaterialLibrary, region: RegionProjection, heightAt?: (x: number, z: number) => number): Mesh | null {
  const cells = new Map(region.paths.map(([x, y, z]) => [`${x},${z}`, y]));
  const tiles = new Set<string>();
  for (const [x, , z] of region.paths) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) tiles.add(`${x + dx},${z + dz}`);
  const cache = new Map<string, { p: V; alpha: number; tint: V }>();
  const sample = (x: number, z: number) => {
    const key = `${x},${z}`, existing = cache.get(key); if (existing) return existing;
    let distance = Infinity, routeY = 0;
    for (let cx = Math.floor(x) - 1; cx <= Math.floor(x) + 1; cx++) for (let cz = Math.floor(z) - 1; cz <= Math.floor(z) + 1; cz++) {
      const y = cells.get(`${cx},${cz}`); if (y === undefined) continue;
      const px = cx + .5, pz = cz + .5, d = Math.hypot(x - px, z - pz);
      if (d < distance) { distance = d; routeY = y; }
      // Join only touching canonical cells. The rounded material boundary follows
      // their centreline, removing the staircase at diagonal bends.
      for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const nextY = cells.get(`${cx + dx},${cz + dz}`); if (nextY === undefined) continue;
        const t = Math.max(0, Math.min(1, ((x - px) * dx + (z - pz) * dz) / (dx * dx + dz * dz)));
        const sd = Math.hypot(x - px - t * dx, z - pz - t * dz);
        if (sd < distance) { distance = sd; routeY = y + (nextY - y) * t; }
      }
    }
    const width = .82 + worldNoise(x, z, 2.8, 113) * .2;
    const fade = Math.max(0, Math.min(1, (distance - .22) / (width - .22)));
    const alpha = 1 - fade * fade * (3 - 2 * fade);
    const ground = heightAt?.(x, z) ?? routeY;
    const y = ground + (routeY - ground) * alpha;
    const tone = .9 + worldNoise(x, z, 4, 41) * .12;
    const value = { p: [x - region.bounds.x0, y + .035, z - region.bounds.z0] as V, alpha, tint: [tone * .92, tone * .86, tone * .73] as V };
    cache.set(key, value); return value;
  };
  const batch = new MeshBatch();
  for (const key of tiles) {
    const [x, z] = key.split(',').map(Number);
    if (x < region.bounds.x0 || x >= region.bounds.x1 || z < region.bounds.z0 || z >= region.bounds.z1) continue;
    for (let dx = 0; dx < 1; dx += .5) for (let dz = 0; dz < 1; dz += .5) {
      const q = [sample(x + dx, z + dz + .5), sample(x + dx + .5, z + dz + .5), sample(x + dx + .5, z + dz), sample(x + dx, z + dz)];
      if (q.every(v => v.alpha === 0)) continue;
      const start = batch.colors.length;
      batch.quad(q[0].p, q[1].p, q[2].p, q[3].p, q.map(v => v.tint), mats.tilesPerMetre('path'), { normal: [0, 1, 0] });
      q.forEach((v, i) => { batch.colors[start + i * 4 + 3] = v.alpha; });
    }
  }
  if (batch.empty) return null;
  const material = mats.get('path').clone(`path-blend-${region.id}`)!;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.disableDepthWrite = true;
  const mesh = batch.build(`paths-${region.id}`, scene, material, { receiveShadow: true })!;
  mesh.hasVertexAlpha = true;
  mesh.onDisposeObservable.add(() => material.dispose(false, false));
  return mesh;
}
