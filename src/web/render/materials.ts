import { Color3, PBRMaterial, RawTexture, Scene, Texture, type Nullable } from '@babylonjs/core';
import { paintTexture, type PaintedTexture, type TextureKind } from './textures';

/**
 * Shared materials for the world. Each is a PBR material over procedural texture detail, tinted
 * from the reference palette (weathered stone, ivory plaster, dark timber, slate and terracotta
 * roofs, pale-gold metal). UVs are world-space metres, so `metres` says how big one texture tile is.
 */
export type MatName =
  | 'plaster' | 'planks' | 'darkwood' | 'log' | 'stone' | 'cobble' | 'moss' | 'roofTile' | 'roofSlate' | 'thatch' | 'cloth' | 'clothRed' | 'clothBlue'
  | 'terrain' | 'path' | 'glass' | 'iron' | 'gold' | 'hay' | 'water' | 'bark' | 'leaf' | 'leafDark' | 'rock' | 'farmland' | 'wood' | 'props';
interface Spec { texture: TextureKind; tint: [number, number, number]; metres: number; roughness?: number; metallic?: number; bump?: number; alpha?: number; emissive?: [number, number, number] }

const c = (hex: number): [number, number, number] => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const SPECS: Record<MatName, Spec> = {
  plaster: { texture: 'plaster', tint: c(0xe9e0cb), metres: 2.5 },
  planks: { texture: 'planks', tint: c(0xc39a68), metres: 2 },
  darkwood: { texture: 'darkwood', tint: c(0x9a7454), metres: 2 },
  wood: { texture: 'planks', tint: c(0x9a7248), metres: 2 },
  log: { texture: 'log', tint: c(0x9a7248), metres: 2 },
  stone: { texture: 'stonebrick', tint: c(0xc4c0b4), metres: 2, bump: 1.3 },
  cobble: { texture: 'cobble', tint: c(0x8f8b83), metres: 2, bump: 1.3 },
  moss: { texture: 'stonebrick', tint: c(0x7f9070), metres: 2, bump: 1.3 },
  roofTile: { texture: 'roofTile', tint: c(0xc26a55), metres: 2 },
  roofSlate: { texture: 'roofTile', tint: c(0x6a7286), metres: 2 },
  thatch: { texture: 'thatch', tint: c(0xe2bf72), metres: 2.5, roughness: 0.98 },
  cloth: { texture: 'cloth', tint: c(0xd8d1bd), metres: 1 },
  clothRed: { texture: 'cloth', tint: c(0x9a2c34), metres: 1 },
  clothBlue: { texture: 'cloth', tint: c(0x3f5f9a), metres: 1 },
  terrain: { texture: 'ground', tint: [1, 1, 1], metres: 3, roughness: 0.96, bump: 0.8 },
  path: { texture: 'ground', tint: [1, 1, 1], metres: 2, roughness: 0.97, bump: 1 },
  farmland: { texture: 'ground', tint: [1, 1, 1], metres: 1.5, roughness: 0.98, bump: 1.4 },
  glass: { texture: 'water', tint: c(0x7f9fb8), metres: 1, roughness: 0.04, metallic: 0.0, alpha: 0.32, emissive: [0, 0, 0] },
  iron: { texture: 'ground', tint: c(0x3a3d45), metres: 1, roughness: 0.5, metallic: 0.85 },
  gold: { texture: 'ground', tint: c(0xd6b25e), metres: 1, roughness: 0.35, metallic: 0.9 },
  hay: { texture: 'thatch', tint: c(0xd9b85c), metres: 1.5, roughness: 0.98 },
  water: { texture: 'water', tint: c(0x2b5a72), metres: 6, roughness: 0.05, alpha: 0.74, bump: 0.5 },
  bark: { texture: 'bark', tint: c(0x6b4c33), metres: 1.5 },
  leaf: { texture: 'leaf', tint: c(0x5d8a45), metres: 1.5, roughness: 0.75 },
  leafDark: { texture: 'leaf', tint: c(0x3c5c33), metres: 1.5, roughness: 0.75 },
  rock: { texture: 'cobble', tint: c(0x8d8a86), metres: 2, roughness: 0.93, bump: 1.4 },
  /** Small props colour themselves through vertex colours; this supplies grain, roughness and normal detail. */
  props: { texture: 'ground', tint: [1, 1, 1], metres: 0.6, roughness: 0.78, bump: 0.5 },
};

export class MaterialLibrary {
  private readonly cache = new Map<MatName, PBRMaterial>();
  private readonly textures = new Map<TextureKind, { albedo: RawTexture; normal: RawTexture; roughness: number }>();
  constructor(private readonly scene: Scene) {}

  private tex(kind: TextureKind) {
    let t = this.textures.get(kind);
    if (!t) {
      const p: PaintedTexture = paintTexture(kind, kind.length * 131 + 7);
      const make = (data: Uint8ClampedArray, srgb: boolean): RawTexture => {
        const rt = RawTexture.CreateRGBATexture(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), p.size, p.size, this.scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
        rt.wrapU = Texture.WRAP_ADDRESSMODE; rt.wrapV = Texture.WRAP_ADDRESSMODE; rt.anisotropicFilteringLevel = 8;
        void srgb; return rt;
      };
      t = { albedo: make(p.albedo, true), normal: make(p.normal, false), roughness: p.roughness };
      this.textures.set(kind, t);
    }
    return t;
  }
  /** World-space UV scale (tiles per metre) for a material. */
  tilesPerMetre(name: MatName): number { return 1 / SPECS[name].metres; }

  get(name: MatName): PBRMaterial {
    let m = this.cache.get(name);
    if (m) return m;
    const s = SPECS[name], t = this.tex(s.texture);
    m = new PBRMaterial(`mat-${name}`, this.scene);
    m.albedoTexture = t.albedo; m.albedoColor = new Color3(...s.tint);
    m.bumpTexture = t.normal; m.bumpTexture.level = s.bump ?? 1; m.invertNormalMapY = true;
    m.metallic = s.metallic ?? 0; m.roughness = s.roughness ?? t.roughness;
    m.environmentIntensity = 0.55; m.directIntensity = 1.15;
    m.specularIntensity = 0.5;
    if (s.alpha !== undefined) { m.alpha = s.alpha; m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND; m.backFaceCulling = false; m.needDepthPrePass = false; }
    if (s.emissive) m.emissiveColor = new Color3(...s.emissive);
    m.maxSimultaneousLights = 8;
    if (s.alpha === undefined && !s.emissive) m.freeze();
    this.cache.set(name, m);
    return m;
  }
  /** A per-mesh tinted variant is done through vertex colours; this returns the shared, frozen material. */
  dispose(): void { for (const m of this.cache.values()) m.dispose(); for (const t of this.textures.values()) { t.albedo.dispose(); t.normal.dispose(); } this.cache.clear(); this.textures.clear(); }
  tintOf(name: MatName): [number, number, number] { return SPECS[name].tint; }
  water(): Nullable<PBRMaterial> { return this.cache.get('water') ?? null; }
}
