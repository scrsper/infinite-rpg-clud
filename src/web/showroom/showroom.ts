import { Color3, MeshBuilder, PBRMaterial, Vector3, type Mesh } from '@babylonjs/core';
import type { App } from '../app';
import type { ActorState } from '../actors/actorManager';
import { CharacterVisual } from '../actors/characterFactory';
import { realize } from '../actors/appearanceMap';
import type { AppearanceDescription } from '../net/messages';
import type { CombatContext } from '../actors/combatPose';

/**
 * The art showroom: a lit stage with the character kit and previews, an orbit camera, and no
 * connection to any world. It exists to judge art directly (silhouette, materials, pose, deformation)
 * rather than through whatever the simulation happens to be doing.
 *
 *   ?showroom=lineup       a row of the world's kinds of people, in motion
 *   ?showroom=hero         the art-preview hero (labelled as such)
 *   ?showroom=creatures    the concept creatures (labelled as previews where unsupported)
 * Keys: 1 idle, 2 walk, 3 run, 4 sit, 5 work, 6 talk, 7 jab, 8 cross, 9 kick, 0 guard.
 */
type Pose = 'idle' | 'walk' | 'run' | 'sit' | 'work' | 'talk' | 'jab' | 'cross' | 'front_kick' | 'round_kick' | 'guard' | 'sidestep' | 'dead' | 'kneel' | 'drink' | 'eat' | 'crouch';
const POSES: Pose[] = ['idle', 'walk', 'run', 'sit', 'work', 'talk', 'jab', 'cross', 'front_kick', 'guard'];

const person = (o: Partial<AppearanceDescription> & Pick<AppearanceDescription, 'garmentSilhouette' | 'garmentPalette' | 'presentation'>): AppearanceDescription => ({
  archetype: 'showroom', culture: 'ashford', skinTone: 'fair', faceShape: 'oval', hairStyle: 'tied_back', hairColor: 'brown', eyeColor: 'brown', frame: 'average', stature: 'average',
  accessories: [], culturalTags: ['ashford'], grooming: 0.8, wear: 0.3, status: 'modest', agePresentation: 'adult', roleCues: [], ...o,
} as AppearanceDescription);

