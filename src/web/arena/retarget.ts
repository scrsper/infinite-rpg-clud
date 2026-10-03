import { Animation, AnimationGroup, Matrix, Quaternion, Vector3, type TransformNode } from '@babylonjs/core';

/**
 * Retarget KayKit combat clips onto the Torn Veil human kit skeleton (UE-mannequin naming).
 *
 * Per sampled frame, each mapped source bone's model-space rotation change from its rest pose is
 * applied to the matching target bone. The target rest is first swung so each bone points where the
 * source bone points at rest (handles T-pose vs A-pose rest differences). Bones the source lacks are
 * blended from neighbours (spine_02, neck) or follow their parent (clavicles follow the chest).
 * The hips' travel is rescaled by the ratio of hip heights. Output: shared Animation tracks keyed
 * by target bone name, instantiated per person as AnimationGroups.
 */
type Rig = { space: TransformNode; nodes: Map<string, TransformNode> };

// [source bone, target bone, source child (direction), target child (direction)]
const MAP: [string, string, string | null, string | null][] = [
  ['hips', 'pelvis', 'spine', 'spine_01'],
  ['spine', 'spine_01', 'chest', 'spine_03'],
  ['chest', 'spine_03', 'head', 'neck_01'],
  ['head', 'head', null, null],
  ['upperarm.l', 'upperarm_l', 'lowerarm.l', 'lowerarm_l'], ['lowerarm.l', 'lowerarm_l', 'wrist.l', 'hand_l'], ['wrist.l', 'hand_l', 'hand.l', 'middle_01_l'],
  ['upperarm.r', 'upperarm_r', 'lowerarm.r', 'lowerarm_r'], ['lowerarm.r', 'lowerarm_r', 'wrist.r', 'hand_r'], ['wrist.r', 'hand_r', 'hand.r', 'middle_01_r'],
  ['upperleg.l', 'thigh_l', 'lowerleg.l', 'calf_l'], ['lowerleg.l', 'calf_l', 'foot.l', 'foot_l'], ['foot.l', 'foot_l', 'toes.l', 'ball_l'],
  ['upperleg.r', 'thigh_r', 'lowerleg.r', 'calf_r'], ['lowerleg.r', 'calf_r', 'foot.r', 'foot_r'], ['foot.r', 'foot_r', 'toes.r', 'ball_r'],
];
const BLEND: [string, string, string][] = [['spine_02', 'spine_01', 'spine_03'], ['neck_01', 'spine_03', 'head']];
const FOLLOW: [string, string][] = [['clavicle_l', 'spine_03'], ['clavicle_r', 'spine_03']];
export const KEYED = [...MAP.map(m => m[1]), ...BLEND.map(b => b[0]), ...FOLLOW.map(f => f[0])];

export interface ClipTemplate { name: string; frames: number; tracks: { bone: string; anim: Animation }[] }
export interface Grip { rot: Quaternion; pos: Vector3; scale: number }

const conj = (q: Quaternion) => Quaternion.Inverse(q);
function modelRot(rig: Rig, n: TransformNode): Quaternion {
  const q = new Quaternion(); n.getWorldMatrix().decompose(undefined, q, undefined);
  const s = new Quaternion(); rig.space.getWorldMatrix().decompose(undefined, s, undefined);
  return conj(s).multiply(q).normalize();
}
function modelPos(rig: Rig, n: TransformNode): Vector3 {
  const inv = rig.space.getWorldMatrix().clone().invert();
  return Vector3.TransformCoordinates(n.getAbsolutePosition(), inv);
}
function refresh(rig: Rig): void {
  rig.space.computeWorldMatrix(true);
  const depth = (n: TransformNode) => { let d = 0, p = n.parent; while (p) { d++; p = p.parent; } return d; };
  for (const n of [...rig.nodes.values()].sort((a, b) => depth(a) - depth(b))) n.computeWorldMatrix(true);
}
function rotFromTo(a: Vector3, b: Vector3): Quaternion {
  const u = a.normalizeToNew(), v = b.normalizeToNew(), d = Vector3.Dot(u, v);
  if (d > .9999) return Quaternion.Identity();
  if (d < -.9999) { let ax = Vector3.Cross(Vector3.Right(), u); if (ax.lengthSquared() < 1e-6) ax = Vector3.Cross(Vector3.Up(), u); return Quaternion.RotationAxis(ax.normalize(), Math.PI); }
  return Quaternion.RotationAxis(Vector3.Cross(u, v).normalize(), Math.acos(d));
}

