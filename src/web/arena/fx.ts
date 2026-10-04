import {
  Color3, Color4, DynamicTexture, InstancedMesh, Mesh, MeshBuilder, ParticleSystem, StandardMaterial, TransformNode, Vector3, VertexData, type Scene,
} from '@babylonjs/core';

/** Presentation-only combat effects. Pools everything; nothing here allocates per hit after warm-up. */
function radial(scene: Scene, name: string, stops: [number, string][]): DynamicTexture {
  const t = new DynamicTexture(name, { width: 64, height: 64 }, scene, false);
  const c = t.getContext() as CanvasRenderingContext2D, g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, col] of stops) g.addColorStop(o, col);
  c.fillStyle = g; c.fillRect(0, 0, 64, 64); t.hasAlpha = true; t.update();
  return t;
}
function drawn(scene: Scene, name: string, size: number, draw: (c: CanvasRenderingContext2D) => void): DynamicTexture {
  const t = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const c = t.getContext() as CanvasRenderingContext2D; c.clearRect(0, 0, size, size); draw(c); t.hasAlpha = true; t.update();
  return t;
}
const unlit = (scene: Scene, name: string, tex: DynamicTexture, color: Color3, additive = true) => {
  const m = new StandardMaterial(name, scene);
  m.diffuseTexture = tex; m.emissiveTexture = tex; m.opacityTexture = tex; m.emissiveColor = color; m.diffuseColor = Color3.Black();
  m.disableLighting = true; m.backFaceCulling = false; m.alphaMode = additive ? 1 : 2; m.fogEnabled = false; m.useAlphaFromDiffuseTexture = true;
  return m;
};

interface Timed { mesh: Mesh; t: number; life: number; grow: number; base: number; mat: StandardMaterial; alpha: number; follow?: () => Vector3 | null }

export class Fx {
  private sparks: ParticleSystem[] = []; private si = 0;
  private dusts: ParticleSystem[] = []; private di = 0;
  private timed: Timed[] = [];
  private ringPool: Mesh[] = []; private flashPool: Mesh[] = []; private telePool: Mesh[] = [];
  private ringTex: DynamicTexture; private flashTex: DynamicTexture; private teleTex: DynamicTexture; private dotTex: DynamicTexture;
  shake = 0;

