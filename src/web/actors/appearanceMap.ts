import { EYE_COLORS, GARMENT_PALETTES, HAIR_COLORS, SKIN_TONES, STATURE_HEIGHT, FRAME_BUILD, mixColour } from '../../sim/core/appearance';
import type { AppearanceDescription, ProjectedAppearance } from '../net/messages';
import type { CharacterMaterialSpec, ClothSpec, Motif } from './characterMaterials';
import type { FaceSpec } from './faceTexture';

/**
 * The browser's realisation of canonical appearance tokens.
 *
 * The simulation persists *tokens* ('layered_kimono', 'silver', 'heart') and deliberately says nothing
 * about meshes. This module is this client's whole opinion on what those tokens look like: which
 * kit and parts to show, how to colour them, which face morphs to blend, what to paint. It reads
 * only the projected description, is deterministic (the same person always looks the same), and
 * invents nothing that would need to be saved: cosmetics only, never fed back into the world.
 */
export type KitId = 'f' | 'm' | 'c';
export interface Realization {
  kit: KitId; heightScale: number; buildScale: number;
  parts: string[];                       // top-level part names to keep from the kit
  morphs: Record<string, number>;
  materials: CharacterMaterialSpec;
  hairStyle: string; garment: string;
  hero?: boolean;
  tools: string[];
}

const rgb = (n: number): [number, number, number] => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const hashStr = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

const HAT_FROM_ACCESSORY: Record<string, string> = { helm: 'Hat_helm', hood: 'Hat_hood', travel_hood: 'Hat_hood', cap: 'Hat_cap', wide_hat: 'Hat_wide', straw_hat: 'Hat_wide' };
const SILHOUETTE_MOTIF: Record<string, Motif> = {
  work_kimono: 'plain', layered_kimono: 'plain', formal_kimono: 'brocade', hakama_set: 'stripes', dancer_wrap: 'blossom', travel_coat: 'plain', lamellar_armour: 'lamellar',
  ceremonial_robe: 'brocade', apron_over_tunic: 'hemp', tunic_trousers: 'hemp', ragged_layers: 'hemp', fur_mantle: 'hemp', ascetic_wrap: 'plain',
};

export function motifFor(desc: AppearanceDescription): Motif {
  const tags = desc.culturalTags ?? [];
  if (tags.includes('snow_moon') || desc.garmentPalette === 'snow_moon') return 'snow';
  if (tags.includes('blossom_motif')) return 'blossom';
  if (tags.includes('festival_silk') || tags.includes('dragon_silk')) return 'waves';
  if (tags.includes('lamellar') && desc.garmentSilhouette === 'lamellar_armour') return 'lamellar';
  return SILHOUETTE_MOTIF[desc.garmentSilhouette] ?? 'plain';
}

export function kitFor(desc: AppearanceDescription | undefined, id: string): KitId {
  if (!desc) return hashStr(id) % 2 ? 'm' : 'f';
  if (desc.agePresentation === 'child') return 'c';
  if (desc.presentation === 'feminine') return 'f';
  if (desc.presentation === 'masculine') return 'm';
  return hashStr(id) % 2 ? 'm' : 'f';
}

