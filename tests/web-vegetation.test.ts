import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, StandardMaterial } from '@babylonjs/core';
import { VegetationLibrary } from '../src/web/world/vegetation';

function mats(scene: Scene): any {
  const cache = new Map<string, StandardMaterial>();
  return { get: (name: string) => { let m = cache.get(name); if (!m) { m = new StandardMaterial(`m-${name}`, scene); cache.set(name, m); } return m; } };
}

describe('woodland vegetation silhouettes', () => {
  it('builds reusable species assets within the bounded mesh budget', () => {
    const scene = new Scene(new NullEngine()); scene.useRightHandedSystem = true;
    const library = new VegetationLibrary(scene, mats(scene));
    const oak = library.get('oak', 1, 0), pine = library.get('pine', 1, 0);
    expect(oak.getTotalVertices()).toBeGreaterThan(200);
    expect(pine.getTotalVertices()).toBeGreaterThan(200);
    expect(oak.getTotalVertices()).toBeLessThan(5000);
    expect(pine.getTotalVertices()).toBeLessThan(5000);
    expect(oak.getBoundingInfo().boundingBox.extendSize.y).toBeGreaterThan(2);
    expect(pine.getBoundingInfo().boundingBox.extendSize.y).toBeGreaterThan(3);
    expect(library.get('oak', 1, 0)).toBe(oak); // stable prototype reuse for thin instances
  });
});
