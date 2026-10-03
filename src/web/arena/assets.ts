import '@babylonjs/loaders/glTF';
import { AssetContainer, Matrix, Mesh, Quaternion, SceneLoader, TransformNode, Vector3, type AbstractMesh, type AnimationGroup, type Scene } from '@babylonjs/core';
import { CharacterFactory } from '../actors/characterFactory';
import { realize } from '../actors/appearanceMap';
import type { Atmosphere } from '../world/atmosphere';
import { Retargeter, instantiateClips, type ClipTemplate, type Grip } from './retarget';
import { LOOKS, type LookId } from './looks';

/** Humans are ~1.75 m; the arena was laid out around 2.2-unit fighters, so people are scaled to match. */
export const HUMAN_SCALE = 1.22;
/** Finger curl axis in the kit's finger-bone frame (tuned by eye). */
const GRIP_AXIS = new Vector3(0, 0, 1);
/** The arena uses blob shadows; the factory's caster hooks are no-ops here. */
const NO_SHADOWS = { addCaster() {}, removeCaster() {} } as unknown as Atmosphere;

/**
 * Combat Arena assets: CC0 KayKit characters, weapons and dungeon props (Kay Lousberg), built by
 * scripts/web/arena/build-arena.mjs into web/public/arena. Props were pre-fractured in Blender.
 */
/** KayKit rigs: now only the animation source for the human fighters. */
export type CharacterKind = 'skeleton_warrior';
const BASE = './arena/';

export interface CharacterInstance {
  root: TransformNode;
  anims: Map<string, AnimationGroup>;
  meshes: AbstractMesh[];
  slotR: TransformNode;
  slotL: TransformNode;
  chest: TransformNode | null;
  /** Meshes parented to a hand slot or head, by original name (weapons, shields, helmets). */
  gear: Map<string, AbstractMesh>;
  /** Skeleton nodes by bone name (humans only), for IK touch-ups. */
  bones?: Map<string, TransformNode>;
  dispose(): void;
}

export class ArenaAssets {
  private chars = new Map<CharacterKind, AssetContainer>();
  props!: AssetContainer;
  weapons!: AssetContainer;
  /** Disabled source meshes by node name (P_*, F_*, L_*, W_*). */
  readonly sources = new Map<string, Mesh>();
  /** Chunk centre relative to its prop's base, in the prop's frame. */
  readonly offsets = new Map<string, Vector3>();
  private serial = 0;
  constructor(private readonly scene: Scene) {}

  async load(kinds: CharacterKind[], progress: (t: string) => void): Promise<void> {
    const load = (file: string) => SceneLoader.LoadAssetContainerAsync(BASE, file, this.scene);
    progress('Loading props');
    [this.props, this.weapons] = await Promise.all([load('props.glb'), load('weapons.glb')]);
    for (const c of [this.props, this.weapons]) {
      c.addAllToScene();
      for (const m of c.meshes) {
        if (!(m instanceof Mesh) || !m.getTotalVertices()) continue;
        // Bake the glTF root conversion into each source so instances can be parented freely.
        const world = m.computeWorldMatrix(true).clone();
        m.setParent(null); m.position.setAll(0); m.rotationQuaternion = null; m.rotation.setAll(0); m.scaling.setAll(1);
        m.bakeTransformIntoVertices(world);
        if (m.name.startsWith('F_')) {
          // Chunks pivot about their own centre; remember where that centre sits relative to the prop base.
          m.refreshBoundingInfo(); const c = m.getBoundingInfo().boundingBox.center.clone();
          m.bakeTransformIntoVertices(Matrix.Translation(-c.x, -c.y, -c.z));
          this.offsets.set(m.name, c);
        }
        m.refreshBoundingInfo();
        m.setEnabled(false); m.isPickable = false;
        this.sources.set(m.name, m);
      }
      for (const n of c.transformNodes) n.dispose();
      for (const m of c.meshes) if (!this.sources.has(m.name) && m.name === '__root__') m.dispose();
    }
    let i = 0;
    for (const k of kinds) {
      progress(`Loading fighters ${++i}/${kinds.length}`);
      this.chars.set(k, await load(`${k}.glb`));
    }
  }

  // ---- Torn Veil humans driven by retargeted KayKit combat clips -----------------------------
  readonly factory = new CharacterFactory();
  readonly clips = new Map<string, ClipTemplate>();
  private gripR!: Grip; private gripL!: Grip;

  /** Load the human kits and bake every combat clip from the KayKit rig onto the human skeleton. */
  async loadHumans(progress: (t: string) => void): Promise<void> {
    progress('Loading people');
    await this.factory.load(this.scene, undefined, ['m', 'f']);
    progress('Teaching the fighters to fight');
    const src = this.character('skeleton_warrior');
    const ref = this.factory.create(this.scene, NO_SHADOWS, 'retarget-ref', realize('retarget-ref', LOOKS.hero, undefined))!;
    ref.rig.model.rotationQuaternion = Quaternion.Identity();
    const srcNodes = new Map(src.root.getChildTransformNodes(false).map(n => [n.name.slice(n.name.indexOf('.') + 1), n] as const));
    const rt = new Retargeter({ space: src.root, nodes: srcNodes }, { space: ref.rig.model, nodes: new Map([...ref.rig.bones].map(([k, b]) => [k, b.node])) });
    for (const [name, g] of src.anims) this.clips.set(name, rt.bake(name, g));
    this.gripR = rt.grip('wrist.r', 'handslot.r', 'hand_r', 'fingers_01_r');
    this.gripL = rt.grip('wrist.l', 'handslot.l', 'hand_l', 'fingers_01_l');
    src.dispose(); ref.dispose();
  }

