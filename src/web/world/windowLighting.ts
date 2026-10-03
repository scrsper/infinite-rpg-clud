import { Color3, Mesh, PBRMaterial, Plane, Scene, StandardMaterial, TransformNode } from '@babylonjs/core';
import { B } from '../../sim/physical/blocks';
import type { DynamicsProjection, PlaceProjection, RegionProjection, Vec3 } from '../net/messages';
import type { Cells } from './structures';
import { LightPool, type LightCandidate } from './lights';
import { MeshBatch } from './meshBatch';
import { PropBuilder } from './propGeometry';

const contains = (p: PlaceProjection, v: Vec3): boolean => v.x >= p.bounds.x0 && v.x <= p.bounds.x1 + 1 && v.z >= p.bounds.z0 && v.z <= p.bounds.z1 + 1 && v.y >= p.bounds.y0 && v.y <= p.bounds.y1 + 1;

/** Only observer-projected lamps/torches and currently lit fires can illuminate a room. */
export function roomLightStrength(place: PlaceProjection, lamps: readonly Vec3[], fires: DynamicsProjection['fires']): number {
  if (!place.indoor) return 0;
  const permanent = lamps.some(p => contains(place, p)) ? 1 : 0;
  return fires.reduce((strength, f) => f.lit && contains(place, f.pos) ? Math.max(strength, Math.min(1, Math.max(0, f.intensity))) : strength, permanent);
}

/** Region-owned warm window surfaces and spill, derived from existing interior emitters.
 * Window geometry and apertures are unchanged. The pooled lights are visual approximations
 * of light leaving the real glazing; they never create a canonical lamp or consume fuel. */
export class WindowLighting {
  private readonly lamps: Vec3[] = [];
  private fires: DynamicsProjection['fires'] = [];
  private readonly windows: { place: PlaceProjection; material: PBRMaterial; alpha: number; color: Color3; lights: LightCandidate[] }[] = [];
  private readonly ids: string[] = [];
  readonly meshes: Mesh[] = [];
  private readonly glowMaterial: StandardMaterial;

  constructor(scene: Scene, private region: RegionProjection, cells: Cells | null, panes: Map<string, Mesh>, private pool: LightPool, root: TransformNode) {
    for (const f of region.furnishings) if (f.role === 'lantern') this.lamps.push({x:f.pos.x+.5,y:f.pos.y+.75,z:f.pos.z+.5});
    if (cells) for (const [x,y,z,b] of cells.entries()) if (b === B.Torch) this.lamps.push({x:x+.5,y:y+.75,z:z+.5});
    this.glowMaterial = new StandardMaterial(`lamp-glow-${region.id}`,scene);
    this.glowMaterial.disableLighting = true;
    this.glowMaterial.emissiveColor = new Color3(2.8,1.45,.38);
    this.glowMaterial.diffuseColor = Color3.Black(); this.glowMaterial.specularColor = Color3.Black();
    const glowGroups=new Map<string,{batch:MeshBatch;place?:PlaceProjection}>();
    for (const lamp of this.lamps) {
      const place=region.places.find(p=>p.indoor&&contains(p,lamp)),key=place?.id??'outside';
      let group=glowGroups.get(key);if(!group){group={batch:new MeshBatch(),place};glowGroups.set(key,group);}
      new PropBuilder(group.batch,lamp.x-region.bounds.x0,lamp.y,lamp.z-region.bounds.z0).blob(0,0,0,.055,.095,.055,[1,1,1],6,4);
    }
    for(const [key,{batch,place}] of glowGroups) {
      const mat=place?this.glowMaterial.clone(`lamp-cores-${region.id}-${key}-cutaway`):this.glowMaterial;
      if(place)mat.clipPlane=new Plane(0,1,0,-1e8);
      const mesh=batch.build(`lamp-cores-${region.id}-${key}`,scene,mat);
      if(mesh){mesh.parent=root;if(place)mesh.metadata={cutawayBounds:place.bounds,ownsCutawayMaterial:true};this.meshes.push(mesh);}
    }
    for (const place of region.places) {
      const pane = panes.get(place.id); if (!pane || !(pane.material instanceof PBRMaterial) || !place.indoor) continue;
      const lights: LightCandidate[] = [];
      if (cells) for (const [x,y,z,b] of cells.entries()) {
        if (b !== B.Glass || !contains(place,{x,y,z})) continue;
        const bounds=place.bounds;
        let dx=0,dz=0;
        if (x===bounds.x0) dx=-1; else if(x===bounds.x1) dx=1;
        else if(z===bounds.z0) dz=-1; else if(z===bounds.z1) dz=1;
        else continue; // Interior glazing does not cast an exterior light.
        const c: LightCandidate = {id:`${region.id}:window:${x},${y},${z}`,root,x:x+.5-region.bounds.x0+dx*.7,y:y+.45,z:z+.5-region.bounds.z0+dz*.7,color:[1,.55,.22],intensity:2.8,range:5.2,flicker:.08,enabled:false};
        this.pool.add(c); this.ids.push(c.id); lights.push(c);
      }
      this.windows.push({place,material:pane.material,alpha:pane.material.alpha,color:pane.material.albedoColor.clone(),lights});
    }
  }

  apply(fires: DynamicsProjection['fires']): void { this.fires=fires; }
  update(night: number): void {
    const dark=Math.max(0,Math.min(1,night));
    for (const w of this.windows) {
      const strength=roomLightStrength(w.place,this.lamps,this.fires), glow=strength*(.06+.94*dark);
      w.material.emissiveColor.set(1.8*glow,.8*glow,.18*glow);
      w.material.alpha=w.alpha+(0.86-w.alpha)*glow;
      w.material.albedoColor.copyFrom(Color3.Lerp(w.color,new Color3(.55,.27,.09),glow));
      for(const c of w.lights) { c.enabled=strength>0 && dark>.12; c.intensity=2.8*strength*dark; }
    }
  }
  dispose(): void {
    for(const id of this.ids) this.pool.remove(id);
    for(const m of this.meshes) {if(m.metadata?.ownsCutawayMaterial)m.material?.dispose();m.dispose();}
    this.glowMaterial.dispose();
  }
}
