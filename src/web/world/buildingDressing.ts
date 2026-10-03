import { Mesh, Plane, Scene } from '@babylonjs/core';
import type { MaterialLibrary } from '../render/materials';
import type { PlaceProjection } from '../net/messages';
import { COLORS, PropBuilder, furnishing } from './propGeometry';
import { MeshBatch } from './meshBatch';
import type { Cells } from './structures';
import { architectureGrammar } from './architecturalGrammar';

/** Inputs kept presentation-only; no dressing state is written back to the projection. */
export interface BuildingDressingContext {
  regionX0: number;
  regionZ0: number;
  heightAt: (x: number, z: number) => number;
  pathCells?: ReadonlySet<number>;
}

/**
 * Build a few semantic exterior arrangements for one projected building.
 * The returned meshes are region-local and can be parented by the caller. Every mesh owns
 * its cutaway material clone, matching structure meshes and making disposal straightforward.
 */
export function buildBuildingDressing(scene: Scene, mats: MaterialLibrary, place: PlaceProjection, cells: Cells | null, ctx: BuildingDressingContext): Mesh[] {
  if (!place.indoor) return [];
  const { x0, x1, z0, z1 } = place.bounds, ox = ctx.regionX0, oz = ctx.regionZ0;
  const profile = architectureGrammar(place, null);
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
  // Frontage first; a candidate is accepted only after measuring the actual mesh.
  const frontSide = place.door ? [
    {side:'west',d:Math.abs(place.door.x-x0)}, {side:'east',d:Math.abs(place.door.x-(x1+1))},
    {side:'north',d:Math.abs(place.door.z-z0)}, {side:'south',d:Math.abs(place.door.z-(z1+1))},
  ].sort((a,b)=>a.d-b.d)[0].side : undefined;
  candidates.sort((a,b)=>Number(b.side===frontSide)-Number(a.side===frontSide));
  let accepted:MeshBatch|null=null;
  for(const slot of candidates) {
    const candidate=new MeshBatch(), yaw=slot.side==='west'||slot.side==='east'?Math.PI/2:0;
    const at=(u:number,v=0,scale=1):PropBuilder=>{
      const x=slot.x+Math.cos(yaw)*u+Math.sin(yaw)*v,z=slot.z-Math.sin(yaw)*u+Math.cos(yaw)*v;
      return new PropBuilder(candidate,x-ox,ground(x,z),z-oz,yaw,scale);
    };
    const tub=(b:PropBuilder):void=>{
      b.cyl(0,0,0,.22,.29,COLORS.oak,12,.27); b.cyl(0,.289,0,.235,.004,COLORS.darkOak,12);
      for(const y of [.035,.24])b.cyl(0,y,0,y<.1?.235:.269,.025,COLORS.iron,12);
    };
    if(place.type==='bakery') {
      furnishing('crate',at(-.38,0,.7),place.visualSeed);tub(at(.5,0,.82));
    } else if(profile.kind==='workshop') {
      const rack=at(-.35,0,.9);
      for(const u of [-.4,.34])rack.bevelBox(u,0,-.2,.06,1.15,.4,COLORS.darkOak);
      for(const y of [.08,.55,1.08])rack.bevelBox(-.4,y,-.2,.8,.06,.4,COLORS.oak);
      furnishing('crate',at(.57,0,.54),place.visualSeed);
    } else if(profile.kind==='tavern') {
      furnishing('bench',at(-.35,0,.9),place.visualSeed);furnishing('barrel',at(.62,0,.7),place.visualSeed);
    } else if(profile.kind==='civic') {
      furnishing('bench',at(-.4,0,.75),place.visualSeed);
      const b=at(.48,0,.7);b.bevelBox(-.24,0,-.22,.48,.28,.44,COLORS.darkOak);
      for(let i=0;i<3;i++){b.cyl((i-1)*.1,.28,0,.014,.26,COLORS.herb,5);b.blob((i-1)*.1,.56,0,.065,.04,.065,i===1?COLORS.red:COLORS.green,6,3);}
    } else if(profile.kind==='cottage'||profile.kind==='townhouse') {
      tub(at(-.37,0,.8));const stool=at(.38,0,.8);
      stool.bevelBox(-.23,.39,-.21,.46,.065,.42,COLORS.oak);
      for(const x of [-.17,.17])for(const z of [-.15,.15])stool.cyl(x,0,z,.025,.4,COLORS.darkOak,6);
    } else continue;
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(let i=0;i<candidate.positions.length;i+=3){minX=Math.min(minX,candidate.positions[i]+ox);maxX=Math.max(maxX,candidate.positions[i]+ox);minZ=Math.min(minZ,candidate.positions[i+2]+oz);maxZ=Math.max(maxZ,candidate.positions[i+2]+oz);}
    const samples:number[][]=[],nx=Math.ceil((maxX-minX)/.2),nz=Math.ceil((maxZ-minZ)/.2);
    for(let i=0;i<=nx;i++)for(let j=0;j<=nz;j++)samples.push([minX+(maxX-minX)*i/Math.max(1,nx),minZ+(maxZ-minZ)*j/Math.max(1,nz)]);
    const heights=samples.map(([x,z])=>ground(x,z));
    if(Math.max(...heights)-Math.min(...heights)>.14)continue;
    if(!samples.every(([x,z])=>(x<x0-.04||x>x1+1.04||z<z0-.04||z>z1+1.04)&&clearOfDoor(x,z)&&clearOfWall(x,z)&&clearOfPath(x,z)))continue;
    accepted=candidate;break;
  }
  if(!accepted)return [];
  const mesh = accepted.build(`building-dressing-${place.id}`, scene, mats.get('props'), { receiveShadow: true });
  if (!mesh) return [];
  const material = mesh.material!.clone(mesh.name + '-cutaway')!;
  material.clipPlane = new Plane(0, 1, 0, -1e8);
  mesh.material = material;
  mesh.metadata = { cutawayBounds: place.bounds, ownsCutawayMaterial: true };
  return [mesh];
}
