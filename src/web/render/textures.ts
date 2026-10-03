import { clamp01, fbm, hash2, lerp, mulberry, valueNoise } from './noise';

/**
 * Procedural, tileable material detail: grayscale-leaning albedo (tinted per material and per
 * building through material colour and vertex colour) plus a tangent-space normal derived from a
 * height field. Everything is generated from fixed seeds, so it is identical on every machine, needs
 * no licence, and never touches simulation state.
 */
export type TextureKind = 'plaster' | 'planks' | 'darkwood' | 'log' | 'stonebrick' | 'cobble' | 'roofTile' | 'thatch' | 'ground' | 'cloth' | 'water' | 'bark' | 'leaf' | 'hide';
export interface PaintedTexture { size: number; albedo: Uint8ClampedArray; normal: Uint8ClampedArray; roughness: number }

interface Painter { (x: number, y: number, size: number, seed: number): { v: number; h: number; tint?: [number, number, number] } }

const S = (t: number, a: number, b: number) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };

const painters: Record<TextureKind, { size: number; strength: number; roughness: number; paint: Painter }> = {
  plaster: { size: 512, strength: 1.4, roughness: 0.92, paint: (x, y, n, s) => {
    const u = x / n * 8, v = y / n * 8;
    const mott = fbm(u, v, 8, 4, s), grain = valueNoise(x / 2.2, y / 2.2, n / 2.2 | 0 || 1, s + 5);
    const stain = S(fbm(u * .5, v * .5, 4, 3, s + 9), .55, .8) * .22;
    const crack = Math.abs(fbm(u * 1.5, v * 1.5, 12, 3, s + 21) - .5) < .012 ? .25 : 0;
    return { v: 0.84 + (mott - .5) * .2 - stain - crack + (grain - .5) * .06, h: mott * .45 + grain * .25 - crack * 1.2 };
  } },
  planks: { size: 512, strength: 2.2, roughness: 0.78, paint: (x, y, n, s) => plank(x, y, n, s, 0.72) },
  darkwood: { size: 512, strength: 2.2, roughness: 0.74, paint: (x, y, n, s) => plank(x, y, n, s + 40, 0.5) },
  log: { size: 512, strength: 2.6, roughness: 0.86, paint: (x, y, n, s) => {
    const u = x / n * 6, band = Math.floor(u), f = u - band;
    const tone = .55 + hash2(band, 3, s) * .25;
    const strand = fbm(x / n * 24, y / n * 2, 24, 4, s + 3), crack = S(Math.abs(strand - .5), .18, .05);
    const edge = S(f, 0, .12) * S(1 - f, 0, .12);
    return { v: (tone + (strand - .5) * .3) * (.55 + .45 * edge) - crack * .2, h: edge * .8 + strand * .5 - crack * .6 };
  } },
  stonebrick: { size: 512, strength: 3, roughness: 0.9, paint: (x, y, n, s) => {
    const rows = 8, rh = n / rows, row = Math.floor(y / rh), off = (row % 2) * .5, len = 3;
    const u = ((x / n * len + off + hash2(row, 0, s) * .3) % 1 + 1) % 1, cell = Math.floor(x / n * len + off + hash2(row, 0, s) * .3);
    const fy = (y - row * rh) / rh, tone = .55 + hash2(row * 7 + cell, 5, s) * .3;
    const ex = Math.min(u, 1 - u) * len * 0.28, ey = Math.min(fy, 1 - fy) * 0.9, edge = S(Math.min(ex, ey), .015, .09);
    const pits = fbm(x / 6, y / 6, (n / 6) | 0, 3, s + 13);
    return { v: (tone + (pits - .5) * .18) * (.35 + .65 * edge), h: edge * .9 + pits * .25 };
  } },
  cobble: { size: 512, strength: 3.2, roughness: 0.92, paint: (x, y, n, s) => {
    const g = 8, cs = n / g; let best = 9, second = 9, bi = 0, bj = 0;
    const gx = Math.floor(x / cs), gy = Math.floor(y / cs);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = gx + i, cy = gy + j, wx = ((cx % g) + g) % g, wy = ((cy % g) + g) % g;
      const px = (cx + .2 + hash2(wx, wy, s) * .6) * cs, py = (cy + .2 + hash2(wx, wy, s + 1) * .6) * cs, d = Math.hypot(x - px, y - py) / cs;
      if (d < best) { second = best; best = d; bi = wx; bj = wy; } else if (d < second) second = d;
    }
    const edge = S(second - best, .02, .3), tone = .5 + hash2(bi, bj, s + 2) * .32, pits = fbm(x / 5, y / 5, (n / 5) | 0, 2, s + 4);
    return { v: (tone + (pits - .5) * .12) * (.3 + .7 * edge), h: edge * 1.0 + pits * .15 };
  } },
  roofTile: { size: 512, strength: 3.4, roughness: 0.7, paint: (x, y, n, s) => {
    const rows = 10, rh = n / rows, row = Math.floor(y / rh), fy = (y - row * rh) / rh, tw = n / 8, off = (row % 2) * tw * .5;
    const col = Math.floor((x + off) / tw), fx = ((x + off) % tw + tw) % tw / tw;
    const round = Math.sqrt(Math.max(0, 1 - Math.pow((fx - .5) * 2, 2) * .5)), tone = .58 + hash2(col, row, s) * .3;
    const shade = S(fy, 0, .5) * (1 - S(fy, .88, 1) * .55), gap = S(Math.min(fx, 1 - fx), 0, .06);
    return { v: tone * (.5 + .5 * shade) * (.6 + .4 * gap) + (valueNoise(x / 3, y / 3, (n / 3) | 0, s) - .5) * .05, h: (shade * .8 + round * .3) * gap };
  } },
  thatch: { size: 512, strength: 2.8, roughness: 0.96, paint: (x, y, n, s) => {
    const strand = fbm(x / n * 64, y / n * 4, 64, 3, s), strand2 = fbm(x / n * 128, y / n * 8, 128, 2, s + 7);
    const band = S(fbm(x / n * 3, y / n * 10, 6, 2, s + 11), .35, .7) * .18, clump = valueNoise(x / n * 8, y / n * 6, 8, s + 31);
    return { v: .52 + (strand - .5) * .5 + (strand2 - .5) * .2 - band + (clump - .5) * .12, h: strand * .8 + strand2 * .4 };
  } },
  ground: { size: 256, strength: 1.2, roughness: 0.95, paint: (x, y, n, s) => {
    const a = fbm(x / n * 10, y / n * 10, 10, 4, s), b = valueNoise(x / 1.6, y / 1.6, (n / 1.6) | 0 || 1, s + 3);
    return { v: .90 + (a - .5) * .16 + (b - .5) * .09, h: a * .5 + b * .3 };
  } },
  cloth: { size: 256, strength: 1.6, roughness: 0.9, paint: (x, y, n, s) => {
    const p = 8, warp = Math.sin(x / n * Math.PI * 2 * p) * .5 + .5, weft = Math.sin(y / n * Math.PI * 2 * p) * .5 + .5;
    const w = ((x / (n / p) | 0) + (y / (n / p) | 0)) % 2 ? warp : weft, fuzz = valueNoise(x / 1.5, y / 1.5, (n / 1.5) | 0 || 1, s);
    return { v: .62 + (w - .5) * .22 + (fuzz - .5) * .1, h: w * .6 + fuzz * .2 };
  } },
  water: { size: 256, strength: 1.5, roughness: 0.08, paint: (x, y, n, s) => {
    const a = fbm(x / n * 8, y / n * 8, 8, 4, s), b = fbm(x / n * 16 + 3, y / n * 16 + 7, 16, 3, s + 5);
    return { v: .5 + (a - .5) * .3, h: a * .7 + b * .35 };
  } },
  bark: { size: 256, strength: 2.6, roughness: 0.92, paint: (x, y, n, s) => {
    const a = fbm(x / n * 10, y / n * 2.5, 10, 5, s), ridge = 1 - Math.abs(a * 2 - 1);
    return { v: .42 + ridge * .4, h: ridge };
  } },
  leaf: { size: 256, strength: 1.2, roughness: 0.7, paint: (x, y, n, s) => {
    const a = fbm(x / n * 14, y / n * 14, 14, 4, s), b = valueNoise(x / 3, y / 3, (n / 3) | 0, s + 2);
    return { v: .5 + (a - .5) * .7 + (b - .5) * .2, h: a * .5 + b * .3 };
  } },
  hide: { size: 256, strength: 1.0, roughness: 0.85, paint: (x, y, n, s) => {
    const a = fbm(x / n * 12, y / n * 12, 12, 4, s), b = valueNoise(x / 2, y / 2, (n / 2) | 0, s + 9);
    return { v: .55 + (a - .5) * .45 + (b - .5) * .1, h: a * .35 + b * .1 };
  } },
};

