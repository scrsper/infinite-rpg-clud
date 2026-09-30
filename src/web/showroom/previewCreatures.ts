import { Quaternion, Scene, Vector3 } from '@babylonjs/core';
import { CharacterRig, KitAsset, Q } from '../actors/characterRig';
import type { Atmosphere } from '../world/atmosphere';
import { QuadrupedAnimator } from '../actors/quadrupedAnimator';
import type { ActorState } from '../actors/actorManager';
import type { WildlifeBody } from '../net/messages';

/**
 * The four concept-art creatures, as labelled presentation previews. The simulation has no flight,
 * incorporeality, giants or void-touched deer, so none of these is ever spawned by the world; they exist
 * to show the art direction of docs/web/STYLE.md in motion. Each keeps the material set it was authored
 * with (emissive crimson, translucent shroud, blue crystal) and a small procedural animation.
 */
export type PreviewId = 'rift_hawk' | 'veil_wraith' | 'shattered_colossus' | 'void_stag';
export const PREVIEWS: { id: PreviewId; label: string; note: string; file: string }[] = [
  { id: 'rift_hawk', label: 'Rift Hawk', note: 'Flight is not a canonical locomotion in this world.', file: 'models/preview_rift_hawk.glb' },
  { id: 'veil_wraith', label: 'Veil Wraith', note: 'The simulation has no incorporeal creatures.', file: 'models/preview_veil_wraith.glb' },
  { id: 'shattered_colossus', label: 'Shattered Colossus', note: 'The simulation has no giants; humans are the only large humanoids.', file: 'models/preview_shattered_colossus.glb' },
  { id: 'void_stag', label: 'Void Stag', note: 'Not a deer species: the roe deer is the only canonical deer.', file: 'models/preview_void_stag.glb' },
];

export class PreviewCreature {
  private t = Math.random() * 10;
  private quad: QuadrupedAnimator | null = null;
  private readonly wb = { activity: 'idle', defense: null, dead: false, alive: true } as unknown as WildlifeBody;
  constructor(readonly id: PreviewId, readonly rig: CharacterRig, atmosphere: Atmosphere) {
    for (const p of rig.parts) { p.mesh.alwaysSelectAsActiveMesh = true; atmosphere.addCaster(p.mesh); (p.mesh as { receiveShadows: boolean }).receiveShadows = true; }
    if (id === 'void_stag') this.quad = new QuadrupedAnimator(rig, 'roe_deer', 1.3);
  }
  static async create(scene: Scene, atmosphere: Atmosphere, id: PreviewId): Promise<PreviewCreature | null> {
    const def = PREVIEWS.find(p => p.id === id)!;
    try { const kit = await KitAsset.load(scene, def.file, id); return new PreviewCreature(id, new CharacterRig(kit, scene, `pv-${id}`), atmosphere); } catch (e) { console.warn('[tv] preview failed', id, e); return null; }
  }
  update(dt: number): void {
    this.t += dt; const t = this.t, r = this.rig, chain = Q.chain;
    switch (this.id) {
      case 'rift_hawk': {
        const f = Math.sin(t * 5.2), up = f * 0.55;
        for (const [s, sg] of [['l', 1], ['r', -1]] as const) {
          r.setBone(`wing_${s}_1`, Q.z(sg * up)); r.setBone(`wing_${s}_2`, Q.z(sg * (up * 0.7 + 0.08))); r.setBone(`wing_${s}_3`, chain(Q.z(sg * (up * 0.9 + 0.12)), Q.y(sg * -0.15 * f)));
        }
        r.setBone('body', Q.x(-0.05 + 0.04 * Math.sin(t * 2.6))); r.setBone('tail_01', Q.x(0.1 * Math.sin(t * 2.6 + 1))); r.offsetBone('root', new Vector3(0, 0.15 * Math.sin(t * 2.6), 0));
        break;
      }
      case 'veil_wraith': {
        for (let i = 1; i <= 7; i++) r.setBone(`shroud_0${i}`, chain(Q.z(Math.sin(t * 0.9 + i * 0.5) * 0.06), Q.x(Math.sin(t * 0.7 + i * 0.4) * 0.05)));
        r.setBone('hover', Q.x(0.03 * Math.sin(t * 0.6))); r.setBone('head', Q.x(0.08 * Math.sin(t * 0.8)));
        for (const [s, sg] of [['l', 1], ['r', -1]] as const) { r.setBone(`arm_${s}_1`, chain(Q.x(-0.25 + 0.1 * Math.sin(t * 1.1 + sg)), Q.z(sg * 0.15))); r.setBone(`arm_${s}_2`, Q.x(-0.3 + 0.12 * Math.sin(t * 1.3))); }
        break;
      }
      case 'shattered_colossus': {
        const b = Math.sin(t * 0.9) * 0.02, sw = Math.sin(t * 0.5);
        r.setBone('spine_02', Q.x(b)); r.setBone('spine_03', chain(Q.x(b), Q.y(sw * 0.08))); r.setBone('head', Q.y(sw * -0.12));
        r.setBone('upperarm_l', chain(Q.x(-0.12 * sw), Q.z(-0.05))); r.setBone('upperarm_r', chain(Q.x(0.12 * sw), Q.z(0.05))); r.setBone('lowerarm_l', Q.x(-0.3)); r.setBone('lowerarm_r', Q.x(-0.3));
        break;
      }
      case 'void_stag': {
        const st = { bodyId: 'v', own: false, kind: 'wildlife', wildlife: this.wb, speed: 0, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, crouch: 0, age: 0 } as ActorState;
        this.quad?.update(dt, st); break;
      }
    }
  }
  dispose(): void { this.rig.dispose(); }
}
export type { Quaternion };
