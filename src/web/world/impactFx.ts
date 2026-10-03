import { Color4, DynamicTexture, ParticleSystem, Scene, Vector3 } from '@babylonjs/core';

/**
 * Contact feedback at the place the simulation says a strike landed. It is fed only by a confirmed
 * contact event (never by a swing or a miss), lasts a fraction of a second, and is restrained: a small
 * burst of warm dust and pale sparks, a little cooler when the player is the one struck.
 */
export class ImpactFx {
  private readonly systems: ParticleSystem[] = [];
  private next = 0;
  constructor(private readonly scene: Scene, pool = 4) {
    const tex = new DynamicTexture('impact-spark', { width: 32, height: 32 }, scene, true); const g = tex.getContext() as CanvasRenderingContext2D;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16); grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32); tex.update(); tex.hasAlpha = true;
    for (let i = 0; i < pool; i++) {
      const ps = new ParticleSystem(`impact-${i}`, 40, scene);
      ps.particleTexture = tex; ps.emitter = new Vector3(0, -1000, 0); ps.emitRate = 0; ps.manualEmitCount = 0;
      ps.minEmitBox = new Vector3(-0.05, -0.05, -0.05); ps.maxEmitBox = new Vector3(0.05, 0.05, 0.05);
      ps.direction1 = new Vector3(-1.6, 0.6, -1.6); ps.direction2 = new Vector3(1.6, 2.2, 1.6); ps.gravity = new Vector3(0, -7, 0);
      ps.minLifeTime = 0.14; ps.maxLifeTime = 0.34; ps.minSize = 0.03; ps.maxSize = 0.09; ps.minEmitPower = 0.8; ps.maxEmitPower = 2.2;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD; ps.updateSpeed = 0.016; ps.disposeOnStop = false;
      ps.color1 = new Color4(1, 0.9, 0.62, 0.9); ps.color2 = new Color4(0.95, 0.75, 0.5, 0.8); ps.colorDead = new Color4(0.6, 0.45, 0.3, 0);
      ps.start(); this.systems.push(ps);
    }
  }
  /** `at` is a render-space position; `onPlayer` cools the colour so being struck reads differently from striking. */
  burst(at: Vector3, onPlayer: boolean): void {
    const ps = this.systems[this.next++ % this.systems.length];
    ps.emitter = at.clone();
    if (onPlayer) { ps.color1.set(0.85, 0.8, 1, 0.9); ps.color2.set(0.7, 0.55, 0.75, 0.8); } else { ps.color1.set(1, 0.9, 0.62, 0.9); ps.color2.set(0.95, 0.75, 0.5, 0.8); }
    ps.manualEmitCount = 16;
  }
  dispose(): void { for (const s of this.systems) s.dispose(); this.systems.length = 0; }
}
