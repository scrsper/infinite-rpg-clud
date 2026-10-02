import { Mesh, Plane, Scene } from '@babylonjs/core';
import type { MaterialLibrary } from '../render/materials';
import type { PlaceProjection } from '../net/messages';
import { COLORS, PropBuilder } from './propGeometry';
import { MeshBatch } from './meshBatch';
import type { V } from './meshBatch';
import type { Cells } from './structures';

/** Inputs kept presentation-only; no dressing state is written back to the projection. */
export interface BuildingDressingContext {
  regionX0: number;
  regionZ0: number;
  heightAt: (x: number, z: number) => number;
  pathCells?: ReadonlySet<number>;
}

function horizontalLog(batch: MeshBatch, cx: number, cy: number, cz: number, length: number, radius: number, yaw: number, tint: V): void {
  const ax: V = [Math.cos(yaw), 0, Math.sin(yaw)], side: V = [-ax[2], 0, ax[0]], sides = 8;
  const p = (end: number, i: number): V => [cx + ax[0] * end * length * 0.5 + side[0] * Math.cos(i / sides * Math.PI * 2) * radius, cy + Math.sin(i / sides * Math.PI * 2) * radius, cz + ax[2] * end * length * 0.5 + side[2] * Math.cos(i / sides * Math.PI * 2) * radius];
  for (let i = 0; i < sides; i++) batch.quad(p(-1, i + 1), p(-1, i), p(1, i), p(1, i + 1), tint, 1, { normal: [side[0] * Math.cos((i + 0.5) / sides * Math.PI * 2), Math.sin((i + 0.5) / sides * Math.PI * 2), side[2] * Math.cos((i + 0.5) / sides * Math.PI * 2)] });
  const cap = (end: number, flip: boolean): void => { const pts: V[] = []; for (let i = 0; i < sides; i++) pts.push(p(end, i)); batch.polygon(flip ? pts : pts.slice().reverse(), flip ? ax : [-ax[0], 0, -ax[2]], tint, 1); };
  cap(-1, false); cap(1, true);
}

/**
 * Build a few semantic exterior arrangements for one projected building.
 * The returned meshes are region-local and can be parented by the caller. Every mesh owns
 * its cutaway material clone, matching structure meshes and making disposal straightforward.
 */