export const LINEUP: { name: string; desc: AppearanceDescription }[] = [
  { name: 'Farmer', desc: person({ presentation: 'feminine', garmentSilhouette: 'apron_over_tunic', garmentPalette: 'indigo_work', hairStyle: 'braided', skinTone: 'olive', accessories: ['wide_hat', 'hair_ornament'], roleCues: ['wide_hat', 'hoe'], agePresentation: 'middle_aged', wear: 0.55, culturalTags: ['ashford', 'blossom_motif'] }) },
  { name: 'Smith', desc: person({ presentation: 'masculine', garmentSilhouette: 'apron_over_tunic', garmentPalette: 'earth_work', hairStyle: 'cropped', skinTone: 'tan', frame: 'powerful', roleCues: ['apron', 'hammer'], wear: 0.6 }) },
  { name: 'Guard', desc: person({ presentation: 'masculine', garmentSilhouette: 'lamellar_armour', garmentPalette: 'watch_vermilion', hairStyle: 'warrior_bun', frame: 'sturdy', accessories: ['helm'], roleCues: ['helm', 'spear'], culturalTags: ['ashford', 'lamellar'] }) },
  { name: 'Priest', desc: person({ presentation: 'masculine', garmentSilhouette: 'ceremonial_robe', garmentPalette: 'temple_slate', hairStyle: 'shaved', agePresentation: 'elder', roleCues: ['prayer_beads'], accessories: ['prayer_beads'], status: 'comfortable' }) },
  { name: 'Merchant', desc: person({ presentation: 'feminine', garmentSilhouette: 'formal_kimono', garmentPalette: 'merchant_plum', hairStyle: 'updo_ornamented', accessories: ['hair_ornament', 'ear_drops'], status: 'affluent', culturalTags: ['ashford', 'festival_silk'], skinTone: 'porcelain' }) },
  { name: 'Hunter', desc: person({ presentation: 'masculine', garmentSilhouette: 'travel_coat', garmentPalette: 'moss_hunt', hairStyle: 'unkempt', accessories: ['hood', 'arm_wrap'], roleCues: ['hood', 'bow', 'travel_pack'], skinTone: 'bronze', eyeColor: 'green' }) },
  { name: 'Dancer', desc: person({ presentation: 'feminine', garmentSilhouette: 'dancer_wrap', garmentPalette: 'festival_crimson', hairStyle: 'twin_braid', accessories: ['hair_ornament', 'ear_drops'], culturalTags: ['ashford', 'festival_silk', 'blossom_motif'], agePresentation: 'young_adult', roleCues: ['dancer'], skinTone: 'warm' }) },
  { name: 'Ronin', desc: person({ presentation: 'masculine', garmentSilhouette: 'hakama_set', garmentPalette: 'ronin_charcoal', hairStyle: 'topknot', accessories: ['arm_wrap'], culturalTags: ['ashford', 'retainer'], skinTone: 'tan', faceShape: 'angular', wear: 0.5 }) },
  { name: 'Child', desc: person({ presentation: 'feminine', garmentSilhouette: 'work_kimono', garmentPalette: 'blossom_violet', hairStyle: 'twin_braid', agePresentation: 'child', accessories: ['hair_ornament'], faceShape: 'round' }) },
  { name: 'Elder', desc: person({ presentation: 'feminine', garmentSilhouette: 'layered_kimono', garmentPalette: 'ascetic_bone', hairStyle: 'updo_ornamented', hairColor: 'white', agePresentation: 'elder', roleCues: ['walking_staff'], eyeColor: 'grey' }) },
  { name: 'Vagrant', desc: person({ presentation: 'androgynous', garmentSilhouette: 'ragged_layers', garmentPalette: 'outlaw_soot', hairStyle: 'unkempt', status: 'destitute', wear: 0.95, grooming: 0.1, skinTone: 'brown', accessories: ['hood'] }) },
  { name: 'Noble', desc: person({ presentation: 'feminine', garmentSilhouette: 'layered_kimono', garmentPalette: 'snow_moon', hairStyle: 'loose_long', hairColor: 'silver', accessories: ['hair_ornament', 'ear_drops'], status: 'noble', skinTone: 'porcelain', eyeColor: 'blue', culturalTags: ['ashford', 'snow_moon'], faceShape: 'heart' }) },
];

export class Showroom {
  private visuals: { v: CharacterVisual; x: number; name: string }[] = [];
  private yaw = 0.25; private pitch = 0.12; private dist = 6.5; private target = new Vector3(0, 1.0, 0);
  private t = 0;
  private stage: Mesh | null = null;
  pose: Pose = 'idle';
  private label: HTMLElement | null = null;
  constructor(private readonly app: App) {}

