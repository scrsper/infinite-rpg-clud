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
  const morphs: Record<string, number> = {};
  const fs = desc.faceShape; if (fs && fs !== 'oval') morphs[`face_${fs}`] = 0.85;
  if (desc.presentation === 'feminine') morphs.feminine = 0.7; else if (desc.presentation === 'masculine') morphs.masculine = 0.7;
  const tools = [...cues].filter(c => ['hoe', 'hammer', 'axe', 'bow', 'spear', 'sword', 'walking_staff', 'tray', 'ledger', 'satchel', 'grain_sack'].includes(c));
  const stature = proj?.height ?? STATURE_HEIGHT[desc.stature as keyof typeof STATURE_HEIGHT] ?? 1;
  const build = proj?.build ?? FRAME_BUILD[desc.frame as keyof typeof FRAME_BUILD] ?? 1;
  const ageK = desc.agePresentation === 'adolescent' ? 0.93 : desc.agePresentation === 'elder' ? 0.97 : 1;
  return {
    kit, heightScale: kit === 'c' ? Math.max(0.85, Math.min(1.1, stature)) : Math.max(0.86, Math.min(1.12, stature)) * ageK, buildScale: Math.max(0.85, Math.min(1.18, build)), parts, morphs,
    materials: { skin, hair, eye, lip, face, cloth, hairShine: 0.5 }, hairStyle: desc.hairStyle, garment: desc.garmentSilhouette, tools,
  };
}

function fallback(id: string, proj: ProjectedAppearance | undefined, seed: number): Realization {
  const kit: KitId = seed % 2 ? 'm' : 'f';
  const skin = rgb(proj?.skin ?? 0xc99a72), hair = rgb(proj?.hair ?? 0x4a2f1a), shirt = rgb(proj?.shirt ?? 0x6a5a3a), pants = rgb(proj?.pants ?? 0x3a3a38);
  const cloth: ClothSpec = { primary: shirt, secondary: pants, accent: rgb(mixColour(proj?.shirt ?? 0x6a5a3a, 0xc9a24c, 0.4)), motif: 'plain', wear: 0.3, seed: seed % 1000 };
  const face: FaceSpec = { skin, hair, eyeColor: [74, 42, 22], lipTint: [skin[0] * 0.92, skin[1] * 0.6, skin[2] * 0.62], presentation: kit === 'f' ? 'feminine' : 'masculine', age: 'adult', grooming: 0.6, wear: 0.3, beard: 0, seed };
  return { kit, heightScale: proj?.height ?? 1, buildScale: proj?.build ?? 1, parts: ['Body', 'Head', 'EyeL', 'EyeR', 'G_work_kimono', 'Hair_cropped', 'Foot_zori'], morphs: {}, materials: { skin, hair, eye: [74, 42, 22], lip: face.lipTint, face, cloth }, hairStyle: 'cropped', garment: 'work_kimono', tools: [] };
}
