import { describe, expect, it } from 'vitest';
import { Camera, FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { CameraRig } from '../src/web/game/cameraRig';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/web/game/bindings';
import { predictMovement } from '../src/sim/physical/prediction';
import { needsCutaway } from '../src/web/world/cutaway';

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
});
