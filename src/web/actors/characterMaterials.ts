import { Color3, DynamicTexture, PBRMaterial, RawTexture, Scene, Texture } from '@babylonjs/core';
import { mulberry } from '../render/noise';
import { paintTexture } from '../render/textures';
import { paintEye, paintFace, type FaceSpec } from './faceTexture';

/**
 * PBR materials for one character, keyed by the kit's slot names (TV_SkinBody, TV_SkinHead, TV_Eye,
 * TV_Hair, TV_Cloth, TV_Under, TV_Accent, TV_Hem, TV_Metal, TV_Leather, TV_Fur, TV_Straw, TV_Lacquer,
 * TV_Crystal). Cloth pattern textures carry their own colour and are cached by (palette, motif), so
 * a village of twenty people in six costume families paints six patterns, not twenty.
 */
export type Motif = 'plain' | 'blossom' | 'waves' | 'stripes' | 'check' | 'snow' | 'lamellar' | 'hemp' | 'brocade';
export interface ClothSpec {
  primary: [number, number, number]; secondary: [number, number, number]; accent: [number, number, number];
  motif: Motif; wear: number; seed: number; tint?: number;
}
export interface CharacterMaterialSpec {
  skin: [number, number, number]; hair: [number, number, number]; eye: [number, number, number]; lip: [number, number, number];
  face: FaceSpec; cloth: ClothSpec; fur?: [number, number, number]; furGlow?: boolean; lacquer?: [number, number, number]; straw?: [number, number, number];
  hairShine?: number; hairEmissive?: number;
}

/**
 * Cloth prints are shared between people who wear the same one, so they are cached by their key. Each holder counts as a
 * reference; once nobody holds a print it stays available for reuse, but only the CACHE_KEEP (40) most recently used idle prints
 * are kept, so a long walk through many settlements does not grow texture memory without bound.
 */
interface CacheEntry { tex: DynamicTexture; refs: number; used: number }
const canvasCache = new Map<string, CacheEntry>();
const CACHE_KEEP = 40;
let cacheClock = 0;
function releasePrints(keys: string[]): void {
  for (const k of keys) { const e = canvasCache.get(k); if (e) e.refs = Math.max(0, e.refs - 1); }
  const idle = [...canvasCache.entries()].filter(([, e]) => e.refs === 0).sort((a, b) => a[1].used - b[1].used);
  for (let i = 0; i < idle.length - CACHE_KEEP; i++) { idle[i][1].tex.dispose(); canvasCache.delete(idle[i][0]); }
}
let clothNormal: RawTexture | null = null;

const rgbs = (c: [number, number, number], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const shade = (c: [number, number, number], k: number): [number, number, number] => [Math.max(0, Math.min(255, c[0] * k)), Math.max(0, Math.min(255, c[1] * k)), Math.max(0, Math.min(255, c[2] * k))];
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function weave(g: CanvasRenderingContext2D, S: number, base: [number, number, number], rnd: () => number, strength = 1): void {
  g.fillStyle = rgbs(base); g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 2) { g.fillStyle = rgbs(shade(base, 0.94 + rnd() * 0.08), 0.5 * strength); g.fillRect(0, y, S, 1); }
  for (let x = 0; x < S; x += 2) { g.fillStyle = rgbs(shade(base, 0.95 + rnd() * 0.06), 0.4 * strength); g.fillRect(x, 0, 1, S); }
}

function flower(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: [number, number, number], rot: number, centre: [number, number, number]): void {
  g.fillStyle = rgbs(col, 0.92);
  for (let i = 0; i < 5; i++) { const a = rot + (i / 5) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.55, r * 0.34, a, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = rgbs(centre, 0.95); g.beginPath(); g.arc(x, y, r * 0.24, 0, Math.PI * 2); g.fill();
}
function snowflake(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: [number, number, number], a = 0.9): void {
  g.strokeStyle = rgbs(col, a); g.lineWidth = Math.max(1, r * 0.13); g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r); g.stroke();
    const mx = x + Math.cos(ang) * r * 0.62, my = y + Math.sin(ang) * r * 0.62;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(ang + s * 0.7) * r * 0.32, my + Math.sin(ang + s * 0.7) * r * 0.32); g.stroke(); }
  }
}

