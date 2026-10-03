import type { AnimationGroup } from '@babylonjs/core';

/** Seconds of a clip at speed 1. */
export const clipLength = (g: AnimationGroup) => {
  const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 30;
  return (g.to - g.from) / fps;
};

/**
 * Cross-fading clip player for one character. Every clip is an AnimationGroup on the same rig;
 * blending is done with group weights, so a fade is just two weights ramping in opposite directions.
 */
export class Animator {
  current = '';
  private active = new Map<string, { g: AnimationGroup; w: number; target: number; rate: number }>();
  constructor(private readonly groups: Map<string, AnimationGroup>) {}

  has(name: string): boolean { return this.groups.has(name); }
  length(name: string): number { const g = this.groups.get(name); return g ? clipLength(g) : 1; }

  play(name: string, o: { loop?: boolean; speed?: number; fade?: number; restart?: boolean; from?: number } = {}): void {
    const g = this.groups.get(name); if (!g) { console.warn('[arena] missing clip', name); return; }
    const fade = o.fade ?? 0.12, speed = o.speed ?? 1;
    if (name === this.current && !o.restart) { g.speedRatio = speed; return; }
    for (const [n, a] of this.active) if (n !== name) { a.target = 0; a.rate = 1 / Math.max(fade, 1e-3); }
    let a = this.active.get(name);
    if (!a) { a = { g, w: fade <= 0 ? 1 : 0, target: 1, rate: 1 / Math.max(fade, 1e-3) }; this.active.set(name, a); }
    a.target = 1; a.rate = 1 / Math.max(fade, 1e-3);
    g.stop();
    g.start(o.loop ?? false, speed, g.from + (o.from ?? 0) * (g.to - g.from), g.to);
    g.setWeightForAllAnimatables(a.w);
    this.current = name;
  }

  setSpeed(speed: number): void { const a = this.active.get(this.current); if (a) a.g.speedRatio = speed; }

  update(dt: number): void {
    for (const [n, a] of this.active) {
      a.w = a.target > a.w ? Math.min(a.target, a.w + a.rate * dt) : Math.max(a.target, a.w - a.rate * dt);
      if (a.w <= 0 && a.target === 0) { a.g.stop(); this.active.delete(n); continue; }
      a.g.setWeightForAllAnimatables(a.w);
    }
  }

  stopAll(): void { for (const a of this.active.values()) a.g.stop(); this.active.clear(); this.current = ''; }
}