  async init(subject: string): Promise<void> {
    const app = this.app, scene = app.ctx.scene;
    const ground = MeshBuilder.CreateDisc('stage', { radius: 60, tessellation: 64 }, scene); ground.rotation.x = Math.PI / 2;
    const m = new PBRMaterial('stage-mat', scene); m.albedoColor = new Color3(0.2, 0.22, 0.24); m.roughness = 0.9; m.metallic = 0; ground.material = m; ground.receiveShadows = true; this.stage = ground;
    if (subject === 'lineup' || subject.startsWith('kit')) {
      const list = subject === 'lineup' ? LINEUP : LINEUP.slice(0, 1);
      const spacing = 1.45;
      list.forEach((p, i) => {
        const r = realize(`show-${i}`, p.desc, undefined);
        const v = app.characters.create(scene, app.atmosphere, `show-${i}`, r);
        if (!v) return;
        const x = (i - (list.length - 1) / 2) * spacing; v.root.position.set(x, 0, 0); v.root.rotation.y = Math.PI;   // face the camera
        this.visuals.push({ v, x, name: p.name });
      });
      this.dist = Math.max(3.4, list.length * 0.85);
      const f = app.params.get('focus'); if (f !== null) { const idx = Number(f); this.target.set((idx - (list.length - 1) / 2) * spacing, 1.05, 0); this.dist = Number(app.params.get('dist') ?? 2.6); this.yaw = Number(app.params.get('yaw') ?? 0.15); }
      if (app.params.get('focus') === null) this.target.set(0, 0.95, 0);
    }
    const canvas = app.ctx.canvas;
    let drag = false;
    canvas.addEventListener('pointerdown', () => { drag = true; });
    window.addEventListener('pointerup', () => { drag = false; });
    window.addEventListener('pointermove', e => { if (drag) { this.yaw -= e.movementX * 0.006; this.pitch = Math.max(-0.4, Math.min(1.2, this.pitch + e.movementY * 0.005)); } });
    canvas.addEventListener('wheel', e => { this.dist = Math.max(0.6, Math.min(30, this.dist * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: true });
    window.addEventListener('keydown', e => { const i = e.key === '0' ? 9 : Number(e.key) - 1; if (i >= 0 && i < POSES.length) this.pose = POSES[i]; });
    this.label = document.createElement('div'); this.label.style.cssText = 'position:absolute;left:14px;top:12px;color:#e8dfc8;font:14px Segoe UI,sans-serif;text-shadow:0 1px 3px #000'; app.ctx.canvas.parentElement?.appendChild(this.label);
    app.atmosphere.update(Number(app.params.get('hour') ?? 13.5), { kind: 'clear', intensity: 0, wind: 0.1 }, 0);
  }

  setFocus(x: number, dist: number, yaw: number, pitch = 0.1): void { this.target.set(x, 1.0, 0); this.dist = dist; this.yaw = yaw; this.pitch = pitch; }

  update(dt: number): void {
    this.t += dt;
    const app = this.app, cam = app.camera;
    const cp = Math.cos(this.pitch);
    cam.position.set(this.target.x + Math.sin(this.yaw) * cp * this.dist, this.target.y + Math.sin(this.pitch) * this.dist, this.target.z + Math.cos(this.yaw) * cp * this.dist);
    cam.setTarget(this.target); cam.fov = 0.6;
    for (const { v, x } of this.visuals) {
      const walking = this.pose === 'walk' || this.pose === 'run';
      const speed = this.pose === 'walk' ? 1.5 : this.pose === 'run' ? 4.6 : 0;
      const posture = this.pose === 'sit' ? 'sit' : this.pose === 'kneel' ? 'kneel' : 'stand';
      const family = this.pose === 'work' ? 'work' : this.pose === 'talk' ? 'socialize' : this.pose === 'eat' ? 'eat' : this.pose === 'drink' ? 'drink' : 'idle';
      const detail = this.pose === 'work' ? 'chop' : this.pose === 'talk' ? 'converse' : '';
      let combat: CombatContext | null = null;
      if (['jab', 'cross', 'front_kick', 'round_kick', 'guard', 'sidestep'].includes(this.pose)) {
        const cyc = (this.t % 1.4); combat = { moveId: this.pose, weight: 'light', age: cyc, prep: 0.3, active: 0.15, recovery: 0.3, side: 1 };
      }
      const st: ActorState = {
        bodyId: 'show', own: false, kind: 'person', speed, velocity: { x: 0, y: 0, z: -speed }, yaw: 0, crouch: this.pose === 'crouch' ? 1 : 0, age: 0, speaking: this.pose === 'talk', gesture: 0.8, combat,
        body: { embodiment: { activity: { family, detail, posture, locomotion: walking ? 'walk' : 'idle', speed, injury: { impaired: false, severity: 0, movementMultiplier: 1 }, placeId: null, facingEntityId: null, targetPos: null, carried: null, station: null }, appearanceSignature: '', station: null, conversation: null, separation: { x: 0, z: 0 } } } as never,
      };
      v.update(dt, st);
      if (walking) v.root.position.z += 0; else v.root.position.x = x;
    }
    if (this.label) this.label.textContent = `Showroom · pose: ${this.pose} · keys 1-0 · drag to orbit · wheel to zoom`;
    app.atmosphere.follow(cam.position);
  }
  dispose(): void { for (const { v } of this.visuals) v.dispose(); this.stage?.dispose(); this.label?.remove(); }
}
