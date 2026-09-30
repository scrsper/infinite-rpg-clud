import { Color4, FreeCamera, RenderTargetTexture, Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';
import type { ActorManager } from '../actors/actorManager';
import type { PortraitSource } from './dialoguePanel';

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
    this.rtt = new RenderTargetTexture('portrait', { width: this.size.w, height: this.size.h }, scene, { generateMipMaps: false, generateDepthBuffer: true, type: 0 });
    this.rtt.clearColor = new Color4(0.09, 0.11, 0.16, 1);
    this.rtt.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME; this.rtt.skipInitialClear = false;
    this.camera = new FreeCamera('portrait-cam', new Vector3(0, 1.6, 2), scene); this.camera.fov = 0.42; this.camera.minZ = 0.05; this.camera.maxZ = 8; this.camera.parent = null;
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
    // The face sits a little below the top of the head box; look from the person's front, slightly off-axis.
    const yaw = root.rotation.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const vis = actor.visual as unknown as { eyeHeight?: number; bodyHeight?: number }, bh = vis.bodyHeight ?? actor.visual.headHeight - 0.18, eye = vis.eyeHeight ?? bh * 0.92;
    const face = new Vector3(root.position.x, root.position.y + eye - 0.05 * bh, root.position.z), d = 0.42 * bh;
    this.camera.position.copyFromFloats(face.x + fx * d + rx * 0.22 * d, face.y + 0.03, face.z + fz * d + rz * 0.22 * d);
    this.camera.setTarget(face.add(new Vector3(0, 0.0, 0)));
    const meshes: AbstractMesh[] = root.getChildMeshes(false);
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
