import { Quaternion, Vector3 } from '@babylonjs/core';
import type { ActorState } from './actorManager';
import { CharacterRig, Q } from './characterRig';
import type { Realization } from './appearanceMap';
import { combatPose, type CombatContext } from './combatPose';
import { armSwing, bodySway, legPose } from './gait';

/**
 * Procedural body animation for the people of the world.
 *
 * Nothing here is authoritative. It reads what the projection says a body is doing (its speed and
 * facing, posture, activity family and detail, whether it is speaking, its combat action and phase)
 * and poses bones to show it. Layers: locomotion and idle (always), posture (sit / kneel / lie),
 * activity (work, eat, talk, carry...), combat (from canonical phase timing), then secondary motion
 * (hair, tail, ears) and face (blink, mouth). Rotations are character-space deltas from the rest pose,
 * see CharacterRig.
 */
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Semantic rotation builders in model space (+Y up, +Z forward, +X the figure's left). */
const R = {
  /** Swing a hanging limb forward (+) or back (-). */
  fwd: (a: number) => Q.x(-a),
  /** Raise the left arm outward (+) / the right arm outward with `side = -1`. */
  out: (a: number, side: 1 | -1) => Q.z(a * side),
  /** Lean an upright segment forward (+). */
  lean: (a: number) => Q.x(a),
  /** Tilt an upright segment toward the figure's left (+). */
  tilt: (a: number) => Q.z(-a),
  /** Turn an upright segment toward the figure's left (+). */
  turn: (a: number) => Q.y(a),
};
const chain = Q.chain;

const BONES = [
  'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head',
  'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
  'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r',
  'fingers_01_l', 'fingers_01_r', 'thumb_01_l', 'thumb_01_r',
];

export interface ActorPoseState extends ActorState { lookAt?: Vector3 | null; speaking?: boolean; gesture?: number; combat?: CombatContext | null; hit?: number; guard?: boolean }

class PoseBuffer {
  readonly q = new Map<string, Quaternion>();
  readonly w = new Map<string, number>();
  pelvis = new Vector3();
  constructor() { for (const b of BONES) { this.q.set(b, Quaternion.Identity()); this.w.set(b, 0); } }
  clear(): void { for (const b of BONES) { this.q.get(b)!.copyFromFloats(0, 0, 0, 1); this.w.set(b, 0); } this.pelvis.set(0, 0, 0); }
  set(bone: string, q: Quaternion, w = 1): void { const t = this.q.get(bone); if (!t) return; t.copyFrom(q); this.w.set(bone, w); }
  /** Blend `other` over this pose by weight `k` per bone it touches. */
  over(other: PoseBuffer, k: number): void {
    for (const b of BONES) {
      const ow = (other.w.get(b) ?? 0) * k; if (ow <= 0) continue;
      const cur = this.q.get(b)!;
      Quaternion.SlerpToRef(cur, other.q.get(b)!, ow, cur);
      this.w.set(b, Math.max(this.w.get(b) ?? 0, ow));
    }
    this.pelvis.x = lerp(this.pelvis.x, other.pelvis.x, k * (other.w.get('pelvis') ?? 0));
    this.pelvis.y = lerp(this.pelvis.y, other.pelvis.y, k * (other.w.get('pelvis') ?? 0));
    this.pelvis.z = lerp(this.pelvis.z, other.pelvis.z, k * (other.w.get('pelvis') ?? 0));
  }
}

interface Spring { a: number; b: number; va: number; vb: number }

/** Carried items that need both arms; anything else is held in one hand. */
const TWO_HANDED = new Set(['log', 'plank', 'stone', 'grain', 'flour', 'wheat']);

export class Animator {
  private t = Math.random() * 10;
  private phase = 0;
  private moveW = 0;
  private runW = 0;
  private sitW = 0; private lieW = 0; private kneelW = 0; private crouchW = 0;
  private actW = 0;
  private actKind = '';
  private actT = 0;
  private lastVel = new Vector3(); private accel = new Vector3();
  private readonly base = new PoseBuffer(); private readonly layer = new PoseBuffer(); private readonly final = new PoseBuffer(); private readonly prev = new PoseBuffer();
  private blinkAt = 2 + Math.random() * 3; private blink = 0;
  private mouth = 0; private mouthT = 0;
  private lookYaw = 0; private lookPitch = 0;
  private readonly springs = new Map<string, Spring>();
  private readonly S: number;
  private hitK = 0;
  private lastYaw = 0; private yawRate = 0;
  private accelLean = 0; private bank = 0;
  private idleSide: 1 | -1 = Math.random() < 0.5 ? 1 : -1; private idleLeg = 0; private idleSwap = 2 + Math.random() * 6;
  private headTurn = 0; private headTilt = 0; private headPitch = 0;
  private readonly hasBone: (n: string) => boolean;
  constructor(private readonly rig: CharacterRig, readonly r: Realization) {
    this.S = r.heightScale;
    this.hasBone = n => rig.has(n);
    this.prev.clear();
    for (const b of BONES) this.prev.w.set(b, 1);
  }

  update(dt: number, s: ActorPoseState): void {
    dt = Math.min(dt, 0.1); this.t += dt;
    const rig = this.rig, S = this.S;
    const speed = s.speed, posture = s.body?.embodiment?.activity.posture ?? 'stand';
    let family = s.body?.embodiment?.activity.family ?? 'idle', detail = s.body?.embodiment?.activity.detail ?? '';
    // The simulation keeps a finished action on the body, so its activity can read "combat" long after the exchange ended.
    // Only a live action (s.combat), a hit, or a canonical attack/confront goal is a fighting stance; otherwise the body is at ease.
    if (family === 'combat' && !s.combat && !s.hit) {
      const ev = s.body?.embodiment?.activity.evidence;
      if (!ev || (ev.pose !== 'attack' && ev.pose !== 'hit' && ev.goal !== 'attack' && ev.goal !== 'confront')) { family = 'idle'; detail = ''; }
    }
    const dead = !!s.body?.dead, downed = detail === 'downed' || !!s.body?.incapacitated;
    // ── smoothing of the state machines ──────────────────────────────────────────────────────
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    const moving = speed > 0.12 && posture !== 'lie';
    this.moveW += ((moving ? 1 : 0) - this.moveW) * k(9);
    this.runW += ((speed > 2.4 ? 1 : 0) - this.runW) * k(6);
    this.sitW += ((posture === 'sit' ? 1 : 0) - this.sitW) * k(7);
    this.kneelW += ((posture === 'kneel' ? 1 : 0) - this.kneelW) * k(7);
    this.lieW += (((posture === 'lie' || dead || downed) ? 1 : 0) - this.lieW) * k(dead ? 3 : 6);
    this.crouchW += ((s.crouch > 0.05 ? s.crouch : 0) - this.crouchW) * k(14);
    this.accel.copyFromFloats((s.velocity.x - this.lastVel.x) / Math.max(dt, 1e-3), 0, (s.velocity.z - this.lastVel.z) / Math.max(dt, 1e-3)); this.lastVel.copyFromFloats(s.velocity.x, 0, s.velocity.z);
    this.yawRate += (wrapPi(s.yaw - this.lastYaw) / Math.max(dt, 1e-3) - this.yawRate) * k(8); this.lastYaw = s.yaw;

    // ── gait ─────────────────────────────────────────────────────────────────────────────────
    // Humans lengthen the stride and raise cadence together; running cadence settles near 170-180 steps a minute.
    const step = lerp(0.64, 1.5, sstep(1.2, 6.0, speed)) * S;                    // metres per step
    if (moving) this.phase = (this.phase + (speed / step) * Math.PI * dt) % TAU;
    const B = this.base; B.clear();
    const sp = sstep(0.2, 1.6, speed), sr = sstep(2.2, 5.6, speed);
    const walkAmp = this.moveW;
    const run = this.runW, amp = sstep(0.1, 1.3, speed) * walkAmp;
    const ph = this.phase, uL = ph / TAU, uR = uL + 0.5;
    const crouch = this.crouchW, cr = crouch * 1.05;
    // Weight shifts: forward accel leans the body into the step, braking sits it back, a turn banks it inward.
    const fa = this.accel.x * -Math.sin(s.yaw) + this.accel.z * -Math.cos(s.yaw);
    this.accelLean += (clamp(fa * 0.03, -0.14, 0.18) * this.moveW - this.accelLean) * k(4);
    this.bank += (clamp(-this.yawRate * speed * 0.018, -0.14, 0.14) - this.bank) * k(6);
    // Idle: weight rests on one leg and changes over every several seconds (contrapposto), never a statue-like double stance.
    const idleW = 1 - this.moveW;
    this.idleSwap -= dt; if (this.idleSwap <= 0) { this.idleSide = this.idleSide === 1 ? -1 : 1; this.idleSwap = 5 + Math.random() * 7; }
    this.idleLeg += (this.idleSide - this.idleLeg) * k(1.6);
    const rest = this.idleLeg * idleW * (1 - crouch);                         // + = weight on the left leg
    const pelvisLean = 0.07 * walkAmp + 0.05 * run + crouch * 0.28 + this.accelLean * 0.5;
    // legs, from the gait curves; a joint's local delta is relative to its parent's, so the foot is pitched to meet the ground.
    const legs = [['l', uL, 1, Math.max(0, -rest)], ['r', uR, -1, Math.max(0, rest)]] as const;
    for (const [sd, u, side, relaxed] of legs) {
      const g = legPose(u, run, amp);
      const hip = g.hip * walkAmp + cr * 0.75 + relaxed * 0.10, knee = g.knee * walkAmp + cr * 1.35 + relaxed * 0.22;
      B.set(`thigh_${sd}`, chain(R.fwd(hip), R.out(0.02 + 0.03 * cr + relaxed * 0.03, side)));
      B.set(`calf_${sd}`, Q.x(knee));
      const shank = pelvisLean - hip + knee;
      B.set(`foot_${sd}`, Q.x(g.foot * walkAmp - shank));
      B.set(`ball_${sd}`, Q.x(g.ball * walkAmp));
    }
    // pelvis: vertical bob, shift over the stance foot, swing-side drop, rotation with the forward leg.
    const sw = bodySway(uL, run, amp * walkAmp);
    B.pelvis.set(sw.x * S + rest * 0.028 * S, sw.y * S - crouch * 0.30 * S - Math.abs(rest) * 0.012 * S, crouch * -0.03 * S);
    B.set('pelvis', chain(R.turn(sw.pelvisTurn), R.tilt(sw.pelvisList - rest * 0.06 + this.bank * 0.4), R.lean(pelvisLean)));
    // spine: thorax counter-rotates the pelvis, leans into speed, and stays upright over a listing pelvis.
    const leanRun = 0.05 * sp + 0.22 * sr;
    const breath = Math.sin(this.t * 1.7) * 0.012;
    B.set('spine_01', chain(R.turn(sw.thoraxTurn * 0.25), R.tilt(-sw.pelvisList * 0.5 + rest * 0.035), R.lean(leanRun * 0.4 + crouch * 0.18 - pelvisLean * 0.35 + this.accelLean * 0.3)));
    B.set('spine_02', chain(R.turn(sw.thoraxTurn * 0.4), R.tilt(-sw.pelvisList * 0.35 + rest * 0.02 + this.bank * 0.3), R.lean(leanRun * 0.35 + crouch * 0.16 + this.accelLean * 0.2)));
    B.set('spine_03', chain(R.turn(sw.thoraxTurn * 0.35), R.lean(breath * idleW + leanRun * 0.25 + crouch * 0.1)));
    // The head is stabilised: it cancels most of the trunk's turn, list and bob so the gaze stays level.
    this.headTurn = -(sw.pelvisTurn + sw.thoraxTurn) * 0.85;
    this.headTilt = -(sw.pelvisList * 0.15 + rest * 0.055 + this.bank * 0.7);
    this.headPitch = -(pelvisLean * 0.65 + leanRun + this.accelLean * 0.5) * (1 - crouch * 0.5);
    // arms: swing opposite their leg with a slight lag; elbows bend through the forward swing and stay held in a run.
    const armOut = 0.10 + 0.05 * idleW;
    B.set('clavicle_l', R.out(0.03 * (1 - run), 1)); B.set('clavicle_r', R.out(0.03 * (1 - run), -1));
    for (const [sd, u, side] of [['l', uL, 1], ['r', uR, -1]] as const) {
      const a = armSwing(u, run, amp);
      const idleArm = side === 1 ? Math.max(0, rest) : Math.max(0, -rest);    // the arm over the relaxed hip hangs a touch further back
      B.set(`upperarm_${sd}`, chain(R.fwd(a.shoulder * walkAmp + 0.04 - idleArm * 0.04), R.out(-armOut - run * 0.06, side)));
      B.set(`lowerarm_${sd}`, Q.x(-(lerp(0.24, a.elbow, walkAmp)) - breath * 2));
      B.set(`hand_${sd}`, chain(R.fwd(0.0), R.out(0.05, side)));
      B.set(`fingers_01_${sd}`, Q.x(-0.35 - 0.3 * run)); B.set(`thumb_01_${sd}`, Q.x(-0.2));
    }

    // ── layers: posture, activity, combat ────────────────────────────────────────────────────
    const L = this.layer;
    // Sitting.
    if (this.sitW > 0.01) {
      L.clear();
      L.pelvis.set(0, -0.39 * S, 0.0);
      L.set('pelvis', chain(R.lean(0.06)));
      L.set('thigh_l', chain(R.fwd(1.50), R.out(0.10, 1))); L.set('thigh_r', chain(R.fwd(1.50), R.out(0.10, -1)));
      L.set('calf_l', Q.x(1.48)); L.set('calf_r', Q.x(1.48));
      L.set('foot_l', Q.x(-0.1)); L.set('foot_r', Q.x(-0.1));
      L.set('spine_01', R.lean(0.04)); L.set('spine_02', R.lean(0.05));
      L.set('upperarm_l', chain(R.fwd(0.28), R.out(-0.12, 1))); L.set('upperarm_r', chain(R.fwd(0.28), R.out(-0.12, -1)));
      L.set('lowerarm_l', Q.x(-0.95)); L.set('lowerarm_r', Q.x(-0.95));
      B.over(L, this.sitW);
    }
    if (this.kneelW > 0.01) {
      L.clear(); L.pelvis.set(0, -0.40 * S, -0.02 * S);
      L.set('pelvis', R.lean(0.04)); L.set('thigh_l', R.fwd(0.15)); L.set('thigh_r', R.fwd(0.15)); L.set('calf_l', Q.x(2.35)); L.set('calf_r', Q.x(2.35)); L.set('foot_l', Q.x(-0.9)); L.set('foot_r', Q.x(-0.9));
      L.set('spine_02', R.lean(0.12)); L.set('upperarm_l', chain(R.fwd(0.4), R.out(-0.1, 1))); L.set('upperarm_r', chain(R.fwd(0.4), R.out(-0.1, -1)));
      L.set('lowerarm_l', Q.x(-1.1)); L.set('lowerarm_r', Q.x(-1.1)); L.set('hand_l', R.out(0.2, 1)); L.set('hand_r', R.out(0.2, -1));
      B.over(L, this.kneelW);
    }
    // Activity.
    this.activity(B, L, s, family, detail, dt);
    // Injury: a limp and a hunch.
    const inj = s.body?.embodiment?.activity.injury;
    if (inj && inj.impaired && this.moveW > 0.05) {
      L.clear(); L.set('spine_02', chain(R.lean(0.10 * inj.severity + 0.04), R.tilt(0.05 * Math.sin(ph)))); L.pelvis.set(0, -0.02 * S * inj.severity, 0); L.set('pelvis', R.tilt(0.06 * Math.sin(ph) * inj.severity));
      B.over(L, this.moveW * Math.min(1, inj.severity * 1.5));
    }
    // Head look and speech.
    this.face(B, L, s, dt, k);
    // Combat (from the projected action's own phase timing).
    if (s.combat) {
      const w = combatPose(L, s.combat, S);
      B.over(L, w.weight); B.pelvis.x += w.pelvis.x; B.pelvis.y += w.pelvis.y; B.pelvis.z += w.pelvis.z;
    }
    // Being struck.
    if (s.hit) this.hitK = Math.max(this.hitK, s.hit);
    if (this.hitK > 0.01) {
      L.clear(); const h = this.hitK; L.set('spine_02', chain(R.lean(-0.22 * h), R.turn(0.12 * h))); L.set('spine_03', R.lean(-0.18 * h)); L.set('head', chain(R.lean(-0.25 * h), R.tilt(0.15 * h)));
      L.set('upperarm_l', chain(R.fwd(0.5 * h), R.out(0.4 * h, 1))); L.set('upperarm_r', chain(R.fwd(0.5 * h), R.out(0.4 * h, -1))); L.pelvis.set(0, -0.03 * S * h, 0.04 * S * h); L.set('pelvis', R.lean(-0.1 * h));
      B.over(L, Math.min(1, h * 1.3)); this.hitK *= Math.exp(-6 * dt);
    }
    // Downed / dead: collapse.
    if (this.lieW > 0.01 && (dead || downed)) {
      L.clear(); const seed = (this.r.materials.face.seed % 7) / 7 - 0.5;
      L.set('spine_02', R.lean(-0.1)); L.set('head', chain(R.turn(seed * 0.8), R.tilt(seed * 0.4)));
      L.set('upperarm_l', chain(R.fwd(0.2), R.out(0.5 + seed * 0.4, 1))); L.set('upperarm_r', chain(R.fwd(-0.2), R.out(0.5 - seed * 0.4, -1)));
      L.set('lowerarm_l', Q.x(-0.3)); L.set('lowerarm_r', Q.x(-0.5)); L.set('thigh_l', chain(R.fwd(0.1), R.out(0.15, 1))); L.set('thigh_r', chain(R.fwd(-0.1), R.out(0.3, -1)));
      B.over(L, this.lieW);
    }

    // ── apply with light smoothing ───────────────────────────────────────────────────────────
    const F = this.final; const sm = 1 - Math.exp(-26 * dt);
    for (const b of BONES) {
      const tq = B.q.get(b)!, pq = this.prev.q.get(b)!;
      Quaternion.SlerpToRef(pq, tq, sm, pq);
      if (this.hasBone(b)) rig.setBone(b, pq);
    }
    const pv = this.prev.pelvis; pv.x = lerp(pv.x, B.pelvis.x, sm); pv.y = lerp(pv.y, B.pelvis.y, sm); pv.z = lerp(pv.z, B.pelvis.z, sm);
    rig.offsetBone('pelvis', pv);
    void F;
    // Lying: the whole model rotates onto its back and rests on the ground (or the bed under it).
    this.applyLie();
    this.secondary(dt, s);
  }

  private applyLie(): void {
    const m = this.rig.model, w = this.lieW;
    if (w < 0.01) { m.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI); m.position.set(0, 0, 0); return; }
    const S = this.S;
    m.rotationQuaternion = Quaternion.Slerp(Quaternion.RotationAxis(Vector3.Up(), Math.PI), Quaternion.RotationAxis(Vector3.Right(), -Math.PI / 2), w);
    m.position.set(0, 0.16 * S * w, 0.86 * S * w * -1 * -1);
    // With the model turned onto its back the head points to the actor's forward (-Z) and the feet trail toward +Z.
    m.position.z = -0.86 * S * w * -1;
    m.position.z = 0.86 * S * w;
  }

  // ── activity layer ──────────────────────────────────────────────────────────────────────────
  private activity(B: PoseBuffer, L: PoseBuffer, s: ActorPoseState, family: string, detail: string, dt: number): void {
    const S = this.S, t = this.t;
    let kind = '';
    const grounded = this.moveW < 0.3 && this.sitW < 0.5 && this.lieW < 0.2;
    if (family === 'work' && grounded) kind = `work:${detail}`;
    else if (family === 'eat' || detail === 'sit_and_eat') kind = 'eat';
    else if (family === 'drink') kind = 'drink';
    else if (family === 'socialize' || family === 'trade' || detail === 'converse' || detail === 'sit_and_talk') kind = 'talk';
    else if (family === 'rest' && detail !== 'sleep' && grounded && this.sitW < 0.5) kind = 'rest';
    if (s.speaking && !kind) kind = 'talk';
    const carried = s.body?.embodiment?.activity.carried;
    const wantCarry = !!carried && this.moveW > 0.05 && !kind;
    this.actW += ((kind ? 1 : 0) - this.actW) * (1 - Math.exp(-6 * dt));
    if (kind && kind !== this.actKind) { this.actKind = kind; this.actT = 0; }
    this.actT += dt;
    if (this.actW < 0.01 && !wantCarry) return;
    L.clear();
    const p = this.actT, sw = Math.sin(p * 4.2), swf = Math.max(0, Math.sin(p * 4.2)), cyc = (p * 1.1) % 1;
    const arms = (fl: number, ol: number, el: number, fr: number, or: number, er: number) => {
      L.set('upperarm_l', chain(R.fwd(fl), R.out(ol, 1))); L.set('lowerarm_l', Q.x(-el)); L.set('upperarm_r', chain(R.fwd(fr), R.out(or, -1))); L.set('lowerarm_r', Q.x(-er));
    };
    const [family2, det] = kind.split(':');
    if (family2 === 'work') {
      switch (det) {
        case 'chop': { const up = Math.pow(Math.max(0, Math.sin(p * 3.4)), 2); arms(2.3 - 1.9 * (1 - up) * 0 + up * -0.2, 0.2, 0.9 + (1 - up) * 0.6, 2.2 + up * -0.2, -0.25, 0.9 + (1 - up) * 0.6); L.set('spine_02', R.lean(0.05 + 0.5 * (1 - up))); L.set('spine_03', R.lean(0.15 * (1 - up))); L.set('pelvis', R.lean(0.1)); L.pelvis.set(0, -0.06 * S * (1 - up), 0); L.set('thigh_l', R.fwd(0.25)); L.set('thigh_r', R.fwd(-0.15)); L.set('calf_l', Q.x(0.3)); L.set('calf_r', Q.x(0.12)); break; }
        case 'harvest': case 'gather': case 'plant': case 'tend': {
          const bendA = 0.62 + 0.14 * Math.sin(p * 2.2); arms(0.7 + 0.3 * sw, 0.16, 0.5, 0.5 - 0.3 * sw, 0.16, 0.5);
          L.set('spine_01', R.lean(bendA * 0.5)); L.set('spine_02', R.lean(bendA * 0.5)); L.set('pelvis', R.lean(0.2)); L.pelvis.set(0, -0.10 * S, -0.06 * S); L.set('thigh_l', R.fwd(0.5)); L.set('thigh_r', R.fwd(0.35)); L.set('calf_l', Q.x(0.62)); L.set('calf_r', Q.x(0.5)); L.set('head', R.lean(-0.35)); break; }
        case 'forge': case 'craft': case 'repair': { const hit = Math.pow(Math.max(0, Math.sin(p * 4.5)), 3); arms(1.1 - 0.7 * hit + 0.6, 0.18, 1.2 - 0.3 * hit, 0.9, -0.1, 1.4); L.set('spine_02', R.lean(0.22 + 0.06 * hit)); L.set('head', R.lean(-0.2)); L.set('pelvis', R.lean(0.06)); break; }
        case 'bake': case 'mill': case 'serve': case 'record': case 'inspect': case 'operate': arms(0.9 + 0.2 * sw, 0.16, 1.1 + 0.2 * Math.sin(p * 2), 0.8 - 0.2 * sw, 0.16, 1.2); L.set('spine_02', R.lean(0.14)); L.set('head', R.lean(-0.18 + 0.05 * Math.sin(p))); break;
        case 'haul': arms(0.9, 0.06, 1.2, 0.9, 0.06, 1.2); L.set('spine_02', R.lean(-0.08)); break;
        default: arms(0.7, 0.14, 0.9, 0.7, 0.14, 0.9); L.set('spine_02', R.lean(0.1));
      }
    } else if (kind === 'eat') {
      const bite = Math.pow(Math.max(0, Math.sin(p * 1.6)), 2); arms(0.5 + bite * 1.0, 0.15, 0.9 + bite * 1.5, 0.4, 0.15, 0.9); L.set('head', R.lean(-0.06 * bite));
    } else if (kind === 'drink') {
      const tip = Math.min(1, p * 1.2) * (0.5 + 0.5 * Math.sin(p * 0.8)); arms(0.6 + tip * 1.1, 0.12, 1.0 + tip * 1.3, 0.3, 0.14, 0.7); L.set('head', R.lean(0.2 * tip));
    } else if (kind === 'talk') {
      const g = s.gesture ?? 0.5, a1 = Math.sin(p * 2.3) * g, a2 = Math.sin(p * 1.7 + 1.3) * g;
      arms(0.5 + 0.35 * Math.max(0, a1), 0.2 + 0.1 * a2, 0.9 + 0.4 * a1, 0.35 + 0.25 * Math.max(0, a2), 0.22, 0.9 + 0.3 * a2); L.set('spine_03', chain(R.turn(0.05 * a2), R.lean(0.02))); L.set('hand_l', Q.x(-0.15 * a1));
    } else if (kind === 'rest') {
      arms(0.15, 0.2, 0.3, 0.15, 0.2, 0.3); L.set('spine_02', R.lean(0.08));
    } else if (wantCarry) {
      if (TWO_HANDED.has(String(carried))) { arms(0.65, 0.05, 1.5, 0.65, 0.05, 1.5); L.set('spine_02', R.lean(-0.05)); }
      else { L.set('upperarm_r', chain(R.fwd(0.26), R.out(0.06, -1))); L.set('lowerarm_r', Q.x(-0.8)); }   // a lantern, tool or loaf hangs from one hand; the other arm keeps swinging
      B.over(L, this.moveW); return;
    }
    B.over(L, this.actW);
  }

  // ── head, eyes, mouth ───────────────────────────────────────────────────────────────────────
  private face(B: PoseBuffer, L: PoseBuffer, s: ActorPoseState, dt: number, k: (r: number) => number): void {
    // Look toward a target, limited to a natural range and spread between neck and head.
    let ty = 0, tp = 0;
    if (s.lookAt) {
      const root = this.rig.root, dx = s.lookAt.x - root.position.x, dz = s.lookAt.z - root.position.z, dy = s.lookAt.y - (root.position.y + 1.55 * this.S);
      const yawWorld = Math.atan2(-dx, -dz), rel = wrapPi(yawWorld - root.rotation.y);
      ty = clamp(rel, -1.25, 1.25) * (Math.abs(rel) > 2.6 ? 0 : 1); tp = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.45, 0.45);
    } else if (this.moveW < 0.3) { ty = Math.sin(this.t * 0.37) * 0.25 + Math.sin(this.t * 0.91) * 0.1; tp = Math.sin(this.t * 0.53) * 0.06; }
    this.lookYaw += (ty - this.lookYaw) * k(5); this.lookPitch += (tp - this.lookPitch) * k(6);
    L.clear(); L.set('neck_01', chain(R.turn(this.lookYaw * 0.35 + this.headTurn * 0.4), R.lean(this.lookPitch * 0.35 + this.headPitch * 0.4))); L.set('head', chain(R.turn(this.lookYaw * 0.65 + this.headTurn * 0.6), R.tilt(this.headTilt), R.lean(this.lookPitch * 0.65 + this.headPitch * 0.6 + 0.03 * Math.sin(this.t * 1.3))));
    B.over(L, 1);
    // Blink.
    this.blinkAt -= dt; if (this.blinkAt <= 0 && this.blink <= 0) { this.blink = 1; this.blinkAt = 2.2 + Math.random() * 4.5; }
    if (this.blink > 0) { this.blink -= dt * 7.5; } const bl = this.blink > 0 ? Math.sin(Math.min(1, 1 - this.blink + 0.001) * Math.PI) : 0;
    // Mouth.
    if (s.speaking) { this.mouthT += dt * 9; this.mouth += ((0.25 + 0.55 * Math.abs(Math.sin(this.mouthT) * Math.sin(this.mouthT * 0.37 + 1))) - this.mouth) * k(20); }
    else this.mouth += (0 - this.mouth) * k(12);
    this.rig.setMorph('blink', bl); this.rig.setMorph('mouth_open', this.mouth);
  }

  // ── secondary motion: hair, tail, ears ──────────────────────────────────────────────────────
  private secondary(dt: number, s: ActorPoseState): void {
    const rig = this.rig;
    // Inertia in the character's frame: turn world acceleration into local back/side.
    const yaw = s.yaw, c = Math.cos(yaw), sn = Math.sin(yaw);
    const ax = this.accel.x, az = this.accel.z;
    const fwdA = -(ax * -sn + az * -c) * 0.0 + (ax * (-sn) + az * (-c)), sideA = ax * c - az * sn;
    const wind = 0.0, sway = (idx: number, amp: number) => Math.sin(this.t * 1.7 + idx * 0.9) * amp;
    const move = clamp(s.speed / 4, 0, 1);
    const chainNames = ['hair_l', 'hair_b', 'hair_r', 'tail', 'ear_l', 'ear_r'];
    for (const nm of chainNames) {
      const count = nm === 'tail' ? 6 : nm.startsWith('ear') ? 2 : 3;
      for (let i = 1; i <= count; i++) {
        const bone = nm === 'tail' ? `tail_${String(i).padStart(2, '0')}` : nm.startsWith('ear') ? `${nm}_${String(i).padStart(2, '0')}` : `${nm}_${String(i).padStart(2, '0')}`;
        if (!rig.has(bone)) continue;
        const key = bone; let sp = this.springs.get(key); if (!sp) this.springs.set(key, sp = { a: 0, b: 0, va: 0, vb: 0 });
        const lagDepth = i / count;
        const targetA = clamp(-fwdA * 0.012, -0.5, 0.5) * lagDepth + move * 0.25 * lagDepth + sway(i, 0.05 * lagDepth);
        const targetB = clamp(sideA * 0.012, -0.5, 0.5) * lagDepth + sway(i + 3, 0.06 * lagDepth) + this.yawRate * -0.03 * lagDepth;
        const kSpring = nm === 'tail' ? 34 : nm.startsWith('ear') ? 90 : 55, damp = nm === 'tail' ? 6 : 9;
        sp.va += ((targetA - sp.a) * kSpring - sp.va * damp) * dt; sp.a += sp.va * dt;
        sp.vb += ((targetB - sp.b) * kSpring - sp.vb * damp) * dt; sp.b += sp.vb * dt;
        rig.setBone(bone, chain(Q.x(sp.a), Q.z(sp.b)));
      }
    }
    void wind;
  }
}