function plank(x: number, y: number, n: number, s: number, base: number) {
  const count = 8, pw = n / count, idx = Math.floor(x / pw), fx = (x - idx * pw) / pw;
  const tone = base + (hash2(idx, 1, s) - .5) * .28;
  const grain = fbm(x / n * 6 + idx * 3.1, y / n * 1.4, 6, 4, s + idx * 3), rings = Math.sin((grain * 9 + fx * 3) * Math.PI) * .5 + .5;
  const gap = S(Math.min(fx, 1 - fx), 0, .05);
  const knot = Math.hypot((x - (hash2(idx, 9, s) * .6 + .2 + idx) * pw) / pw, ((y / n) - hash2(idx, 11, s)) * 4);
  const knotV = knot < .5 ? (1 - knot * 2) * .32 : 0;
  const butt = Math.abs(((y / n + hash2(idx, 5, s)) % 1) - .0) < .004 ? .3 : 0;
  return { v: (tone + (grain - .5) * .18 + rings * .06 - knotV) * (.35 + .65 * gap) - butt, h: gap * .7 + grain * .35 - knotV };
}

export function paintTexture(kind: TextureKind, seed = 1): PaintedTexture {
  const { size, strength, roughness, paint } = painters[kind];
  const albedo = new Uint8ClampedArray(size * size * 4), normal = new Uint8ClampedArray(size * size * 4), height = new Float32Array(size * size);
  const tints: ([number, number, number] | undefined)[] = [];
  void tints;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = paint(x, y, size, seed), o = (y * size + x) * 4, v = clamp01(p.v);
    albedo[o] = albedo[o + 1] = albedo[o + 2] = v * 255; albedo[o + 3] = 255; height[y * size + x] = p.h;
  }
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x - 1, y) - at(x + 1, y)) * strength, dy = (at(x, y - 1) - at(x, y + 1)) * strength, l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
    normal[o] = (dx / l * .5 + .5) * 255; normal[o + 1] = (dy / l * .5 + .5) * 255; normal[o + 2] = (1 / l * .5 + .5) * 255; normal[o + 3] = 255;
  }
  return { size, albedo, normal, roughness };
}

/** A 1-D vertical gradient strip as RGBA (sky dome, fog ramps). */
export function gradientStrip(stops: { at: number; color: [number, number, number] }[], height = 256): Uint8ClampedArray {
  const out = new Uint8ClampedArray(height * 4);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1); let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) if (t >= stops[i].at && t <= stops[i + 1].at) { a = stops[i]; b = stops[i + 1]; break; }
    const k = a === b ? 0 : (t - a.at) / (b.at - a.at);
    for (let c = 0; c < 3; c++) out[y * 4 + c] = lerp(a.color[c], b.color[c], k) * 255;
    out[y * 4 + 3] = 255;
  }
  return out;
}
export { mulberry };
