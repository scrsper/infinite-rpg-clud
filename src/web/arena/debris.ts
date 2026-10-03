import { Quaternion, Vector3, type AbstractMesh } from '@babylonjs/core';

/**
 * Lightweight rigid debris: prop chunks, knocked-off tableware, baked skeleton parts, spent bolts.
 * Each body is a mesh with a contact radius against the flat arena floor (y = 0). No body-body
 * contact; pieces are scattered by fighters walking through them. Old resting pieces sink away
 * once the cap is reached, so smashing can go on indefinitely.
 */
interface Body {
  node: AbstractMesh; p: Vector3; v: Vector3; q: Quaternion; w: Vector3;
  r: number; bounce: number; asleep: boolean; age: number; sink: number; cell: number;
}
const G = -22, CELL = 2, MAX = 1400;
const tmpQ = new Quaternion(), axis = new Vector3();

export class Debris {
  private bodies: Body[] = [];
  private grid = new Map<number, Body[]>();
  get count(): number { return this.bodies.length; }

  add(node: AbstractMesh, p: Vector3, v: Vector3, w: Vector3, r: number, bounce = 0.32): void {
    node.rotationQuaternion ??= Quaternion.FromEulerVector(node.rotation);
    const b: Body = { node, p: p.clone(), v: v.clone(), q: node.rotationQuaternion.clone(), w: w.clone(), r: Math.max(0.02, r), bounce, asleep: false, age: 0, sink: 0, cell: NaN };
    this.bodies.push(b);
    if (this.bodies.length > MAX) { const old = this.bodies.find(x => x.asleep && !x.sink); if (old) old.sink = 1e-3; }
  }

  /** Wake and push resting pieces near a moving fighter or a blast. */
  stir(x: number, z: number, radius: number, push: number, vx = 0, vz = 0): void {
    const c0 = Math.floor((x - radius) / CELL), c1 = Math.floor((x + radius) / CELL), r0 = Math.floor((z - radius) / CELL), r1 = Math.floor((z + radius) / CELL);
    for (let cx = c0; cx <= c1; cx++) for (let cz = r0; cz <= r1; cz++) for (const b of this.grid.get(cx * 4096 + cz) ?? []) {
      const dx = b.p.x - x, dz = b.p.z - z, d2 = dx * dx + dz * dz;
      if (d2 > radius * radius || b.sink) continue;
      const d = Math.sqrt(d2) || 1, k = push * (1 - d / radius);
      b.v.x += (dx / d) * k + vx * 0.5 * (1 - d / radius); b.v.z += (dz / d) * k + vz * 0.5 * (1 - d / radius);
      b.v.y += k * 0.35; b.w.x += (Math.random() - .5) * k * 3; b.w.z += (Math.random() - .5) * k * 3; b.asleep = false;
    }
  }

  step(dt: number): void {
    this.grid.clear();
    let removed = false;
    for (const b of this.bodies) {
      b.age += dt;
      if (b.sink) {
        b.sink += dt; b.p.y -= dt * 0.25;
        b.node.position.copyFrom(b.p);
        if (b.sink > 3) { b.node.dispose(); removed = true; b.r = -1; }
        continue;
      }
      if (!b.asleep) {
        b.v.y += G * dt;
        b.p.addInPlaceFromFloats(b.v.x * dt, b.v.y * dt, b.v.z * dt);
        let grounded = false;
        if (b.p.y < b.r) {
          b.p.y = b.r; grounded = true;
          if (b.v.y < -1.2) { b.v.y = -b.v.y * b.bounce; b.w.scaleInPlace(0.7); } else b.v.y = 0;
          const f = Math.max(0, 1 - 7 * dt); b.v.x *= f; b.v.z *= f;
          b.w.scaleInPlace(Math.max(0, 1 - 5 * dt));
        }
        const wl = b.w.length();
        if (wl > 1e-3) { axis.copyFrom(b.w).scaleInPlace(1 / wl); Quaternion.RotationAxisToRef(axis, wl * dt, tmpQ); tmpQ.multiplyToRef(b.q, b.q); }
        if (grounded && Math.abs(b.v.x) + Math.abs(b.v.z) + Math.abs(b.v.y) < 0.12 && wl < 0.25) { b.asleep = true; b.v.setAll(0); b.w.setAll(0); }
        b.node.position.copyFrom(b.p); b.node.rotationQuaternion!.copyFrom(b.q);
      }
      const key = Math.floor(b.p.x / CELL) * 4096 + Math.floor(b.p.z / CELL);
      let list = this.grid.get(key); if (!list) this.grid.set(key, list = []); list.push(b);
    }
    if (removed) this.bodies = this.bodies.filter(b => b.r >= 0);
  }

  clear(): void { for (const b of this.bodies) b.node.dispose(); this.bodies = []; this.grid.clear(); }
}