export function realize(id: string, desc: AppearanceDescription | undefined, proj: ProjectedAppearance | undefined): Realization {
  const seed = hashStr(id + (desc?.archetype ?? ''));
  if (!desc) return fallback(id, proj, seed);
  const kit = kitFor(desc, id);
  const skin = rgb(SKIN_TONES[desc.skinTone as keyof typeof SKIN_TONES] ?? SKIN_TONES.tan);
  let hair = rgb(HAIR_COLORS[desc.hairColor as keyof typeof HAIR_COLORS] ?? HAIR_COLORS.brown);
  if (desc.agePresentation === 'elder') hair = rgb(mixColour((hair[0] << 16) | (hair[1] << 8) | hair[2], 0xb8b8b8, 0.55));
  else if (desc.agePresentation === 'middle_aged') hair = rgb(mixColour((hair[0] << 16) | (hair[1] << 8) | hair[2], 0xa0a0a0, 0.2));
  const eye = rgb(EYE_COLORS[desc.eyeColor as keyof typeof EYE_COLORS] ?? EYE_COLORS.brown);
  const pal = GARMENT_PALETTES[desc.garmentPalette] ?? GARMENT_PALETTES.earth_work;
  const motif = motifFor(desc);
  const cloth: ClothSpec = { primary: rgb(pal.primary), secondary: rgb(pal.secondary), accent: rgb(pal.accent), motif, wear: desc.wear, seed: seed % 1000 };
  const fem = desc.presentation === 'feminine' || (desc.presentation === 'androgynous' && kit === 'f');
  const lip: [number, number, number] = fem ? [Math.min(255, skin[0] * 0.92 + 30), skin[1] * 0.55 + 10, skin[2] * 0.58 + 14] : [skin[0] * 0.9, skin[1] * 0.68, skin[2] * 0.66];
  const face: FaceSpec = {
    skin, hair, eyeColor: eye, lipTint: lip, presentation: desc.presentation, age: desc.agePresentation as FaceSpec['age'], grooming: desc.grooming, wear: desc.wear, seed,
    beard: (proj?.beard ?? 0) > 0 ? Math.min(1, proj!.beard!) : desc.presentation === 'masculine' && desc.agePresentation !== 'young_adult' && desc.agePresentation !== 'adolescent' && (seed % 5 === 0) ? 0.5 : 0,
    makeup: desc.culturalTags.includes('festival_silk') || desc.roleCues.includes('dancer') ? 'festival' : desc.status === 'noble' || desc.status === 'affluent' ? (fem ? 'court' : 'none') : 'none',
  };
  const parts = ['Body', 'Head', 'EyeL', 'EyeR', `G_${desc.garmentSilhouette}`, `Hair_${desc.hairStyle}`];
  if (desc.garmentSilhouette === 'fur_mantle') parts.push('G_fur_mantle_piece');
  const cues = new Set(desc.roleCues), acc = new Set(desc.accessories);
  const boots = cues.has('helm') || cues.has('travel_pack') || cues.has('bow') || cues.has('spear') || desc.garmentSilhouette === 'travel_coat' || desc.garmentSilhouette === 'lamellar_armour';
  const formal = desc.garmentSilhouette === 'formal_kimono' || desc.garmentSilhouette === 'ceremonial_robe' || desc.culturalTags.includes('festival_silk');
  parts.push(boots ? 'Foot_boots' : formal ? 'Foot_geta' : 'Foot_zori');
  let hat: string | undefined;
  for (const a of desc.accessories) if (HAT_FROM_ACCESSORY[a]) { hat = HAT_FROM_ACCESSORY[a]; break; }
  if (!hat) for (const a of desc.roleCues) if (HAT_FROM_ACCESSORY[a]) { hat = HAT_FROM_ACCESSORY[a]; break; }
  if (hat) parts.push(hat);
  if (acc.has('hair_ornament')) parts.push('Ornament_pins');
  if (acc.has('ear_drops')) parts.push('Accessory_ear_drops');
  if (acc.has('arm_wrap')) parts.push('Accessory_arm_wrap');
  if (acc.has('prayer_beads') || cues.has('prayer_beads')) parts.push('Accessory_prayer_beads');
  if (acc.has('travel_pack') || cues.has('travel_pack')) parts.push('Accessory_travel_pack');
  // Existing couture geometry realises snow-moon and festival-silk clothing in play.
  // Human anatomy remains human: the showroom's fox ears/tail are never added here.
  const snowCouture = desc.garmentPalette === 'snow_moon' && desc.garmentSilhouette === 'layered_kimono';
  const festivalCouture = desc.garmentPalette === 'festival_crimson' && desc.garmentSilhouette === 'formal_kimono';
  const couture = kit === 'f' && (snowCouture || festivalCouture);
  if (couture) {
    if (snowCouture) { cloth.primary = [238, 236, 227]; cloth.secondary = [26, 37, 70]; cloth.accent = [34, 47, 86]; }
    for (let i = parts.length - 1; i >= 0; i--) if (/^(G_|Hair_|Foot_)/.test(parts[i])) parts.splice(i, 1);
    parts.push('G_furisode_hero', 'Hair_hero_long', 'Foot_geta', 'Hero_bow', 'Hero_filigree');
    if (snowCouture) parts.push('Hero_stole', 'Hero_gemstones');
    if (acc.has('hair_ornament')) parts.push('Hero_ornaments', 'Hero_flower');
  }
  const morphs: Record<string, number> = {};
  const fs = desc.faceShape; if (fs && fs !== 'oval') morphs[`face_${fs}`] = 0.85;
  if (desc.presentation === 'feminine') morphs.feminine = 0.7; else if (desc.presentation === 'masculine') morphs.masculine = 0.7;
  const tools = [...cues].filter(c => ['hoe', 'hammer', 'axe', 'bow', 'spear', 'sword', 'walking_staff', 'tray', 'ledger', 'satchel', 'grain_sack'].includes(c));
  const stature = proj?.height ?? STATURE_HEIGHT[desc.stature as keyof typeof STATURE_HEIGHT] ?? 1;
  const build = proj?.build ?? FRAME_BUILD[desc.frame as keyof typeof FRAME_BUILD] ?? 1;
  const ageK = desc.agePresentation === 'adolescent' ? 0.93 : desc.agePresentation === 'elder' ? 0.97 : 1;
  return {
    kit, heightScale: kit === 'c' ? Math.max(0.85, Math.min(1.1, stature)) : Math.max(0.86, Math.min(1.12, stature)) * ageK, buildScale: Math.max(0.85, Math.min(1.18, build)), parts, morphs,
    materials: { skin, hair, eye, lip, face, cloth, hairShine: couture ? .75 : .5 }, hairStyle: couture ? 'hero_long' : desc.hairStyle, garment: desc.garmentSilhouette, tools,
  };
}

