import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, StandardMaterial, VertexBuffer } from '@babylonjs/core';
import { B } from '../src/sim/physical/blocks';
import { buildMillWheel, Cells, findMillWheel } from '../src/web/world/structures';
import { MeshBatch } from '../src/web/world/meshBatch';
import type { PlaceProjection } from '../src/web/net/messages';

function mill(bounds: { x0: number; x1: number; z0: number; z1: number }): PlaceProjection {
  return {
    id: 'mill-test', type: 'mill', bounds: { ...bounds, y0: 1, y1: 8 },
    inside: { x: bounds.x0 + 1, y: 2, z: bounds.z0 + 1 },
    door: { x: bounds.x0 + 1, y: 1, z: bounds.z0 }, indoor: true,
    visualSeed: 7, wallHeight: 5, family: 'production',
  };
}

function canonicalWheelCells(cells: Cells, p: PlaceProjection, side: 'west' | 'east', complete = true): Set<string> {
  const { x0, x1, z0, z1 } = p.bounds;
  const x = side === 'west' ? x0 - 2 : x1 + 2;
  const y = p.bounds.y0 + 2;
  const z = Math.floor((z0 + z1) / 2);
  for(let i=0;i<3;i++) cells.set(x+i*(side==='west'?1:-1), y, z, B.Log);
  const ring = new Set<string>();
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const ry = y + Math.round(Math.sin(a) * 3.2);
    const rz = z + Math.round(Math.cos(a) * 3.2);
    if (complete || i < 13) {
      cells.set(x, ry, rz, B.DarkPlanks);
      ring.add(`${x},${ry},${rz}`);
    }
  }
  return ring;
}

function materialStub(scene: Scene): any {
  const mat = new StandardMaterial('mill-wheel', scene);
  return { tilesPerMetre: () => 1, get: () => mat };
}

function meshFor(side: 'west' | 'east') {
  const scene = new Scene(new NullEngine());
  const p = mill({ x0: 10, x1: 15, z0: 20, z1: 25 });
  const cells = new Cells(0, 0);
  canonicalWheelCells(cells, p, side);
  const wheel = findMillWheel(cells, p);
  expect(wheel).not.toBeNull();
  const batch = new MeshBatch();
  buildMillWheel(() => batch, materialStub(scene), wheel!, 0, 0);
  const mesh = batch.build(`wheel-${side}`, scene, new StandardMaterial(`wheel-${side}-mat`, scene));
  expect(mesh).not.toBeNull();
  return { cells, p, wheel: wheel!, mesh: mesh! };
}

describe('canonical mill wheel landmarks', () => {
  it.each(['west', 'east'] as const)('recognizes the complete %s ring only with its canonical axle', side => {
    const { wheel, p } = meshFor(side);
    expect(wheel.cells.size).toBe(16);
    expect(wheel.radius).toBeCloseTo(3.25);
    expect(wheel.x).toBe(side === 'west' ? p.bounds.x0 - 1.5 : p.bounds.x1 + 2.5);
  });

  it('does not collect adjacent dark planks or recognize an orphan ring', () => {
    const p = mill({ x0: 10, x1: 15, z0: 20, z1: 25 });
    const cells = new Cells(0, 0);
    const ring = canonicalWheelCells(cells, p, 'west');
    cells.set(8, 8, 20, B.DarkPlanks);
    cells.set(9, 3, 25, B.DarkPlanks);
    const found = findMillWheel(cells, p)!;
    expect(found.cells).toEqual(ring);

    const orphan = new Cells(0, 0);
    canonicalWheelCells(orphan, p, 'east');
    orphan.set(p.bounds.x1 + 2, p.bounds.y0 + 2, Math.floor((p.bounds.z0 + p.bounds.z1) / 2), B.Air);
    expect(findMillWheel(orphan, p)).toBeNull();
  });

  it('recognizes the recorded lower axle and buried ring, but not missing exposed planks',()=>{
    const p=mill({x0:10,x1:15,z0:20,z1:30});p.bounds.y0=24;
    const cells=new Cells(0,0),x=8,cy=25,cz=25;
    for(let i=0;i<3;i++)cells.set(x+i,cy,cz,B.Log);
    for(let i=0;i<16;i++) {const a=i*Math.PI/8,y=cy+Math.round(Math.sin(a)*3.2),z=cz+Math.round(Math.cos(a)*3.2);if(y>=23)cells.set(x,y,z,B.DarkPlanks);}
    expect(findMillWheel(cells,p)?.cells.size).toBe(13);
    cells.set(x,28,cz,B.Air);
    expect(findMillWheel(cells,p)).toBeNull();
  });

  it.each(['west', 'east'] as const)('emits finite, non-degenerate closed geometry for the %s wheel', side => {
    const { mesh } = meshFor(side);
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
    const indices = mesh.getIndices()!;
    expect(positions.length).toBeGreaterThan(0);
    expect(indices.length % 3).toBe(0);
    for (const value of [...positions, ...normals]) expect(Number.isFinite(value)).toBe(true);
    for (let i = 0; i < indices.length; i += 3) {
      const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;
      const ux = positions[ib] - positions[ia], uy = positions[ib + 1] - positions[ia + 1], uz = positions[ib + 2] - positions[ia + 2];
      const vx = positions[ic] - positions[ia], vy = positions[ic + 1] - positions[ia + 1], vz = positions[ic + 2] - positions[ia + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      expect(Math.hypot(nx, ny, nz)).toBeGreaterThan(1e-6);
      const ni = ia;
      expect(nx * normals[ni] + ny * normals[ni + 1] + nz * normals[ni + 2]).toBeGreaterThan(0);
    }
  });
});
