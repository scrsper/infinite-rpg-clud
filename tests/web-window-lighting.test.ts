import { Mesh, NullEngine, PBRMaterial, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';
import { B } from '../src/sim/physical/blocks';
import type { PlaceProjection, RegionProjection } from '../src/web/net/messages';
import { LightPool } from '../src/web/world/lights';
import { Cells } from '../src/web/world/structures';
import { roomLightStrength, WindowLighting } from '../src/web/world/windowLighting';
import { RegionManager } from '../src/web/world/regionManager';

const place: PlaceProjection = {id:'home',type:'house',indoor:true,family:'dwelling',visualSeed:1,wallHeight:4,bounds:{x0:10,x1:16,z0:20,z1:26,y0:2,y1:12},inside:{x:12,y:3,z:22},door:{x:13,y:3,z:19}};
describe('projected window illumination',()=>{
  it('requires a projected interior source and follows extinguishing without inventing lamps',()=>{
    const fire={id:'hearth',pos:{x:12,y:3,z:22},lit:false,intensity:.8};
    expect(roomLightStrength(place,[],[fire])).toBe(0);
    expect(roomLightStrength(place,[],[{...fire,lit:true}])).toBe(.8);
    expect(roomLightStrength(place,[{x:8,y:3,z:22}],[])).toBe(0);
    expect(roomLightStrength(place,[{x:12,y:3,z:22}],[])).toBe(1);
    expect(roomLightStrength({...place,indoor:false},[fire.pos],[{...fire,lit:true}])).toBe(0);
  });
  it('updates only owned panes, pools spill and cleans candidates up on unload',()=>{
    const engine=new NullEngine(), scene=new Scene(engine), pool=new LightPool(scene,2), root=new TransformNode('region',scene);
    const pane=new Mesh('pane',scene), mat=new PBRMaterial('pane-owned',scene); pane.material=mat; mat.alpha=.32;
    const shared=new PBRMaterial('unlit-other-pane',scene);
    const cells=new Cells(0,0); cells.set(10,4,23,B.Glass);
    const region={id:'region',bounds:{x0:0,z0:0,x1:256,z1:256},places:[place],furnishings:[]} as unknown as RegionProjection;
    const before=JSON.stringify(region), rig=new WindowLighting(scene,region,cells,new Map([['home',pane]]),pool,root);
    rig.update(1); pool.update(0,new Vector3(10,4,23),1);
    expect(pool.active).toBe(0); expect(mat.emissiveColor.r).toBe(0);
    rig.apply([{id:'fire',pos:place.inside,lit:true,intensity:1}]);rig.update(1);pool.update(0,new Vector3(10,4,23),1);
    expect(pool.active).toBe(1);expect(mat.emissiveColor.r).toBeGreaterThan(1);expect(shared.emissiveColor.r).toBe(0);
    rig.apply([]);rig.update(1);pool.update(0,new Vector3(10,4,23),1);
    expect(pool.active).toBe(0);expect(mat.alpha).toBe(.32);expect(JSON.stringify(region)).toBe(before);
    rig.dispose();expect(pool.count).toBe(0);pool.dispose();scene.dispose();engine.dispose();
  });
  it('clips an indoor lamp core with its own building and restores it reversibly',()=>{
    const engine=new NullEngine(),scene=new Scene(engine),pool=new LightPool(scene,2),root=new TransformNode('region',scene);
    const region={id:'region',bounds:{x0:0,z0:0,x1:256,z1:256},places:[place],furnishings:[{role:'lantern',pos:{x:12,y:4,z:23},yaw:0}]} as unknown as RegionProjection;
    const rig=new WindowLighting(scene,region,null,new Map(),pool,root);
    expect(rig.meshes).toHaveLength(1);
    const context={origin:{x:0,y:0,z:0},regions:new Map([['region',{meshes:[],windows:rig}]])};
    RegionManager.prototype.updateCutaway.call(context as unknown as RegionManager,{x:12,y:3,z:23},new Vector3(0,20,35));
    expect(rig.meshes[0].material!.clipPlane!.d).toBe(-3.8);
    RegionManager.prototype.updateCutaway.call(context as unknown as RegionManager,null,new Vector3(0,20,35));
    expect(rig.meshes[0].material!.clipPlane!.d).toBe(-1e8);
    rig.dispose();pool.dispose();scene.dispose();engine.dispose();
  });
});