function fallback(id: string, proj: ProjectedAppearance | undefined, seed: number): Realization {
  const kit: KitId = seed % 2 ? 'm' : 'f';
  const skin = rgb(proj?.skin ?? 0xc99a72), hair = rgb(proj?.hair ?? 0x4a2f1a), shirt = rgb(proj?.shirt ?? 0x6a5a3a), pants = rgb(proj?.pants ?? 0x3a3a38);
  const cloth: ClothSpec = { primary: shirt, secondary: pants, accent: rgb(mixColour(proj?.shirt ?? 0x6a5a3a, 0xc9a24c, 0.4)), motif: 'plain', wear: 0.3, seed: seed % 1000 };
  const face: FaceSpec = { skin, hair, eyeColor: [74, 42, 22], lipTint: [skin[0] * 0.92, skin[1] * 0.6, skin[2] * 0.62], presentation: kit === 'f' ? 'feminine' : 'masculine', age: 'adult', grooming: 0.6, wear: 0.3, beard: 0, seed };
  return { kit, heightScale: proj?.height ?? 1, buildScale: proj?.build ?? 1, parts: ['Body', 'Head', 'EyeL', 'EyeR', 'G_work_kimono', 'Hair_cropped', 'Foot_zori'], morphs: {}, materials: { skin, hair, eye: [74, 42, 22], lip: face.lipTint, face, cloth }, hairStyle: 'cropped', garment: 'work_kimono', tools: [] };
}

/**
 * The art-preview hero (docs/web/STYLE.md, art/reference/web-rebirth/02-ice-character.png): a silver-haired
 * woman in a white-and-blue snowflake kimono with a navy sash, an ivory fur stole, gold and crystal
 * ornaments, fox ears and a full tail. Ears and tail are NOT canonical: the simulation has no species that
 * has them, so this figure only ever exists in the showroom and is labelled as a presentation preview.
 */
export function heroRealization(): Realization {
  const desc: AppearanceDescription = {
    archetype: 'hero-preview', culture: 'ashford', presentation: 'feminine', skinTone: 'porcelain', faceShape: 'heart', hairStyle: 'loose_long', hairColor: 'silver', eyeColor: 'blue', frame: 'lean', stature: 'above_average',
    garmentSilhouette: 'layered_kimono', garmentPalette: 'snow_moon', accessories: ['hair_ornament', 'ear_drops'], culturalTags: ['ashford', 'snow_moon'], grooming: 1, wear: 0, status: 'noble', agePresentation: 'adult', roleCues: [],
  };
  const r = realize('hero-preview', desc, undefined);
  r.parts = ['Body', 'Head', 'EyeL', 'EyeR', 'G_furisode_hero', 'Hair_hero_long', 'Foot_geta', 'Hero_ears', 'Hero_tail', 'Hero_stole', 'Hero_ornaments', 'Hero_bow', 'Hero_flower', 'Hero_filigree', 'Hero_gemstones', 'Accessory_ear_drops'];
  r.materials.cloth = { primary: [168, 200, 236], secondary: [30, 44, 96], accent: [26, 38, 84], motif: 'snow', wear: 0, seed: 7 };
  r.materials.fur = [244, 240, 232]; r.materials.furGlow = true; r.materials.hairShine = 0.9; r.materials.hairEmissive = 0.06;
  r.materials.face.makeup = 'court';
  r.morphs = { face_heart: 0.8, feminine: 0.9 };
  r.hero = true; r.hairStyle = 'hero_long'; r.garment = 'furisode_hero';
  return r;
}