export class Retargeter {
  private sRest = new Map<string, { q: Quaternion; p: Vector3; local: { r: Quaternion | null; p: Vector3; s: Vector3 } }>();
  private tRest = new Map<string, { q: Quaternion; p: Vector3; localQ: Quaternion }>();
  private corr = new Map<string, Quaternion>();
  private hipScale = 1;
  private tParentOfPelvis: TransformNode | null;
  private tParent = new Map<string, string | undefined>();

  constructor(private readonly src: Rig, private readonly tgt: Rig) {
    refresh(src); refresh(tgt);
    for (const [n, node] of src.nodes) {
      node.rotationQuaternion ??= Quaternion.FromEulerVector(node.rotation);
      this.sRest.set(n, { q: modelRot(src, node), p: modelPos(src, node), local: { r: node.rotationQuaternion.clone(), p: node.position.clone(), s: node.scaling.clone() } });
    }
    for (const [n, node] of tgt.nodes) {
      node.rotationQuaternion ??= Quaternion.FromEulerVector(node.rotation);
      this.tRest.set(n, { q: modelRot(tgt, node), p: modelPos(tgt, node), localQ: node.rotationQuaternion.clone() });
    }
    for (const [s, t, sc, tc] of MAP) {
      if (!sc || !tc || !src.nodes.has(sc) || !tgt.nodes.has(tc)) { this.corr.set(t, Quaternion.Identity()); continue; }
      const ds = this.sRest.get(sc)!.p.subtract(this.sRest.get(s)!.p), dt = this.tRest.get(tc)!.p.subtract(this.tRest.get(t)!.p);
      this.corr.set(t, rotFromTo(dt, ds));
    }
    const byNode = new Map([...tgt.nodes].map(([k, v]) => [v, k] as const));
    for (const [n, node] of tgt.nodes) this.tParent.set(n, node.parent ? byNode.get(node.parent as TransformNode) : undefined);
    this.hipScale = this.tRest.get('pelvis')!.p.y / Math.max(1e-3, this.sRest.get('hips')!.p.y);
    this.tParentOfPelvis = (tgt.nodes.get('pelvis')!.parent as TransformNode) ?? null;
  }

  private resetSource(): void {
    for (const [n, r] of this.sRest) { const node = this.src.nodes.get(n)!; if (r.local.r) node.rotationQuaternion!.copyFrom(r.local.r); node.position.copyFrom(r.local.p); node.scaling.copyFrom(r.local.s); }
  }

