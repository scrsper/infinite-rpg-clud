import { Mesh, Scene } from '@babylonjs/core';
import { B } from '../../sim/physical/blocks';
import type { RegionProjection } from '../net/messages';
import type { MaterialLibrary } from '../render/materials';
import { MeshBatch, type V } from './meshBatch';

/** A projected surface cell. Coordinates are world-space; no simulation state is stored here. */
export interface FieldSurfaceCell { x: number; z: number; block: number }

const key = (x: number, z: number): string => `${x},${z}`;

/**
 * Draws low, connected furrows over contiguous projected farmland cells.
 *
 * Crop geometry and state belong to RegionDynamics. This module only accents cells that the
 * caller has already projected as B.Farmland, and never creates collision or navigation data.
 * Rows are globally Z-aligned to match the crop proto, while each segment follows terrain height
 * independently so gaps and slopes cannot create invented farmland between projected cells.
 */
export function buildFieldSurface(
  scene: Scene,
  mats: MaterialLibrary,
  region: Pick<RegionProjection, 'id' | 'bounds'>,
  cells: Iterable<FieldSurfaceCell>,
  heightAt: (x: number, z: number) => number,
): Mesh | null {
  const farmland = new Map<string, FieldSurfaceCell>();
  for (const cell of cells) if (cell.block === B.Farmland) farmland.set(key(cell.x, cell.z), cell);
  if (!farmland.size) return null;

  const batch = new MeshBatch();
  const tint: V = [.38, .29, .2];
  const tpm = mats.tilesPerMetre('farmland');
  // Crop geometry uses globally Z-aligned rows. Emit one short segment per exact
  // unit cell so sloped terrain follows heightAt instead of interpolating across gaps.
  for (const cell of farmland.values()) {
    if (!farmland.has(key(cell.x, cell.z - 1)) && !farmland.has(key(cell.x, cell.z + 1))) continue;
    addCell(batch, cell.x, cell.z, heightAt, tint, tpm);
  }
  const mesh = batch.build(`field-surface-${region.id}`, scene, mats.get('farmland'), { receiveShadow: true });
  if (mesh) mesh.position.set(-region.bounds.x0, 0, -region.bounds.z0);
  return mesh;
}

function addCell(
  batch: MeshBatch,
  x: number,
  z: number,
  heightAt: (x: number, z: number) => number,
  tint: V,
  tpm: number,
): void {
  const start = z + .11, end = z + .89;
  // Two channels match the crop proto's fixed X rows while remaining subordinate
  // to the crop silhouettes and the shared farmland material.
  for (const xOffset of [.27, .73]) {
    const x0 = x + xOffset, z0 = start, x1 = x + xOffset, z1 = end;
    const y0 = heightAt(x0, z0) + .012, y1 = heightAt(x1, z1) + .012;
    const p0: V = [x0, y0, z0], p1: V = [x1, y1, z1];
    const nx = .035;
    batch.quad([p0[0] - nx, p0[1], p0[2]], [p1[0] - nx, p1[1], p1[2]], [p1[0] + nx, p1[1], p1[2]], [p0[0] + nx, p0[1], p0[2]], tint, tpm, { normal: [0, 1, 0] });
  }
}
