import { Color4, FreeCamera, RenderTargetTexture, Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';
import type { ActorManager } from '../actors/actorManager';
import type { CharacterRig } from '../actors/characterRig';
import type { PortraitSource } from './dialoguePanel';

export interface PortraitCameraPlan {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  distance: number;
  fov: number;
}

export function portraitCameraPlanFromBasis(center: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number }, right: { x: number; y: number; z: number }, bodyHeight: number): PortraitCameraPlan {
  const h = Math.max(0.8, bodyHeight);
  const distance = Math.max(1.35, h * 0.92);
  const targetY = center.y - h * 0.075;
  const side = h * 0.055;
  const fl = Math.hypot(forward.x, forward.z) || 1, rl = Math.hypot(right.x, right.z) || 1;
  return {
    position: { x: center.x + forward.x / fl * distance + right.x / rl * side, y: targetY + h * 0.025, z: center.z + forward.z / fl * distance + right.z / rl * side },
    target: { x: center.x, y: targetY, z: center.z },
    distance,
    fov: 0.62,
  };
}

/**
 * Stable bust framing for the Babylon character convention.
 *
 * CharacterRig turns the authored +Z model around once, so a character's
 * world-forward direction is the same -sin(yaw), -cos(yaw) vector used by
 * ActorManager. Keeping this calculation pure makes the framing contract
 * testable without booting a WebGPU scene.
 */
export function portraitCameraPlan(root: { x: number; y: number; z: number }, yaw: number, bodyHeight: number, eyeHeight: number): PortraitCameraPlan {
  const forwardX = -Math.sin(yaw), forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
  const h = Math.max(0.8, bodyHeight);
  return portraitCameraPlanFromBasis({ x: root.x, y: root.y + eyeHeight, z: root.z }, { x: forwardX, y: 0, z: forwardZ }, { x: rightX, y: 0, z: rightZ }, h);
}

export function portraitMeshes(root: { getChildMeshes(directDescendantsOnly?: boolean): AbstractMesh[] }): AbstractMesh[] {
  return root.getChildMeshes(false);
}

/**
 * A live bust portrait of whoever is speaking, rendered from the scene itself: a small render-target
 * pass that draws only that person's meshes from a portrait camera, copied into the dialogue's canvas a
 * few times a second (so blinks and speech show). It reads the same actor the world shows, never a
 * separate copy, and stops the moment the conversation ends.
 */
export class PortraitRenderer implements PortraitSource {
  private readonly rtt: RenderTargetTexture;
  private readonly camera: FreeCamera;
  private active: { canvas: HTMLCanvasElement; bodyId: string | null; ctx: CanvasRenderingContext2D; busy: boolean } | null = null;
  private acc = 0;
  private readonly size = { w: 320, h: 400 };
  constructor(private readonly scene: Scene, private readonly actors: ActorManager) {
    this.rtt = new RenderTargetTexture('portrait', { width: this.size.w, height: this.size.h }, scene, { generateMipMaps: false, generateDepthBuffer: true, doNotChangeAspectRatio: false, type: 0 });
    this.rtt.clearColor = new Color4(0.09, 0.11, 0.16, 1);
    this.rtt.noPrePassRenderer = true;
    this.rtt.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME; this.rtt.skipInitialClear = false;
    this.camera = new FreeCamera('portrait-cam', new Vector3(0, 1.6, 2), scene); this.camera.fov = 0.62; this.camera.minZ = 0.05; this.camera.maxZ = 8; this.camera.parent = null;
    this.rtt.activeCamera = this.camera;
  }

  attach(canvas: HTMLCanvasElement, bodyId: string | null, _name: string): () => void {
    const ctx = canvas.getContext('2d'); if (!ctx) return () => undefined;
    canvas.width = this.size.w; canvas.height = this.size.h;
    this.active = { canvas, bodyId, ctx, busy: false }; this.acc = 1;
    if (!this.scene.customRenderTargets.includes(this.rtt)) this.scene.customRenderTargets.push(this.rtt);
    return () => { if (this.active?.canvas === canvas) { this.active = null; this.rtt.renderList = []; const i = this.scene.customRenderTargets.indexOf(this.rtt); if (i >= 0) this.scene.customRenderTargets.splice(i, 1); } };
  }

  /** Call every frame; renders and copies at ~8 Hz. */
  update(dt: number): void {
    const a = this.active; if (!a || !a.bodyId) return;
    this.acc += dt; if (this.acc < 0.12 || a.busy) return; this.acc = 0;
    const actor = this.actors.get(a.bodyId); if (!actor) return;
    const root = actor.visual.root, head = this.actors.headPoint(a.bodyId, new Vector3()); if (!head) return;
    const vis = actor.visual as unknown as { bodyHeight?: number; rig?: CharacterRig }, bh = vis.bodyHeight ?? actor.visual.headHeight - 0.18;
    // The work, crouch and conversation poses move the head away from its rest
    // height. Frame the posed rig rather than aiming above a bent character.
    const headNode = vis.rig?.bones.get('head')?.node;
    if (headNode) { headNode.computeWorldMatrix(true); head.copyFrom(headNode.getAbsolutePosition()); }
    else head.y -= bh * .2;
    const forward = root.getDirection(new Vector3(0, 0, -1)), right = root.getDirection(new Vector3(1, 0, 0));
    const plan = portraitCameraPlanFromBasis(head, forward, right, bh);
    this.camera.fov = plan.fov;
    this.camera.position.copyFromFloats(plan.position.x, plan.position.y, plan.position.z);
    this.camera.setTarget(new Vector3(plan.target.x, plan.target.y, plan.target.z));
    // CharacterRig nests the meshes below the model node. `false` means
    // directDescendantsOnly=false in Babylon and therefore traverses the rig.
    const meshes: AbstractMesh[] = portraitMeshes(root);
    this.rtt.renderList = meshes;
    a.busy = true;
    const p = this.rtt.readPixels(0, 0, null, false, false) as unknown as Promise<ArrayBufferView> | ArrayBufferView | null;
    Promise.resolve(p).then(buf => {
      if (!buf || this.active !== a) { a.busy = false; return; }
      const w = this.size.w, h = this.size.h, src = new Uint8ClampedArray((buf as Uint8Array).buffer, (buf as Uint8Array).byteOffset, w * h * 4), img = new ImageData(w, h);
      // Row order differs between backends; flip if needed.
      for (let y = 0; y < h; y++) img.data.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      a.ctx.putImageData(img, 0, 0); a.busy = false;
    }).catch(() => { a.busy = false; });
  }
}
