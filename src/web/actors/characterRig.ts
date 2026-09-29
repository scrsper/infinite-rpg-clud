import '@babylonjs/loaders/glTF';
import {
  AbstractMesh, AssetContainer, Mesh, MorphTargetManager, Quaternion, Scene, SceneLoader, Skeleton, TransformNode, Vector3, type Bone, type InstantiatedEntries,
} from '@babylonjs/core';

/**
 * A loaded character kit and the rig that poses it.
 *
 * The kit is one glTF per build (armature, body, head with morph targets, eyes, garments, hair).
 * `CharacterRig` is one instance: it owns cloned nodes/skeleton, exposes parts by tag, and poses
 * bones in *character space*. A pose is a set of rotation deltas applied to each bone's rest world
 * orientation, so "raise the left arm 30 degrees forward" means the same thing whatever roll the
 * bone was exported with; the local rotation handed to the node is  R_parent^-1 * delta * R_bone.
 *
 * Model space (before the outer turn): +Y up, +Z forward, +X the figure's left. The outer root turns
 * the model half a turn so it faces the simulation's -Z forward.
 */
export interface KitPart { mesh: AbstractMesh; tag: string; name: string }
export interface BoneRig { name: string; node: TransformNode; parent: string | null; restLocal: Quaternion; restWorld: Quaternion; restParentWorld: Quaternion; restPos: Vector3; length: number; worldRestPos: Vector3 }

const AX = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };
export const Q = {
  x: (a: number) => Quaternion.RotationAxis(AX.x, a),
  y: (a: number) => Quaternion.RotationAxis(AX.y, a),
  z: (a: number) => Quaternion.RotationAxis(AX.z, a),
  /** Compose rotations in the order given (first applied first, in character axes). */
  chain: (...q: Quaternion[]) => q.reduce((acc, r) => r.multiply(acc), Quaternion.Identity()),
  identity: () => Quaternion.Identity(),
};

export class KitAsset {
  constructor(readonly container: AssetContainer, readonly name: string) {}
  static async load(scene: Scene, url: string, name: string): Promise<KitAsset> {
    const c = await SceneLoader.LoadAssetContainerAsync(url.substring(0, url.lastIndexOf('/') + 1), url.substring(url.lastIndexOf('/') + 1), scene);
    return new KitAsset(c, name);
  }
}

export class CharacterRig {
  readonly root: TransformNode;         // positioned/turned by the actor manager
  readonly model: TransformNode;        // the kit's own root (turned half a turn)
  readonly bones = new Map<string, BoneRig>();
  readonly parts: KitPart[] = [];
  readonly skeleton: Skeleton | null;
  readonly entries: InstantiatedEntries;
  private readonly world = new Quaternion();
  private readonly scratchQ = new Quaternion();

  constructor(kit: KitAsset, scene: Scene, name: string, predicate?: (entity: unknown) => boolean) {
    this.entries = kit.container.instantiateModelsToScene(n => `${name}.${n}`, true, { doNotInstantiate: true, ...(predicate ? { predicate } : {}) });
    this.root = new TransformNode(`${name}.root`, scene);
    this.model = new TransformNode(`${name}.model`, scene); this.model.parent = this.root;
    this.model.rotationQuaternion = Quaternion.RotationAxis(AX.y, Math.PI);
    for (const n of this.entries.rootNodes) (n as TransformNode).parent = this.model;
    this.skeleton = this.entries.skeletons[0] ?? null;
    scene.onBeforeRenderObservable.addOnce(() => undefined);
    this.model.computeWorldMatrix(true);
    this.captureRest();
    for (const m of this.entries.rootNodes.flatMap(n => n.getChildMeshes(false))) {
      // A constant set of morph influencers keeps the shader variant fixed, so a blink starting mid-frame never triggers a recompile.
      const mm = (m as Mesh).morphTargetManager; if (mm) { mm.optimizeInfluencers = false; mm.enableNormalMorphing = false; }
      const tag = (m.metadata?.gltf?.extras?.tv_part as string | undefined) ?? (m.parent as TransformNode | null)?.metadata?.gltf?.extras?.tv_part ?? 'part';
      this.parts.push({ mesh: m, tag, name: m.name.replace(`${name}.`, '') });
      m.isPickable = false;
    }
  }

  private captureRest(): void {
    if (!this.skeleton) return;
    const invModel = new Quaternion();
    const modelQ = this.model.absoluteRotationQuaternion ?? Quaternion.Identity();
    modelQ.conjugateToRef(invModel);
    const worldQ = (n: TransformNode): Quaternion => { n.computeWorldMatrix(true); const q = new Quaternion(); n.getWorldMatrix().decompose(undefined, q, undefined); return invModel.multiply(q).normalize(); };
    const byName = new Map<string, Bone>();
    for (const b of this.skeleton.bones) byName.set(b.name, b);
    for (const b of this.skeleton.bones) {
      const node = b.getTransformNode(); if (!node) continue;
      const parentBone = b.getParent();
      const parentNode = parentBone?.getTransformNode() ?? (node.parent as TransformNode | null);
      const rw = worldQ(node), rp = parentNode ? worldQ(parentNode) : Quaternion.Identity();
      node.rotationQuaternion ??= Quaternion.FromEulerVector(node.rotation);
      const wp = new Vector3(); node.getWorldMatrix().decompose(undefined, undefined, wp);
      const length = b.children.length ? Vector3.Distance(node.position, b.children[0].getTransformNode()?.position ?? node.position) : 0.1;
      this.bones.set(b.name, { name: b.name, node, parent: parentBone?.name ?? null, restLocal: node.rotationQuaternion.clone(), restWorld: rw, restParentWorld: rp, restPos: node.position.clone(), length, worldRestPos: wp });
    }
    void byName;
  }

  /** Reset all bones to rest. */
  rest(): void { for (const b of this.bones.values()) { b.node.rotationQuaternion!.copyFrom(b.restLocal); b.node.position.copyFrom(b.restPos); } }

  /** Set one bone's pose as a character-space rotation delta (identity = rest). */
  setBone(name: string, delta: Quaternion): void {
    const b = this.bones.get(name); if (!b) return;
    // local = R_parent^-1 * delta * R_bone
    const inv = this.scratchQ; b.restParentWorld.conjugateToRef(inv);
    inv.multiplyToRef(delta, this.world).multiplyToRef(b.restWorld, b.node.rotationQuaternion!);
  }
  has(name: string): boolean { return this.bones.has(name); }
  /** Move a bone by a character-space offset from rest (used for the pelvis). */
  offsetBone(name: string, offset: Vector3): void {
    const b = this.bones.get(name); if (!b) return;
    const inv = new Quaternion(); b.restParentWorld.conjugateToRef(inv);
    const local = new Vector3(); offset.rotateByQuaternionToRef(inv, local);
    b.node.position.copyFrom(b.restPos).addInPlace(local);
  }
  part(tag: string): KitPart[] { return this.parts.filter(p => p.tag === tag); }
  morphManager(): MorphTargetManager | null { for (const p of this.parts) { const mm = (p.mesh as Mesh).morphTargetManager; if (mm) return mm; } return null; }
  setMorph(name: string, value: number): void {
    for (const p of this.parts) { const mm = (p.mesh as Mesh).morphTargetManager; if (!mm) continue; for (let i = 0; i < mm.numTargets; i++) { const t = mm.getTarget(i); if (t.name === name) t.influence = value; } }
  }
  dispose(): void {
    for (const p of this.parts) p.mesh.dispose(false, true);
    this.skeleton?.dispose(); this.model.dispose(); this.root.dispose();
  }
}
