import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, MeshBuilder, TransformNode } from '@babylonjs/core';
import { portraitCameraPlan, portraitCameraPlanFromBasis, portraitMeshes } from '../src/web/ui/portrait';

describe('Babylon character portrait framing', () => {
  it('places the camera in the actor forward hemisphere and frames a bust', () => {
    const p = portraitCameraPlan({ x: 10, y: 2, z: -4 }, 0, 1.66, 1.52);
    expect(p.position.x).toBeCloseTo(10, 0);
    expect(p.position.z).toBeLessThan(-4);
    expect(p.target.y).toBeCloseTo(3.3955, 3);
    expect(p.distance).toBeGreaterThan(1.4);
    expect(p.fov).toBeGreaterThan(0.5);
  });

  it('tracks simulation yaw rather than assuming every model faces one screen axis', () => {
    const north = portraitCameraPlan({ x: 0, y: 0, z: 0 }, 0, 1.66, 1.52);
    const east = portraitCameraPlan({ x: 0, y: 0, z: 0 }, Math.PI / 2, 1.66, 1.52);
    expect(north.position.z).toBeLessThan(-1);
    expect(Math.abs(east.position.x)).toBeGreaterThan(1);
    expect(Math.abs(east.position.z)).toBeLessThan(0.2);
  });

  it('keeps small and tall bodies within a readable camera range', () => {
    const child = portraitCameraPlan({ x: 0, y: 0, z: 0 }, 0, 1.22, 1.1);
    const adult = portraitCameraPlan({ x: 0, y: 0, z: 0 }, 0, 1.78, 1.64);
    expect(child.distance).toBeGreaterThanOrEqual(1.35);
    expect(adult.distance).toBeGreaterThan(child.distance);
    expect(child.target.y).toBeLessThan(adult.target.y);
  });

  it('collects meshes nested below the character model node', () => {
    const scene = new Scene(new NullEngine());
    const root = new TransformNode('root', scene), model = new TransformNode('model', scene);
    model.parent = root;
    const mesh = MeshBuilder.CreateBox('nested-body', { size: 1 }, scene); mesh.parent = model;
    expect(portraitMeshes(root)).toContain(mesh);
    scene.dispose();
  });

  it('uses the runtime world head point and node basis for framing', () => {
    const p = portraitCameraPlanFromBasis({ x: 4, y: 3, z: 8 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 1.66);
    expect(p.position.x).toBeGreaterThan(5);
    expect(p.position.z).toBeLessThan(8);
    expect(p.target.y).toBeCloseTo(2.8755, 3);
  });

  it('does not let model scale shorten the portrait camera distance', () => {
    const p = { x: 1, y: 2, z: 3 };
    const unit = portraitCameraPlanFromBasis(p, {x:0,y:0,z:-1}, {x:1,y:0,z:0}, 1.66);
    const scaled = portraitCameraPlanFromBasis(p, {x:0,y:0,z:-.7}, {x:.7,y:0,z:0}, 1.66);
    expect(scaled).toEqual(unit);
  });
});