  /** Bake one source clip into target-bone tracks at the source frame rate. */
  bake(name: string, g: AnimationGroup): ClipTemplate {
    const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 30;
    const frames = Math.max(1, Math.round(g.to - g.from) + 1);
    const keys = new Map<string, { frame: number; value: Quaternion }[]>(KEYED.map(k => [k, []]));
    const pelvisKeys: { frame: number; value: Vector3 }[] = [];
    const parentInv = this.tParentOfPelvis ? this.tParentOfPelvis.computeWorldMatrix(true).clone().multiply(this.tgt.space.getWorldMatrix().clone().invert()).invert() : Matrix.Identity();
    for (let i = 0; i < frames; i++) {
      this.resetSource();
      const f = g.from + i;
      for (const ta of g.targetedAnimations) { const t = ta.target as Record<string, unknown>; t[ta.animation.targetProperty] = ta.animation.evaluate(f); }
      refresh(this.src);
      const delta = new Map<string, Quaternion>();
      for (const [s, t] of MAP) {
        const sn = this.src.nodes.get(s); if (!sn || !this.tgt.nodes.has(t)) continue;
        delta.set(t, modelRot(this.src, sn).multiply(conj(this.sRest.get(s)!.q)));
      }
      for (const [b, a, c] of BLEND) if (delta.has(a) && delta.has(c)) delta.set(b, Quaternion.Slerp(delta.get(a)!, delta.get(c)!, .5));
      for (const [b, p] of FOLLOW) if (delta.has(p)) delta.set(b, delta.get(p)!.clone());
      // Desired model-space rotations, then locals in hierarchy order.
      const world = new Map<string, Quaternion>();
      const want = (bone: string): Quaternion => {
        if (world.has(bone)) return world.get(bone)!;
        const d = delta.get(bone);
        const rest = this.tRest.get(bone)!;
        let w: Quaternion;
        if (d) w = d.multiply(this.corr.get(bone) ?? Quaternion.Identity()).multiply(rest.q);
        else { const pn = this.tParent.get(bone); w = (pn ? want(pn) : this.parentRest(bone)).multiply(rest.localQ); }
        world.set(bone, w); return w;
      };
      for (const bone of KEYED) {
        if (!this.tgt.nodes.has(bone) || !delta.has(bone)) continue;
        const pn = this.tParent.get(bone);
        const pw = pn ? want(pn) : this.parentRest(bone);
        keys.get(bone)!.push({ frame: i, value: conj(pw).multiply(want(bone)).normalize() });
      }
      const hs = modelPos(this.src, this.src.nodes.get('hips')!).subtract(this.sRest.get('hips')!.p).scale(this.hipScale);
      const tp = this.tRest.get('pelvis')!.p.add(hs);
      pelvisKeys.push({ frame: i, value: Vector3.TransformCoordinates(tp, parentInv) });
    }
    this.resetSource(); refresh(this.src);
    const tracks: ClipTemplate['tracks'] = [];
    for (const [bone, k] of keys) {
      if (!k.length) continue;
      const a = new Animation(`${name}.${bone}`, 'rotationQuaternion', fps, Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE);
      a.setKeys(k); tracks.push({ bone, anim: a });
    }
    const p = new Animation(`${name}.pelvis.pos`, 'position', fps, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CYCLE);
    p.setKeys(pelvisKeys); tracks.push({ bone: 'pelvis', anim: p });
    return { name, frames, tracks };
  }

  /** Model-space rest rotation of a target bone's parent (for bones whose parent is outside the map). */
  private parentRest(bone: string): Quaternion {
    const parent = this.tgt.nodes.get(bone)!.parent as TransformNode | null;
    if (!parent) return Quaternion.Identity();
    parent.computeWorldMatrix(true);
    return modelRot(this.tgt, parent);
  }

  /** Where a source hand slot sits relative to the target hand, so weapons keep the source grip. */
  grip(srcHand: string, srcSlot: string, tgtHand: string, tgtChild: string): Grip {
    const sh = this.sRest.get(srcHand)!, ss = this.sRest.get(srcSlot)!, th = this.tRest.get(tgtHand)!;
    const c = this.corr.get(tgtHand) ?? Quaternion.Identity();
    const frame = c.multiply(th.q);
    const rot = conj(frame).multiply(ss.q).normalize();
    const sLen = Vector3.Distance(sh.p, this.sRest.get(srcHand.replace('wrist', 'hand'))?.p ?? sh.p) || .1;
    const tLen = Vector3.Distance(th.p, this.tRest.get(tgtChild)?.p ?? th.p) || .1;
    const off = ss.p.subtract(sh.p).scale(tLen / sLen);
    const handNode = this.tgt.nodes.get(tgtHand)!;
    const ws = new Vector3(); handNode.getWorldMatrix().decompose(ws); const ss2 = new Vector3(); this.tgt.space.getWorldMatrix().decompose(ss2);
    const scale = ws.x / ss2.x;
    const pos = off.applyRotationQuaternion(conj(frame)).scale(1 / scale);
    return { rot, pos, scale };
  }
}

/** Instantiate baked clips on one person's bone nodes. */
export function instantiateClips(tag: string, clips: Map<string, ClipTemplate>, nodes: Map<string, TransformNode>, scene: import('@babylonjs/core').Scene): Map<string, AnimationGroup> {
  const out = new Map<string, AnimationGroup>();
  for (const [name, c] of clips) {
    const g = new AnimationGroup(`${tag}.${name}`, scene);
    for (const t of c.tracks) { const n = nodes.get(t.bone); if (n) g.addTargetedAnimation(t.anim, n); }
    g.normalize(0, c.frames - 1);
    out.set(name, g);
  }
  return out;
}