  /** Your arsenal (web/public/arena/arsenal): each multi-part weapon merged into one source mesh W_<key>. */
  async loadArsenal(keys: string[]): Promise<void> {
    await Promise.all(keys.map(async k => {
      const c = await SceneLoader.LoadAssetContainerAsync(BASE + 'arsenal/', `${k}.glb`, this.scene);
      c.addAllToScene();
      const parts: Mesh[] = [];
      for (const m of c.meshes) {
        if (!(m instanceof Mesh) || !m.getTotalVertices()) continue;
        const w = m.computeWorldMatrix(true).clone();
        m.setParent(null); m.position.setAll(0); m.rotationQuaternion = null; m.rotation.setAll(0); m.scaling.setAll(1);
        m.bakeTransformIntoVertices(w); parts.push(m);
      }
      // Parts differ in attributes (some carry UVs/tangents, some not); merge on the shared set.
      const common = parts.map(p => new Set(p.getVerticesDataKinds())).reduce((a, b) => new Set([...a].filter(k => b.has(k))));
      for (const p of parts) for (const kind of p.getVerticesDataKinds()) if (!common.has(kind)) p.removeVerticesData(kind);
      const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
      merged.name = `W_${k}`; merged.setEnabled(false); merged.isPickable = false; merged.refreshBoundingInfo();
      this.sources.set(merged.name, merged);
      for (const n of c.transformNodes) n.dispose();
      for (const m of c.meshes) if (m !== merged && !m.isDisposed()) m.dispose();
    }));
  }

  human(look: LookId, id: string): CharacterInstance {
    const r = realize(id, LOOKS[look], undefined);
    const v = this.factory.create(this.scene, NO_SHADOWS, id, r)!;
    v.rig.model.rotationQuaternion = Quaternion.Identity();
    const tag = `h${this.serial++}`;
    const holder = new TransformNode(tag, this.scene);
    v.rig.root.parent = holder; holder.scaling.setAll(HUMAN_SCALE);
    const nodes = new Map([...v.rig.bones].map(([k, b]) => [k, b.node]));
    const anims = instantiateClips(tag, this.clips, nodes, this.scene);
    const slot = (hand: string, g: Grip) => {
      const s = new TransformNode(`${tag}.slot.${hand}`, this.scene); s.parent = nodes.get(hand)!;
      s.rotationQuaternion = g.rot.clone(); s.position.copyFrom(g.pos); s.scaling.setAll(1 / g.scale);
      return s;
    };
    // A loose grip so hands read as holding the haft rather than splayed flat.
    for (const side of ['l', 'r']) for (const [b, a] of [['fingers_01', .9], ['fingers_02', 1.1], ['thumb_01', .35], ['thumb_02', .5]] as const) {
      const n = nodes.get(`${b}_${side}`); if (n?.rotationQuaternion) n.rotationQuaternion = n.rotationQuaternion.multiply(Quaternion.RotationAxis(GRIP_AXIS, a));
    }
    const meshes = v.rig.parts.map(p => p.mesh);
    return {
      root: holder, anims, meshes, gear: new Map(), bones: nodes, chest: nodes.get('spine_03') ?? null,
      slotR: slot('hand_r', this.gripR), slotL: slot('hand_l', this.gripL),
      dispose: () => { for (const g of anims.values()) g.dispose(); v.dispose(); holder.dispose(false, false); },
    };
  }

  /** Bounding-box-free fragment offset: sources were exported at their position relative to the prop base. */
  fragmentsOf(key: string): Mesh[] {
    const out: Mesh[] = [];
    for (let n = 0; ; n++) { const m = this.sources.get(`F_${key}_${n}`); if (!m) break; out.push(m); }
    return out;
  }

  character(kind: CharacterKind): CharacterInstance {
    const c = this.chars.get(kind)!;
    const tag = `${kind}#${this.serial++}`;
    const e = c.instantiateModelsToScene(n => `${tag}.${n}`, false, { doNotInstantiate: true });
    const holder = new TransformNode(tag, this.scene);
    for (const r of e.rootNodes) r.parent = holder;
    const anims = new Map<string, AnimationGroup>();
    for (const g of e.animationGroups) { g.stop(); anims.set(g.name.slice(tag.length + 1), g); }
    const nodes = holder.getChildTransformNodes(false);
    const find = (n: string) => nodes.find(x => x.name === `${tag}.${n}`) ?? null;
    const meshes = holder.getChildMeshes(false);
    const gear = new Map<string, AbstractMesh>();
    for (const m of meshes) { m.isPickable = false; const p = m.parent?.name ?? ''; if (/handslot|head$|chest$/.test(p)) gear.set(m.name.slice(tag.length + 1), m); }
    return {
      root: holder, anims, meshes, gear,
      slotR: find('handslot.r')!, slotL: find('handslot.l')!, chest: find('chest'),
      dispose: () => { for (const g of e.animationGroups) g.dispose(); holder.dispose(false, false); },
    };
  }
}
