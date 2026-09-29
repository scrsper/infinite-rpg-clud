import { Color3, Mesh, MeshBuilder, PBRMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { Atmosphere } from '../world/atmosphere';
import type { RegionManager } from '../world/regionManager';
import type { RenderContext } from '../render/engine';
import type { BodyState, SnapshotMessage, Vec3, WildlifeBody } from '../net/messages';

/**
 * Every visible body (people, wildlife) as a scene actor. This layer owns motion smoothing and
 * lifetime; what an actor looks like is delegated to a `BodyVisual` created by the visual factory.
 * Server state arrives a few times per second, so remote bodies are drawn slightly extrapolated
 * along their reported velocity and eased toward each new sample; the player's own body is drawn
 * from the predictor, never from the server sample.
 */
export interface BodyVisual {
  /** Root node; the manager positions and turns it. */
  root: TransformNode;
  /** Called every frame with the smoothed state; the visual poses itself. */
  update(dt: number, state: ActorState): void;
  /** Height of the head above the root, for name plates and bubbles. */
  headHeight: number;
  dispose(): void;
}
export interface ActorState {
  bodyId: string; own: boolean; kind: 'person' | 'wildlife';
  body?: BodyState; wildlife?: WildlifeBody;
  speed: number; velocity: Vec3; yaw: number; crouch: number; age: number;
}
export type VisualFactory = (ctx: RenderContext, atmosphere: Atmosphere, actor: { kind: 'person' | 'wildlife'; body?: BodyState; wildlife?: WildlifeBody }) => BodyVisual;

interface Actor {
  id: string; kind: 'person' | 'wildlife'; visual: BodyVisual; pos: Vector3; targetPos: Vector3; yaw: number; targetYaw: number; vel: Vec3; lastSeen: number; body?: BodyState; wildlife?: WildlifeBody; own: boolean; crouch: number; stampMs: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function placeholderVisual(ctx: RenderContext, atmosphere: Atmosphere, a: { kind: 'person' | 'wildlife'; body?: BodyState; wildlife?: WildlifeBody }): BodyVisual {
  const root = new TransformNode('actor', ctx.scene);
  const mat = new PBRMaterial('actor-mat', ctx.scene), c = a.body?.appearance;
  const col = (n: number | undefined, d: number) => { const v = n ?? d; return new Color3(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255); };
  mat.albedoColor = a.kind === 'person' ? col(c?.shirt, 0x808080) : new Color3(0.4, 0.3, 0.2); mat.roughness = 0.8; mat.metallic = 0;
  const height = a.kind === 'person' ? 1.7 * (c?.height ?? 1) : (a.wildlife?.bodyPlan.heightM ?? 1);
  const body = MeshBuilder.CreateCapsule('actor-body', { height, radius: a.kind === 'person' ? 0.28 : (a.wildlife?.bodyPlan.radiusM ?? 0.4) }, ctx.scene);
  body.material = mat; body.parent = root; body.position.y = height / 2; atmosphere.addCaster(body);
  return { root, headHeight: height + 0.15, update() { /* static placeholder */ }, dispose() { body.dispose(); mat.dispose(); root.dispose(); } };
}

export class ActorManager {
  private readonly actors = new Map<string, Actor>();
  factory: VisualFactory = placeholderVisual;
  constructor(private readonly ctx: RenderContext, private readonly atmosphere: Atmosphere, private readonly regions: RegionManager) {}

  get count(): number { return this.actors.size; }
  get(id: string): Actor | undefined { return this.actors.get(id); }
  all(): IterableIterator<Actor> { return this.actors.values(); }

  /** Apply a snapshot. `ownBodyId` is drawn from the predictor, not from this sample. */
  sync(s: SnapshotMessage, ownBodyId: string, nowMs: number): void {
    const seen = new Set<string>();
    for (const b of s.bodies) {
      if (!b.alive && b.alive !== undefined && false) continue;
      seen.add(b.bodyId);
      let a = this.actors.get(b.bodyId);
      if (!a) a = this.create(b.bodyId, 'person', b, undefined, b.bodyId === ownBodyId, b.pos, b.yaw);
      a.body = b; a.own = b.bodyId === ownBodyId; a.vel = b.velocity; a.stampMs = nowMs; a.lastSeen = nowMs;
      a.targetPos.set(b.pos.x, b.pos.y, b.pos.z); a.targetYaw = b.yaw;
    }
    for (const w of s.wildlife.bodies) {
      if (!w.present) continue;
      seen.add(w.bodyId);
      let a = this.actors.get(w.bodyId);
      if (!a) a = this.create(w.bodyId, 'wildlife', undefined, w, false, w.pos, w.yaw);
      a.wildlife = w; a.vel = w.vel; a.stampMs = nowMs; a.lastSeen = nowMs; a.targetPos.set(w.pos.x, w.pos.y, w.pos.z); a.targetYaw = w.yaw;
    }
    for (const [id, a] of this.actors) if (!seen.has(id)) this.remove(id, a);
  }
  private create(id: string, kind: 'person' | 'wildlife', body: BodyState | undefined, wildlife: WildlifeBody | undefined, own: boolean, pos: Vec3, yaw: number): Actor {
    const visual = this.factory(this.ctx, this.atmosphere, { kind, body, wildlife });
    const a: Actor = { id, kind, visual, pos: new Vector3(pos.x, pos.y, pos.z), targetPos: new Vector3(pos.x, pos.y, pos.z), yaw, targetYaw: yaw, vel: { x: 0, y: 0, z: 0 }, lastSeen: 0, body, wildlife, own, crouch: 0, stampMs: 0 };
    this.actors.set(id, a); return a;
  }
  private remove(id: string, a: Actor): void { a.visual.dispose(); this.actors.delete(id); }
  clear(): void { for (const [id, a] of this.actors) this.remove(id, a); }

  /** `own` supplies the predicted state for the controlled body. */
  update(dt: number, nowMs: number, own: { bodyId: string; pos: Vec3; yaw: number; crouch: number } | null): void {
    const k = 1 - Math.exp(-14 * dt);
    for (const a of this.actors.values()) {
      const age = Math.max(0, Math.min(0.18, (nowMs - a.stampMs) / 1000));
      if (own && a.id === own.bodyId) { a.pos.set(own.pos.x, own.pos.y, own.pos.z); a.yaw = own.yaw; a.crouch = own.crouch; }
      else {
        const tx = a.targetPos.x + a.vel.x * age, ty = a.targetPos.y, tz = a.targetPos.z + a.vel.z * age;
        if (Math.hypot(tx - a.pos.x, tz - a.pos.z) > 8) a.pos.set(tx, ty, tz); else { a.pos.x += (tx - a.pos.x) * k; a.pos.y += (ty - a.pos.y) * k; a.pos.z += (tz - a.pos.z) * k; }
        a.yaw = a.yaw + wrap(a.targetYaw - a.yaw) * (1 - Math.exp(-10 * dt));
        a.crouch = a.body?.crouch ?? 0;
      }
      const r = a.visual.root; this.regions.toRender(a.pos as unknown as Vec3, r.position); r.rotation.y = a.yaw;
      const speed = Math.hypot(a.vel.x, a.vel.z);
      a.visual.update(dt, { bodyId: a.id, own: !!own && a.id === own.bodyId, kind: a.kind, body: a.body, wildlife: a.wildlife, speed, velocity: a.vel, yaw: a.yaw, crouch: a.crouch, age });
    }
  }
  /** Render-space head position, for plates and bubbles. */
  headPoint(id: string, out = new Vector3()): Vector3 | null {
    const a = this.actors.get(id); if (!a) return null;
    return out.set(a.visual.root.position.x, a.visual.root.position.y + a.visual.headHeight, a.visual.root.position.z);
  }
  dispose(): void { this.clear(); }
}
export type { Actor };