  constructor(private readonly scene: Scene) {
    this.dotTex = radial(scene, 'fx-dot', [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,240,200,.85)'], [1, 'rgba(255,200,120,0)']]);
    this.flashTex = radial(scene, 'fx-flash', [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,236,190,.9)'], [0.5, 'rgba(255,190,90,.25)'], [1, 'rgba(255,160,60,0)']]);
    this.ringTex = drawn(scene, 'fx-ring', 256, c => { c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = 9; c.beginPath(); c.arc(128, 128, 112, 0, Math.PI * 2); c.stroke(); c.lineWidth = 3; c.globalAlpha = .6; c.beginPath(); c.arc(128, 128, 96, 0, Math.PI * 2); c.stroke(); });
    // A forward crescent like the reference's red attack warnings: thick in the middle, tapering at the tips.
    this.teleTex = drawn(scene, 'fx-tele', 256, c => {
      const g = c.createLinearGradient(0, 40, 0, 120); g.addColorStop(0, 'rgba(255,40,40,1)'); g.addColorStop(1, 'rgba(200,0,0,.75)');
      c.fillStyle = g; c.beginPath(); c.arc(128, 300, 250, Math.PI * 1.25, Math.PI * 1.75); c.arc(128, 330, 238, Math.PI * 1.72, Math.PI * 1.28, true); c.closePath(); c.fill();
    });
    for (let i = 0; i < 8; i++) this.sparks.push(this.makeSparks(i));
    for (let i = 0; i < 6; i++) this.dusts.push(this.makeDust(i));
  }

  private makeSparks(i: number): ParticleSystem {
    const ps = new ParticleSystem(`sparks${i}`, 90, this.scene);
    ps.particleTexture = this.dotTex; ps.emitter = Vector3.Zero(); ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    ps.minSize = .05; ps.maxSize = .13; ps.minScaleX = .6; ps.maxScaleX = 1; ps.minScaleY = 2.5; ps.maxScaleY = 5;
    ps.minLifeTime = .12; ps.maxLifeTime = .35; ps.minEmitPower = 5; ps.maxEmitPower = 13; ps.gravity = new Vector3(0, -16, 0);
    ps.createSphereEmitter(0.1, 1);
    ps.color1 = new Color4(1, .95, .7, 1); ps.color2 = new Color4(1, .62, .2, 1); ps.colorDead = new Color4(1, .3, 0, 0);
    ps.manualEmitCount = 0; ps.emitRate = 0; ps.updateSpeed = 1 / 60; ps.start();
    return ps;
  }
  private makeDust(i: number): ParticleSystem {
    const ps = new ParticleSystem(`dust${i}`, 60, this.scene);
    ps.particleTexture = radial(this.scene, `fx-dust${i}`, [[0, 'rgba(255,255,255,.7)'], [1, 'rgba(255,255,255,0)']]);
    ps.emitter = Vector3.Zero(); ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.minSize = .35; ps.maxSize = 1.1; ps.minLifeTime = .45; ps.maxLifeTime = 1.1; ps.minEmitPower = 1.2; ps.maxEmitPower = 3.6;
    ps.gravity = new Vector3(0, .6, 0); ps.createCylinderEmitter(0.5, 0.3, 0.2, 0.6);
    ps.color1 = new Color4(.86, .8, .7, .55); ps.color2 = new Color4(.75, .7, .62, .4); ps.colorDead = new Color4(.8, .78, .74, 0);
    ps.minAngularSpeed = -2; ps.maxAngularSpeed = 2; ps.manualEmitCount = 0; ps.emitRate = 0; ps.updateSpeed = 1 / 60; ps.start();
    return ps;
  }

  sparksAt(p: Vector3, n = 26, tint?: Color4): void {
    const ps = this.sparks[this.si++ % this.sparks.length];
    (ps.emitter as Vector3).copyFrom(p);
    if (tint) { ps.color1 = tint; ps.color2 = tint; } else { ps.color1 = new Color4(1, .95, .7, 1); ps.color2 = new Color4(1, .62, .2, 1); }
    ps.manualEmitCount = n;
  }
  dustAt(p: Vector3, n = 18, tint?: Color4): void {
    const ps = this.dusts[this.di++ % this.dusts.length];
    (ps.emitter as Vector3).copyFrom(p);
    ps.color1 = tint ?? new Color4(.86, .8, .7, .55);
    ps.manualEmitCount = n;
  }

  private take(pool: Mesh[], make: () => Mesh): Mesh { const m = pool.pop() ?? make(); m.setEnabled(true); return m; }

  flash(p: Vector3, size = 1.4, color = new Color3(1, .85, .55)): void {
    const m = this.take(this.flashPool, () => {
      const q = MeshBuilder.CreatePlane('fx-flash', { size: 1 }, this.scene);
      q.billboardMode = Mesh.BILLBOARDMODE_ALL; q.isPickable = false; q.material = unlit(this.scene, 'fx-flash', this.flashTex, new Color3(1, 1, 1)); return q;
    });
    m.position.copyFrom(p); (m.material as StandardMaterial).emissiveColor = color;
    this.timed.push({ mesh: m, t: 0, life: .12, grow: size * 1.6, base: size * .6, mat: m.material as StandardMaterial, alpha: 1 });
  }

  ring(p: Vector3, size = 2.2, life = .45, color = new Color3(1, 1, 1)): void {
    const m = this.take(this.ringPool, () => {
      const q = MeshBuilder.CreateGround('fx-ring', { width: 1, height: 1 }, this.scene);
      q.isPickable = false; q.material = unlit(this.scene, 'fx-ring', this.ringTex, new Color3(1, 1, 1)); return q;
    });
    m.position.set(p.x, 0.03, p.z); (m.material as StandardMaterial).emissiveColor = color;
    this.timed.push({ mesh: m, t: 0, life, grow: size, base: size * .25, mat: m.material as StandardMaterial, alpha: .9 });
  }

  /** Red crescent on the floor in front of an attacker; returns a handle to cancel it. */
  telegraph(origin: () => Vector3 | null, yaw: () => number, reach: number, width: number, life: number): () => void {
    const m = this.take(this.telePool, () => {
      const q = MeshBuilder.CreateGround('fx-tele', { width: 1, height: 1 }, this.scene);
      q.isPickable = false; q.material = unlit(this.scene, 'fx-tele', this.teleTex, new Color3(1, .15, .1), false); return q;
    });
    const t: Timed = { mesh: m, t: 0, life, grow: 0, base: 1, mat: m.material as StandardMaterial, alpha: .85, follow: () => {
      const o = origin(); if (!o) return null; const y = yaw();
      m.rotation.y = y; m.scaling.set(width, 1, width * .55);
      return new Vector3(o.x + Math.sin(y) * reach * .55, 0.035, o.z + Math.cos(y) * reach * .55);
    } };
    this.timed.push(t);
    return () => { t.t = t.life; };
  }

  update(dt: number): void {
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const e = this.timed[i]; e.t += dt; const k = Math.min(1, e.t / e.life);
      if (e.follow) {
        const p = e.follow();
        if (p) e.mesh.position.copyFrom(p);
        e.mat.alpha = e.alpha * (0.55 + 0.45 * Math.sin(e.t * 26)) * (k < .15 ? k / .15 : 1);
      } else {
        const s = e.base + (e.grow - e.base) * (1 - (1 - k) * (1 - k));
        e.mesh.scaling.set(s, s, s); e.mat.alpha = e.alpha * (1 - k);
      }
      if (k >= 1) {
        e.mesh.setEnabled(false); e.mesh.scaling.setAll(1); this.timed.splice(i, 1);
        const pool = e.mesh.name === 'fx-ring' ? this.ringPool : e.mesh.name === 'fx-flash' ? this.flashPool : this.telePool;
        pool.push(e.mesh);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 2.8);
  }
}

/**
 * Soft contact shadows under fighters and furniture. Used instead of shadow maps: Babylon's
 * directional shadow lookup did not register on this arena's floor (see docs/COMBAT_ARENA.md).
 */
export class BlobShadows {
  private src: Mesh;
  constructor(scene: Scene) {
    const tex = radial(scene, 'blob', [[0, 'rgba(0,0,0,.62)'], [.55, 'rgba(0,0,0,.38)'], [1, 'rgba(0,0,0,0)']]);
    const m = new StandardMaterial('blob', scene);
    m.diffuseTexture = tex; m.opacityTexture = tex; m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black(); m.disableLighting = true; m.zOffset = -3;
    this.src = MeshBuilder.CreateGround('blob', { width: 1, height: 1 }, scene);
    this.src.material = m; this.src.isPickable = false; this.src.position.y = -100;
  }
  /** A blob following `parent` (fighter root) or fixed at `at`. */
  add(size: number, parent: TransformNode | null, at?: Vector3): InstancedMesh {
    const b = this.src.createInstance('blob-i'); b.isPickable = false;
    b.scaling.set(size, 1, size); b.parent = parent; b.position.set(at?.x ?? 0, .025, at?.z ?? 0);
    return b;
  }
}

/**
 * Sword swoosh: a flat ribbon swept by the blade's base and tip over the last few frames, bright at
 * the blade and fading behind it. It only lights up while a swing is live.
 */
export class SlashTrail {
  private static readonly N = 18;
  private mesh: Mesh; private mat: StandardMaterial;
  private base: Vector3[] = []; private tip: Vector3[] = [];
  private pos: Float32Array; private col: Float32Array;
  private on = false; private fade = 0;
  constructor(scene: Scene, private readonly baseNode: TransformNode, private readonly tipNode: TransformNode, private readonly color: Color3) {
    const N = SlashTrail.N;
    this.pos = new Float32Array(N * 2 * 3); this.col = new Float32Array(N * 2 * 4);
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.mesh = new Mesh('slash', scene);
    const vd = new VertexData(); vd.positions = this.pos; vd.indices = idx; vd.colors = this.col; vd.applyToMesh(this.mesh, true);
    const m = new StandardMaterial('slash', scene);
    m.emissiveColor = Color3.White(); m.diffuseColor = Color3.Black(); m.disableLighting = true; m.backFaceCulling = false; m.alphaMode = 1;
    this.mesh.material = m; this.mesh.hasVertexAlpha = true; this.mesh.useVertexColors = true; this.mesh.isPickable = false; this.mesh.alwaysSelectAsActiveMesh = true;
    this.mat = m;
  }
  set active(v: boolean) {
    if (v && !this.on) { const b = this.baseNode.getAbsolutePosition(), t = this.tipNode.getAbsolutePosition(); this.base = [b.clone()]; this.tip = [t.clone()]; }
    this.on = v;
  }
  update(dt: number): void {
    const N = SlashTrail.N;
    this.fade = this.on ? 1 : Math.max(0, this.fade - dt * 6);
    if (this.fade <= 0) { this.mesh.setEnabled(false); return; }
    this.mesh.setEnabled(true);
    if (this.on) {
      this.base.unshift(this.baseNode.getAbsolutePosition().clone()); this.tip.unshift(this.tipNode.getAbsolutePosition().clone());
      if (this.base.length > N) { this.base.length = N; this.tip.length = N; }
    }
    const n = this.base.length;
    for (let i = 0; i < N; i++) {
      const j = Math.min(i, n - 1), b = this.base[j], t = this.tip[j], k = 1 - i / (N - 1);
      this.pos.set([b.x, b.y, b.z, t.x, t.y, t.z], i * 6);
      const a = this.fade * k * k * .95;
      this.col.set([this.color.r, this.color.g, this.color.b, a * .15, this.color.r, this.color.g, this.color.b, a], i * 8);
    }
    this.mesh.updateVerticesData('position', this.pos); this.mesh.updateVerticesData('color', this.col);
  }
  dispose(): void { this.mesh.dispose(); this.mat.dispose(); }
}
