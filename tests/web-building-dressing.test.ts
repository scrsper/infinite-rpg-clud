import { NullEngine, Scene, StandardMaterial, VertexBuffer } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';
import type { PlaceProjection } from '../src/web/net/messages';
import { buildBuildingDressing } from '../src/web/world/buildingDressing';

const place: PlaceProjection = {
  id: 'bakery-dressing', type: 'bakery', bounds: { x0: 10, z0: 10, x1: 14, z1: 14, y0: 2, y1: 10 },
  inside: { x: 12, y: 2, z: 12 }, door: { x: 12, y: 2, z: 9 }, indoor: true,
  visualSeed: 4, wallHeight: 4, family: 'shop',
};
function mats(scene: Scene): any { const m = new StandardMaterial('props', scene); return { get: () => m, tilesPerMetre: () => 1 }; }

describe('building dressing footprint grounding', () => {
  it('keeps every emitted dressing vertex outside the complete building footprint', () => {
    const scene = new Scene(new NullEngine());
    const meshes = buildBuildingDressing(scene, mats(scene), place, null, { regionX0: 0, regionZ0: 0, heightAt: () => 0 });
    expect(meshes).toHaveLength(1);
    const p = meshes[0].getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < p.length; i += 3) expect(p[i] < place.bounds.x0 || p[i] > place.bounds.x1+1 || p[i + 2] < place.bounds.z0 || p[i + 2] > place.bounds.z1+1).toBe(true);
  });

  it('rejects an arrangement when its swept footprint crosses a steep slope', () => {
    const scene = new Scene(new NullEngine());
    const meshes = buildBuildingDressing(scene, mats(scene), place, null, { regionX0: 0, regionZ0: 0, heightAt: (x, z) => x + z });
    expect(meshes).toEqual([]);
  });
});
