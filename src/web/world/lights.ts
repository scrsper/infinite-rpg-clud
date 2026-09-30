import { Color3, PointLight, Scene, Vector3 } from '@babylonjs/core';

/**
 * A small pool of real point lights shared by every torch, lantern, forge and fire in the loaded
 * regions. Candidates register a position in region-local space plus their region root, so the
 * floating origin can move without touching them; each update the nearest few (by distance to the
 * camera, weighted by intensity) take the physical lights. Everything farther stays visible as its
 * own emissive flame; only the light it casts is pooled.
 */
export interface LightCandidate {
  id: string; root: { position: Vector3 }; x: number; y: number; z: number;
  color: [number, number, number]; intensity: number; range: number; flicker: number; enabled: boolean;
}
export class LightPool {
  private readonly lights: PointLight[] = [];
  private readonly candidates = new Map<string, LightCandidate>();
  private time = 0;
  constructor(scene: Scene, private size: number) {
    for (let i = 0; i < size; i++) {
      const l = new PointLight(`pool-${i}`, new Vector3(0, -1000, 0), scene);
      // Always enabled: a light that is switched on and off changes the number of lights in every lit material's shader, and
      // each new count is a shader (and, on WebGPU, a pipeline) to build in the middle of play. An idle light is parked at zero intensity instead.
      l.intensity = 0; l.specular = Color3.Black(); l.range = 1; this.lights.push(l);
    }
  }
  setSize(n: number): void { this.size = Math.min(n, this.lights.length); }
  add(c: LightCandidate): void { this.candidates.set(c.id, c); }
  remove(id: string): void { this.candidates.delete(id); }
  removeByPrefix(prefix: string): void { for (const k of [...this.candidates.keys()]) if (k.startsWith(prefix)) this.candidates.delete(k); }
  get count(): number { return this.candidates.size; }
  get active(): number { return this.lights.filter(l => l.intensity > 0).length; }
  /** `night` in 0..1 lifts lights when it is dark. */
  update(dt: number, cameraPos: Vector3, night: number): void {
    this.time += dt;
    const ranked: { c: LightCandidate; d: number; wx: number; wy: number; wz: number }[] = [];
    for (const c of this.candidates.values()) {
      if (!c.enabled) continue;
      const base = c.root.position;
      const wx = base.x + c.x, wy = base.y + c.y, wz = base.z + c.z;
      const d = Math.hypot(wx - cameraPos.x, wy - cameraPos.y, wz - cameraPos.z);
      if (d > c.range * 4 + 30) continue;
      ranked.push({ c, d: d / Math.max(0.5, Math.sqrt(c.intensity)), wx, wy, wz });
    }
    ranked.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i], r = i < this.size ? ranked[i] : undefined;
      if (!r) { if (l.intensity !== 0) { l.intensity = 0; l.position.set(0, -1000, 0); } continue; }
      const seed = r.c.id.length * 1.7 + r.wx * 0.13;
      const fl = 1 + r.c.flicker * (Math.sin(this.time * 9 + seed) * 0.05 + Math.sin(this.time * 23.7 + seed * 2.3) * 0.035);
      l.position.set(r.wx, r.wy, r.wz);
      l.diffuse.set(r.c.color[0], r.c.color[1], r.c.color[2]);
      l.range = r.c.range * 1.6; l.intensity = r.c.intensity * fl * (0.55 + 0.9 * night);
    }
  }
  dispose(): void { for (const l of this.lights) l.dispose(); this.lights.length = 0; this.candidates.clear(); }
}
