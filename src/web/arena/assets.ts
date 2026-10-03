import '@babylonjs/loaders/glTF';
import { AssetContainer, Matrix, Mesh, SceneLoader, TransformNode, Vector3, type AbstractMesh, type AnimationGroup, type Scene } from '@babylonjs/core';

/**
 * Combat Arena assets: CC0 KayKit characters, weapons and dungeon props (Kay Lousberg), built by
 * scripts/web/arena/build-arena.mjs into web/public/arena. Props were pre-fractured in Blender.
 */
export type CharacterKind = 'knight' | 'barbarian' | 'rogue_hooded' | 'skeleton_warrior' | 'skeleton_minion' | 'skeleton_rogue' | 'skeleton_mage';
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