export function buildBuildingDressing(scene: Scene, mats: MaterialLibrary, place: PlaceProjection, cells: Cells | null, ctx: BuildingDressingContext): Mesh[] {
  if (!place.indoor) return [];
  const { x0, x1, z0, z1 } = place.bounds, ox = ctx.regionX0, oz = ctx.regionZ0;
  const batch = new MeshBatch();
  const local = (x: number, z: number): [number, number] => [x - ox, z - oz];
  const ground = (x: number, z: number): number => ctx.heightAt(x, z);
  const clearOfDoor = (x: number, z: number): boolean => {
    if (!place.door) return true;
    const dx = Math.abs(x - place.door.x), dz = Math.abs(z - place.door.z);
    return dx * dx + dz * dz >= 6.25 && !(dx < 2.5 && dz < 3.5);
  };
  const clearOfWall = (x: number, z: number): boolean => !cells || cells.get(Math.floor(x), place.bounds.y0 + 1, Math.floor(z)) === 0;
  const candidates: { x: number; z: number; side: 'north' | 'south' | 'west' | 'east' }[] = [
    { x: x0 - 0.65, z: z0 + 1.25, side: 'west' }, { x: x1 + 1.65, z: z1 - 1.25, side: 'east' },
    { x: x0 + 1.25, z: z0 - 0.65, side: 'north' }, { x: x1 - 1.25, z: z1 + 1.65, side: 'south' },
  ];
  const clearOfPath = (x: number, z: number): boolean => {
    if (!ctx.pathCells) return true;
    const cx = Math.floor(x), cz = Math.floor(z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (ctx.pathCells.has((cx + dx) * 100003 + cz + dz)) return false;
    return true;
  };
  const usable = (c: { x: number; z: number }): boolean => clearOfDoor(c.x, c.z) && clearOfWall(c.x, c.z) && clearOfPath(c.x, c.z);
  const addPlanter = (c: { x: number; z: number }): void => {
    const [lx, lz] = local(c.x, c.z), y = ground(c.x, c.z), b = new PropBuilder(batch, lx, y, lz, 0, 0.82);
    b.box(-0.42, 0, -0.28, 0.84, 0.28, 0.56, COLORS.darkOak);
    b.box(-0.34, 0.28, -0.22, 0.68, 0.12, 0.44, COLORS.darkOak);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + (place.visualSeed % 7) * 0.1;
      b.box(Math.cos(a) * 0.12 - 0.018, 0.38, Math.sin(a) * 0.12 - 0.018, 0.036, 0.28 + (i % 2) * 0.08, 0.036, COLORS.herb);
      b.blob(Math.cos(a) * 0.12, 0.66 + (i % 2) * 0.08, Math.sin(a) * 0.12, 0.08, 0.045, 0.08, i === 1 ? COLORS.red : COLORS.green, 6, 3);
    }
  };
  const addFirewood = (c: { x: number; z: number }): void => {
    const [lx, lz] = local(c.x, c.z), y = ground(c.x, c.z), yaw = (place.visualSeed % 2) * Math.PI * 0.5;
    for (let row = 0; row < 2; row++) for (let i = 0; i < 3 - row; i++) {
      const offset=(i-(2-row)*.5)*.13;
      horizontalLog(batch,lx+Math.cos(yaw)*offset,y+.062+row*.11,lz-Math.sin(yaw)*offset,.68,.065,yaw,COLORS.darkOak);
    }
  };
  const addEmblem = (c: { x: number; z: number }): void => {
    const [lx, lz] = local(c.x, c.z), y = ground(c.x, c.z), b = new PropBuilder(batch, lx, y, lz, 0, 0.78);
    b.box(-0.04, 0, -0.04, 0.08, 1.3, 0.08, COLORS.darkOak);
    const tint = place.type.toLowerCase().includes('chapel') ? COLORS.gold : place.type.toLowerCase().includes('bakery') ? COLORS.bread : COLORS.red;
    b.box(-0.42, 0.88, -0.035, 0.84, 0.42, 0.07, COLORS.oak);
    b.box(-0.08, 1.3, -0.04, 0.16, 0.06, 0.08, COLORS.darkOak);
    if (kind.includes('tavern')) { b.cyl(0, 1.04, -0.08, 0.11, 0.08, tint, 8); b.box(0.07, 1.07, -0.09, 0.05, 0.03, 0.16, tint); }
    else if (kind.includes('bakery')) b.blob(0, 1.1, -0.08, 0.2, 0.11, 0.04, tint, 8, 4);
    else { b.cyl(0, 1.1, -0.08, 0.12, 0.025, tint, 10); for (let i = 0; i < 4; i++) b.box(Math.cos(i * Math.PI * 0.5) * 0.16 - 0.02, 1.08, Math.sin(i * Math.PI * 0.5) * 0.16 - 0.02, 0.04, 0.04, 0.04, tint); }
  };
  const kind = place.type.toLowerCase();
  const emblem = kind.includes('tavern') || kind.includes('chapel') || kind.includes('bakery');
  const selected = candidates.filter(usable), slots: typeof candidates = [];
  const take = (): (typeof candidates)[number] | undefined => {
    const c = selected.find(s => !slots.includes(s)); if (c) slots.push(c); return c;
  };
  const planter = take(); if (planter) addPlanter(planter);
  const firewood = (place.visualSeed & 3) !== 0 ? take() : undefined; if (firewood) addFirewood(firewood);
  if (emblem) {
    const frontSide = place.door
      ? place.door.x <= x0 ? 'west' : place.door.x >= x1 ? 'east' : place.door.z <= z0 ? 'north' : 'south'
      : 'north';
    const front = selected.find(s => s.side === frontSide && !slots.includes(s)) ?? take();
    if (front) { if (!slots.includes(front)) slots.push(front); addEmblem(front); }
  }
  const mesh = batch.build(`building-dressing-${place.id}`, scene, mats.get('props'), { receiveShadow: true });
  if (!mesh) return [];
  const material = mesh.material!.clone(mesh.name + '-cutaway')!;
  material.clipPlane = new Plane(0, 1, 0, -1e8);
  mesh.material = material;
  mesh.metadata = { cutawayBounds: place.bounds, ownsCutawayMaterial: true };
  return [mesh];
}
