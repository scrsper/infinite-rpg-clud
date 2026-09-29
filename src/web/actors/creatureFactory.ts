import { Color3, Mesh, MultiMaterial, PBRMaterial, Scene, TransformNode } from '@babylonjs/core';
import type { Atmosphere } from '../world/atmosphere';
import type { ActorState, BodyVisual } from './actorManager';
import { CharacterRig, KitAsset } from './characterRig';
import { QuadrupedAnimator } from './quadrupedAnimator';
import type { WildlifeBody } from '../net/messages';
import { hash2 } from '../render/noise';

/**
 * The three canonical wildlife species as rigged quadrupeds. A species is a kit (mesh, skeleton, coat
 * pattern in vertex colours) plus this table of coat colours and sizes; nothing here is a species the
 * simulation does not have. Concept-art creatures (flying, spectral, giant, red-antlered) are separate,
 * labelled previews in the showroom and are never spawned by the world.
 */
export const SPECIES_ART: Record<string, { file: string; kitHeight: number; coat: [number, number, number]; coatVar: number; belly?: [number, number, number] }> = {
  roe_deer: { file: 'models/creature_roe_deer.glb', kitHeight: 1.16, coat: [158, 112, 72], coatVar: 0.16 },
  woodland_boar: { file: 'models/creature_woodland_boar.glb', kitHeight: 0.78, coat: [64, 52, 44], coatVar: 0.22 },
  field_hare: { file: 'models/creature_field_hare.glb', kitHeight: 0.42, coat: [150, 118, 80], coatVar: 0.14 },
};

const lin = (c: [number, number, number]) => new Color3(c[0] / 255, c[1] / 255, c[2] / 255).toLinearSpace();

export class CreatureFactory {
  private readonly kits = new Map<string, KitAsset>();
  private n = 0;
  async load(scene: Scene): Promise<void> {
    await Promise.all(Object.entries(SPECIES_ART).map(async ([id, s]) => { try { this.kits.set(id, await KitAsset.load(scene, s.file, id)); } catch (e) { console.warn(`[tv] creature ${id} failed to load`, e); } }));
  }
  has(species: string): boolean { return this.kits.has(species); }
  create(scene: Scene, atmosphere: Atmosphere, w: WildlifeBody): CreatureVisual | null {
    const kit = this.kits.get(w.speciesId), art = SPECIES_ART[w.speciesId]; if (!kit || !art) return null;
    const name = `an${++this.n}`, rig = new CharacterRig(kit, scene, name);
    const seed = Math.floor(hash2(w.creatureId.length * 7 + [...w.creatureId].reduce((a, c) => a + c.charCodeAt(0), 0), 3, 5) * 1000);
    const v = (hash2(seed, 1, 2) - 0.5) * 2 * art.coatVar, coat: [number, number, number] = [art.coat[0] * (1 + v), art.coat[1] * (1 + v * 0.8), art.coat[2] * (1 + v * 0.6)];
    const mats = new Map<string, PBRMaterial>();
    const make = (slot: string, cfg: (m: PBRMaterial) => void) => { const m = new PBRMaterial(`${name}.${slot}`, scene); m.metallic = 0; m.roughness = 0.9; m.maxSimultaneousLights = 8; cfg(m); mats.set(slot, m); };
    make('TV_Hide', m => { m.albedoColor = lin(coat); m.roughness = 0.96; m.sheen.isEnabled = true; m.sheen.intensity = 0.5; m.sheen.color = lin([Math.min(255, coat[0] * 1.4), Math.min(255, coat[1] * 1.4), Math.min(255, coat[2] * 1.3)]); });
    make('TV_Hoof', m => { m.albedoColor = lin([26, 20, 18]); m.roughness = 0.45; });
    make('TV_Antler', m => { m.albedoColor = lin([178, 164, 138]); m.roughness = 0.7; });
    make('TV_Tusk', m => { m.albedoColor = lin([226, 218, 192]); m.roughness = 0.5; });
    make('TV_CreatureEye', m => { m.albedoColor = lin([14, 10, 10]); m.roughness = 0.06; m.clearCoat.isEnabled = true; });
    for (const p of rig.parts) {
      const mesh = p.mesh as Mesh; mesh.receiveShadows = true; mesh.alwaysSelectAsActiveMesh = true; atmosphere.addCaster(mesh);
      const mat = mesh.material;
      const slot = (n: string) => { const m = /TV_[A-Za-z]+/.exec(n); return m ? m[0] : n; };
      if (mat instanceof MultiMaterial) { const multi = new MultiMaterial(`${mesh.name}.multi`, scene); for (const sub of mat.subMaterials) multi.subMaterials.push(sub ? mats.get(slot(sub.name)) ?? sub : null); mesh.material = multi; }
      else if (mat) mesh.material = mats.get(slot(mat.name)) ?? mat;
    }
    const scale = (w.bodyPlan.heightM / art.kitHeight) * (w.scale || 1) * (w.ageClass === 'juvenile' ? 0.62 : 1);
    rig.root.scaling.setAll(scale);
    return new CreatureVisual(rig, atmosphere, [...mats.values()], w.speciesId, w.bodyPlan.heightM * (w.scale || 1) * (w.ageClass === 'juvenile' ? 0.62 : 1), scale);
  }
}

export class CreatureVisual implements BodyVisual {
  readonly root: TransformNode;
  readonly animator: QuadrupedAnimator;
  headHeight: number;
  constructor(readonly rig: CharacterRig, private readonly atmosphere: Atmosphere, private readonly owned: PBRMaterial[], readonly species: string, height: number, scale: number) {
    this.root = rig.root; this.headHeight = height + 0.3; this.animator = new QuadrupedAnimator(rig, species, scale);
  }
  update(dt: number, s: ActorState): void { this.animator.update(dt, s); }
  dispose(): void { for (const p of this.rig.parts) this.atmosphere.removeCaster(p.mesh); this.rig.dispose(); for (const m of this.owned) m.dispose(); }
}
