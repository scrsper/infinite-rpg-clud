import { Mesh, Scene, VertexData, type Material } from '@babylonjs/core';

export type V = [number, number, number];
export const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
export const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V): V => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * Accumulates triangles for one material. Coordinates are region-local; the owning node positions
 * the batch in the scene. UVs are world-space metres times the material's tiles-per-metre, chosen
 * by the caller so every surface of a material shares one texel density.
 */
export class MeshBatch {
  readonly positions: number[] = []; readonly normals: number[] = []; readonly uvs: number[] = []; readonly colors: number[] = []; readonly indices: number[] = [];
  get vertexCount(): number { return this.positions.length / 3; }
  get empty(): boolean { return this.indices.length === 0; }

  /** A planar quad, corners counter-clockwise seen from the side the normal points to. UVs are projected from the dominant axis of the normal. */
  quad(p0: V, p1: V, p2: V, p3: V, tint: V | V[], tpm: number, opts: { flip?: boolean; normal?: V; uv?: 'auto' | 'along' } = {}): void {
    const n = opts.normal ?? norm(cross(sub(p1, p0), sub(p3, p0)));
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const base = this.vertexCount;
    const perVertex = Array.isArray(tint[0]);
    [p0, p1, p2, p3].forEach((p, k) => {
      this.positions.push(p[0], p[1], p[2]); this.normals.push(n[0], n[1], n[2]);
      if (ay >= ax && ay >= az) this.uvs.push(p[0] * tpm, p[2] * tpm);
      else if (ax >= az) this.uvs.push(p[2] * tpm, p[1] * tpm);
      else this.uvs.push(p[0] * tpm, p[1] * tpm);
      const t = (perVertex ? (tint as V[])[k] : tint) as V;
      this.colors.push(t[0], t[1], t[2], 1);
    });
    if (opts.flip) this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** A triangle fan polygon (convex), all points on one plane. */
  polygon(points: V[], normal: V, tint: [number, number, number], tpm: number): void {
    const base = this.vertexCount, ax = Math.abs(normal[0]), ay = Math.abs(normal[1]), az = Math.abs(normal[2]);
    for (const p of points) {
      this.positions.push(p[0], p[1], p[2]); this.normals.push(normal[0], normal[1], normal[2]);
      if (ay >= ax && ay >= az) this.uvs.push(p[0] * tpm, p[2] * tpm); else if (ax >= az) this.uvs.push(p[2] * tpm, p[1] * tpm); else this.uvs.push(p[0] * tpm, p[1] * tpm);
      this.colors.push(tint[0], tint[1], tint[2], 1);
    }
    for (let i = 1; i < points.length - 1; i++) this.indices.push(base, base + i, base + i + 1);
  }
  /** Axis-aligned box; `skip` is a bitmask of faces (-x,+x,-y,+y,-z,+z) to omit. */
  box(min: V, max: V, tint: [number, number, number], tpm: number, skip = 0): void {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    if (!(skip & 1)) this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], tint, tpm, { normal: [-1, 0, 0] });
    if (!(skip & 2)) this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], tint, tpm, { normal: [1, 0, 0] });
    if (!(skip & 4)) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], tint, tpm, { normal: [0, -1, 0] });
    if (!(skip & 8)) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], tint, tpm, { normal: [0, 1, 0] });
    if (!(skip & 16)) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], tint, tpm, { normal: [0, 0, -1] });
    if (!(skip & 32)) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], tint, tpm, { normal: [0, 0, 1] });
  }
  /** Vertical cylinder (open ends optional), for posts, barrels, chimneys pots. */
  cylinder(cx: number, cz: number, y0: number, y1: number, radius: number, sides: number, tint: [number, number, number], tpm: number, caps = true): void {
    for (let i = 0; i < sides; i++) {
      const a0 = i / sides * Math.PI * 2, a1 = (i + 1) / sides * Math.PI * 2;
      const p0: V = [cx + Math.cos(a0) * radius, y0, cz + Math.sin(a0) * radius], p1: V = [cx + Math.cos(a1) * radius, y0, cz + Math.sin(a1) * radius];
      const mid = (a0 + a1) / 2;
      this.quad(p1, p0, [p0[0], y1, p0[2]], [p1[0], y1, p1[2]], tint, tpm, { normal: [Math.cos(mid), 0, Math.sin(mid)] });
    }
    if (caps) {
      const top: V[] = [], bottom: V[] = [];
      for (let i = 0; i < sides; i++) { const a = i / sides * Math.PI * 2; top.push([cx + Math.cos(a) * radius, y1, cz + Math.sin(a) * radius]); bottom.push([cx + Math.cos(a) * radius, y0, cz + Math.sin(a) * radius]); }
      this.polygon(top.slice().reverse(), [0, 1, 0], tint, tpm); this.polygon(bottom, [0, -1, 0], tint, tpm);
    }
  }
  /** Vertex colours are authored in sRGB; the PBR shader multiplies them as linear values, so convert once before building. */
  linearize(): this { for (let i = 0; i < this.colors.length; i += 4) { this.colors[i] = Math.pow(this.colors[i], 2.2); this.colors[i + 1] = Math.pow(this.colors[i + 1], 2.2); this.colors[i + 2] = Math.pow(this.colors[i + 2], 2.2); } return this; }
  build(name: string, scene: Scene, material: Material, options: { castShadow?: boolean; receiveShadow?: boolean } = {}): Mesh | null {
    if (this.empty) return null;
    const mesh = new Mesh(name, scene), vd = new VertexData();
    vd.positions = this.positions; vd.normals = this.normals; vd.uvs = this.uvs; vd.colors = this.colors; vd.indices = this.indices; vd.applyToMesh(mesh);
    mesh.material = material; mesh.receiveShadows = options.receiveShadow !== false; mesh.isPickable = false;
    return mesh;
  }
}
