import { describe, expect, it } from 'vitest';
import { Camera, FreeCamera, NullEngine, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { CameraRig } from '../src/web/game/cameraRig';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/web/game/bindings';
import { predictMovement } from '../src/sim/physical/prediction';
import { needsCutaway } from '../src/web/world/cutaway';
import { buildStaticProps } from '../src/web/world/props';
import { RegionManager } from '../src/web/world/regionManager';
import type { MaterialLibrary } from '../src/web/render/materials';
import type { RegionProjection } from '../src/web/net/messages';

describe('isometric presentation preserves control and world boundaries', () => {
  it('keeps the movement basis fixed through combat, conversation and look input; switches back reversibly', () => {
    const engine = new NullEngine({ renderWidth: 1600, renderHeight: 1000, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 4 });
    const scene = new Scene(engine), camera = new FreeCamera('test', Vector3.Zero(), scene);
    const settings = { ...DEFAULT_SETTINGS, viewMode: 'isometric' as 'isometric' | 'third-person' };
    const rig = new CameraRig(camera, () => settings, { blocked: () => true, ground: () => 0 });
    try {
      for (const mode of ['explore', 'combat', 'talk'] as const) {
        rig.setMode(mode); rig.setLock({ x: 8, y: 1, z: 3 }); rig.setTalk({ x: -3, y: 1, z: 4 }); rig.addLook(2, 1);
        rig.update(.016, { x: 10, y: 2, z: 20 }, 1.1);
        expect(camera.mode).toBe(Camera.ORTHOGRAPHIC_CAMERA); expect(rig.moveYaw).toBe(-Math.PI / 4);
        expect(camera.position.y).toBeGreaterThan(15); expect(camera.orthoTop).toBe(10);
      }
      rig.zoom(-100); rig.update(.016, { x: 10, y: 2, z: 20 }, 1.1); expect(camera.orthoTop).toBe(6);
      settings.viewMode = 'third-person'; rig.setMode('explore'); rig.update(.016, { x: 10, y: 2, z: 20 }, 1.1);
      expect(camera.mode).toBe(Camera.PERSPECTIVE_CAMERA); expect(rig.moveYaw).toBe(1.1);
      expect(sanitizeSettings({ viewMode: 'bad' }).viewMode).toBe('third-person');
    } finally { scene.dispose(); engine.dispose(); }
  });
  it('cuts only occupied or view-blocking buildings, including elevated terrain, and restores the rest', () => {
    const bounds = { x0: 10, x1: 20, z0: 10, z1: 20, y0: 25, y1: 31 };
    expect(needsCutaway(bounds, { x: 15, y: 25, z: 15 }, { x: -5, y: 45, z: 35 })).toBe(true);
    expect(needsCutaway(bounds, { x: 30, y: 25, z: 15 }, { x: 0, y: 36, z: 15 })).toBe(true);
    expect(needsCutaway(bounds, { x: 30, y: 25, z: 35 }, { x: 0, y: 36, z: 35 })).toBe(false);
    expect(needsCutaway(bounds, { x: 30, y: 25, z: 15 }, { x: 40, y: 36, z: 15 })).toBe(false);
  });
  it('keeps canonical wall clearance: a doorway corner intersects the wall while its center passes', () => {
    const column = (x: number, z: number) => ({floor:24,walkable:true,solids: z===0 && x!==0 ? [24,25,26] : []});
    const input={x:0,z:-1,sprint:false};
    const corner={pos:{x:0,y:24,z:1},yaw:0,speed:4,eligible:true};
    const centered={...corner,pos:{x:.5,y:24,z:1.5}};
    let blocked=corner, passed=centered;
    for(let i=0;i<30;i++){blocked=predictMovement(blocked,input,1/60,column);passed=predictMovement(passed,input,1/60,column);}
    expect(blocked.pos.z).toBe(1); expect(passed.pos.z).toBeLessThan(0);
  });
  it('registers door frame and leaf for reversible building cutaways without changing the opening', () => {
    const engine = new NullEngine(), scene = new Scene(engine), root = new TransformNode('region', scene);
    const shared = new StandardMaterial('shared-props', scene);
    const bounds = { x0: 10, x1: 20, z0: 10, z1: 20, y0: 24, y1: 30 };
    const region = { id: 'test', bounds, furnishings: [], fences: [], paths: [], openings: [[15,24,10,false]],
      places: [{id:'house', indoor:true, bounds, door:{x:15,y:24,z:9}}] } as unknown as RegionProjection;
    const before = JSON.stringify(region);
    const mats = {get:()=>shared, tilesPerMetre:()=>1} as unknown as MaterialLibrary;
    try {
      const props = buildStaticProps(scene, mats, region, null, root);
      expect(props.meshes.map(m=>m.name)).toEqual(['door-frame-15-24-10','door-leaf-15-24-10']);
      for(const mesh of props.meshes) {
        expect(mesh.material).not.toBe(shared); expect(mesh.metadata.cutawayBounds).toBe(bounds);
        expect(mesh.metadata.ownsCutawayMaterial).toBe(true);
      }
      const context = {origin:{x:0,y:0,z:0},regions:new Map([['test',{meshes:props.meshes}]])};
      RegionManager.prototype.updateCutaway.call(context as unknown as RegionManager,{x:15,y:24,z:15},new Vector3(0,45,35));
      for(const mesh of props.meshes) expect(mesh.material!.clipPlane!.d).toBe(-24.8);
      RegionManager.prototype.updateCutaway.call(context as unknown as RegionManager,null,new Vector3(0,45,35));
      for(const mesh of props.meshes) expect(mesh.material!.clipPlane!.d).toBe(-1e8);
      expect(shared.clipPlane).toBeFalsy(); expect(JSON.stringify(region)).toBe(before);
      expect(props.doors[0].open).toBe(0); expect(props.doors[0].target).toBe(0);
    } finally {scene.dispose();engine.dispose();}
  });
});
