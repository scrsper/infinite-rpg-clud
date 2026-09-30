import { Color4, DynamicTexture, ParticleSystem, Scene, Vector3 } from '@babylonjs/core';

/** Rain and snow-free storm streaks around the camera. Presentation only; intensity comes from the projected weather. */
export class WeatherFx {
  private readonly rain: ParticleSystem;
  constructor(scene: Scene, cap: number) {
    const tex = new DynamicTexture('rain-streak', { width: 16, height: 64 }, scene, true); const g = tex.getContext() as CanvasRenderingContext2D;
    const grad = g.createLinearGradient(0, 0, 0, 64); grad.addColorStop(0, 'rgba(200,215,235,0)'); grad.addColorStop(0.6, 'rgba(200,215,235,0.7)'); grad.addColorStop(1, 'rgba(220,235,255,0.9)');
    g.fillStyle = grad; g.fillRect(7, 0, 2, 64); tex.update(); tex.hasAlpha = true;
    const ps = this.rain = new ParticleSystem('rain', cap, scene);
    ps.particleTexture = tex; ps.emitter = new Vector3(0, 0, 0); ps.minEmitBox = new Vector3(-14, 9, -14); ps.maxEmitBox = new Vector3(14, 11, 14);
    ps.direction1 = new Vector3(-0.3, -14, -0.2); ps.direction2 = new Vector3(0.3, -18, 0.2); ps.minLifeTime = 0.6; ps.maxLifeTime = 0.9; ps.emitRate = 0;
    ps.minSize = 0.012; ps.maxSize = 0.02; ps.minScaleY = 3; ps.maxScaleY = 5; ps.color1 = new Color4(0.8, 0.86, 0.95, 0.6); ps.color2 = new Color4(0.7, 0.8, 0.92, 0.4); ps.colorDead = new Color4(0.7, 0.8, 0.92, 0);
    ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED; ps.blendMode = ParticleSystem.BLENDMODE_STANDARD; ps.updateSpeed = 0.016; ps.start();
  }
  update(camera: Vector3, kind: string, intensity: number): void {
    this.rain.emitter = camera;
    const wet = kind === 'rain' ? 0.5 + 0.5 * intensity : kind === 'storm' ? 1 : 0;
    this.rain.emitRate = wet * 2200;
  }
  dispose(): void { this.rain.dispose(); }
}