function paintCloth(g: CanvasRenderingContext2D, S: number, c: ClothSpec, slot: 'cloth' | 'under' | 'accent' | 'hem'): void {
  const rnd = mulberry(c.seed * 977 + slot.length);
  const wear = c.wear;
  const worn = (col: [number, number, number]) => mix(col, [104, 98, 86], wear * 0.42);
  const base = slot === 'under' ? worn(c.secondary) : slot === 'accent' ? c.accent : slot === 'hem' ? mix(worn(c.primary), [70, 62, 52], 0.35 + wear * 0.3) : worn(c.primary);
  weave(g, S, base, rnd, slot === 'accent' ? 0.5 : 1);
  if (slot === 'accent') {
    // Sash: a fine diagonal twill and a pair of edge lines.
    g.strokeStyle = rgbs(shade(base, 1.18), 0.28); g.lineWidth = 1;
    for (let i = -S; i < S * 2; i += 6) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); }
    if (c.motif === 'brocade' || c.motif === 'snow') { g.fillStyle = rgbs(mix(base, [255, 255, 255], 0.35), 0.5); for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) if ((i + j) % 2 === 0) { g.beginPath(); g.arc(i * S / 8 + S / 16, j * S / 8 + S / 16, S / 40, 0, Math.PI * 2); g.fill(); } }
    return;
  }
  if (slot === 'under') return;
  const motif = slot === 'hem' ? (c.motif === 'lamellar' ? 'plain' : c.motif) : c.motif;
  const light = mix(c.accent, [255, 255, 255], 0.25), dark = shade(c.primary, 0.7);
  switch (motif) {
    case 'blossom': {
      for (let i = 0; i < 9; i++) flower(g, rnd() * S, rnd() * S, S * (0.035 + rnd() * 0.03), rnd() > 0.35 ? light : mix(light, [255, 210, 220], 0.6), rnd() * 6, c.accent);
      g.strokeStyle = rgbs(mix(c.primary, [120, 160, 110], 0.4), 0.5); g.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(rnd() * S, rnd() * S); g.quadraticCurveTo(rnd() * S, rnd() * S, rnd() * S, rnd() * S); g.stroke(); }
      break;
    }
    case 'snow': {
      // Layered blue-and-white snowflake print, in the manner of the snow-moon kimono.
      for (let i = 0; i < 16; i++) snowflake(g, rnd() * S, rnd() * S, S * (0.035 + rnd() * 0.05), rnd() > 0.5 ? [246, 250, 255] : mix(c.accent, [255, 255, 255], 0.5), 0.6 + rnd() * 0.35);
      for (let i = 0; i < 40; i++) { g.fillStyle = rgbs([240, 248, 255], 0.35 + rnd() * 0.4); g.beginPath(); g.arc(rnd() * S, rnd() * S, S * (0.003 + rnd() * 0.005), 0, 6.3); g.fill(); }
      break;
    }
    case 'waves': {
      g.strokeStyle = rgbs(mix(c.primary, c.accent, 0.3), 0.5); g.lineWidth = 1.4;
      const r = S / 9;
      for (let row = 0; row < 11; row++) for (let col = -1; col < 10; col++) for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(col * r * 2 + (row % 2) * r, row * r * 0.55, r * (0.34 * k), Math.PI, 0); g.stroke(); }
      break;
    }
    case 'stripes': g.fillStyle = rgbs(dark, 0.35); for (let x = 0; x < S; x += S / 10) g.fillRect(x, 0, S / 40, S); break;
    case 'check': g.fillStyle = rgbs(dark, 0.3); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2 === 0) g.fillRect(i * S / 8, j * S / 8, S / 8, S / 8); break;
    case 'lamellar': {
      g.strokeStyle = rgbs(shade(c.primary, 0.45), 0.9); g.lineWidth = 2;
      for (let y = 0; y < S; y += S / 8) for (let x = ((y / (S / 8)) % 2) * S / 20; x < S; x += S / 10) g.strokeRect(x, y, S / 10, S / 8);
      g.strokeStyle = rgbs(c.accent, 0.6); g.lineWidth = 1; for (let y = 0; y < S; y += S / 8) { g.beginPath(); g.moveTo(0, y + 1); g.lineTo(S, y + 1); g.stroke(); }
      break;
    }
    case 'hemp': for (let i = 0; i < 260; i++) { g.strokeStyle = rgbs(shade(base, 0.85 + rnd() * 0.3), 0.4); g.beginPath(); const x = rnd() * S, y = rnd() * S; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 8, y + (rnd() - 0.5) * 2); g.stroke(); } break;
    case 'brocade': for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { flower(g, i * S / 6 + S / 12, j * S / 6 + S / 12, S * 0.05, mix(c.accent, c.primary, 0.3), 0.3, c.accent); } break;
    default: break;
  }
  if (slot === 'hem') { g.fillStyle = rgbs([60, 50, 40], 0.18); for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(rnd() * S, S * (0.4 + rnd() * 0.6), S * (0.01 + rnd() * 0.03), 0, 6.3); g.fill(); } }
}

function dyn(scene: Scene, key: string, size: number, draw: (g: CanvasRenderingContext2D) => void, held: string[], wrap = true): DynamicTexture {
  let e = canvasCache.get(key);
  if (!e || !e.tex.getInternalTexture()) {
    const t = new DynamicTexture(`ct:${key}`, { width: size, height: size }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    draw(t.getContext() as CanvasRenderingContext2D); t.update(false);
    if (wrap) { t.wrapU = Texture.WRAP_ADDRESSMODE; t.wrapV = Texture.WRAP_ADDRESSMODE; }
    t.anisotropicFilteringLevel = 4; e = { tex: t, refs: 0, used: 0 }; canvasCache.set(key, e);
  }
  e.refs++; e.used = ++cacheClock; held.push(key);
  return e.tex;
}

function weaveNormal(scene: Scene): RawTexture {
  if (clothNormal && clothNormal.getInternalTexture()) return clothNormal;
  const p = paintTexture('cloth', 41);
  clothNormal = RawTexture.CreateRGBATexture(new Uint8Array(p.normal.buffer, p.normal.byteOffset, p.normal.byteLength), p.size, p.size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  clothNormal.wrapU = Texture.WRAP_ADDRESSMODE; clothNormal.wrapV = Texture.WRAP_ADDRESSMODE; return clothNormal;
}

const c3 = (c: [number, number, number]) => new Color3(c[0] / 255, c[1] / 255, c[2] / 255).toLinearSpace();

export class CharacterMaterials {
  readonly bySlot = new Map<string, PBRMaterial>();
  private readonly owned: (PBRMaterial | DynamicTexture)[] = [];
  private readonly prints: string[] = [];
  constructor(private readonly scene: Scene, readonly id: string, spec: CharacterMaterialSpec) {
    const make = (slot: string, cfg: (m: PBRMaterial) => void) => { const m = new PBRMaterial(`${id}.${slot}`, scene); m.metallic = 0; m.roughness = 0.8; m.environmentIntensity = 0.6; m.maxSimultaneousLights = 8; cfg(m); this.bySlot.set(slot, m); this.owned.push(m); return m; };

    make('TV_SkinBody', m => { m.albedoColor = c3(spec.skin); m.roughness = 0.58; m.subSurface.isTranslucencyEnabled = false; });
    const faceKey = `face:${id}`;
    const faceTex = new DynamicTexture(faceKey, { width: 512, height: 512 }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    paintFace(faceTex.getContext() as CanvasRenderingContext2D, 512, spec.face); faceTex.update(false); faceTex.anisotropicFilteringLevel = 8; this.owned.push(faceTex);
    make('TV_SkinHead', m => { m.albedoTexture = faceTex; m.albedoColor = Color3.White(); m.roughness = 0.5; });
    const eyeTex = new DynamicTexture(`eye:${id}`, { width: 128, height: 128 }, scene, true); paintEye(eyeTex.getContext() as CanvasRenderingContext2D, 128, spec.eye); eyeTex.update(false); this.owned.push(eyeTex);
    make('TV_Eye', m => { m.albedoTexture = eyeTex; m.albedoColor = Color3.White(); m.roughness = 0.08; m.environmentIntensity = 1; m.clearCoat.isEnabled = true; m.clearCoat.intensity = 0.6; m.clearCoat.roughness = 0.03; });
    make('TV_Hair', m => { m.albedoColor = c3(spec.hair); m.roughness = 0.42; m.metallic = 0.0; if (spec.hairEmissive) m.emissiveColor = c3(spec.hair).scale(spec.hairEmissive); m.sheen.isEnabled = true; m.sheen.intensity = spec.hairShine ?? 0.5; m.sheen.color = c3(mix(spec.hair, [255, 255, 255], 0.5)); });

    const cl = spec.cloth, weaveN = weaveNormal(scene);
    const key = (slot: string) => `${slot}:${cl.motif}:${cl.primary}|${cl.secondary}|${cl.accent}|${Math.round(cl.wear * 4)}:${cl.seed % 4}`;
    for (const [slot, kind] of [['TV_Cloth', 'cloth'], ['TV_Under', 'under'], ['TV_Accent', 'accent'], ['TV_Hem', 'hem']] as const) {
      const tex = dyn(scene, key(slot), 256, g => paintCloth(g, 256, cl, kind), this.prints);
      make(slot, m => {
        m.albedoTexture = tex; m.albedoColor = Color3.White(); m.bumpTexture = weaveN; m.bumpTexture.level = 0.22; m.roughness = slot === 'TV_Accent' ? 0.45 : 0.88;
        m.sheen.isEnabled = true; m.sheen.intensity = slot === 'TV_Accent' ? 0.5 : 0.25; m.sheen.color = c3(mix(cl.accent, [255, 255, 255], 0.4));
        if (tex) { tex.uScale = 1; tex.vScale = 1; }
      });
    }
    make('TV_Metal', m => { m.albedoColor = new Color3(0.86, 0.68, 0.30).toLinearSpace(); m.metallic = 0.95; m.roughness = 0.32; m.environmentIntensity = 1.2; });
    make('TV_Leather', m => { m.albedoColor = new Color3(0.30, 0.19, 0.12).toLinearSpace(); m.roughness = 0.66; });
    make('TV_Fur', m => { const f = spec.fur ?? [238, 232, 220]; m.albedoColor = c3(f); m.roughness = 0.96; if (spec.furGlow) m.emissiveColor = c3(f).scale(0.12); m.sheen.isEnabled = true; m.sheen.intensity = 0.8; m.sheen.color = new Color3(1, 1, 1); });
    make('TV_Straw', m => { const s = spec.straw ?? [204, 172, 98]; m.albedoColor = c3(s); m.roughness = 0.92; });
    make('TV_Lacquer', m => { const l = spec.lacquer ?? [30, 26, 30]; m.albedoColor = c3(l); m.roughness = 0.28; m.clearCoat.isEnabled = true; m.clearCoat.intensity = 0.8; });
    make('TV_Crystal', m => { m.albedoColor = new Color3(0.72, 0.88, 1); m.roughness = 0.08; m.alpha = 0.85; m.emissiveColor = new Color3(0.25, 0.4, 0.6); });
  }
  dispose(): void { for (const o of this.owned) o.dispose(); this.bySlot.clear(); releasePrints(this.prints); this.prints.length = 0; }
}
