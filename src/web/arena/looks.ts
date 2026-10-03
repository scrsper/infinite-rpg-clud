import type { AppearanceDescription } from '../net/messages';

/** Arena fighters dressed from the Torn Veil human kits and Ashford garments (same descriptions the world uses). */
const person = (o: Partial<AppearanceDescription> & Pick<AppearanceDescription, 'garmentSilhouette' | 'garmentPalette' | 'presentation'>): AppearanceDescription => ({
  archetype: 'arena', culture: 'ashford', skinTone: 'tan', faceShape: 'oval', hairStyle: 'tied_back', hairColor: 'brown', eyeColor: 'brown', frame: 'average', stature: 'average',
  accessories: [], culturalTags: ['ashford'], grooming: 0.7, wear: 0.4, status: 'modest', agePresentation: 'adult', roleCues: [], ...o,
} as AppearanceDescription);

export const LOOKS = {
  hero: person({ presentation: 'masculine', garmentSilhouette: 'lamellar_armour', garmentPalette: 'ronin_charcoal', hairStyle: 'warrior_bun', frame: 'sturdy', stature: 'above_average', faceShape: 'angular', accessories: ['helm'], roleCues: ['helm'], culturalTags: ['ashford', 'lamellar'], wear: .35 }),
  brann: person({ presentation: 'masculine', garmentSilhouette: 'fur_mantle', garmentPalette: 'earth_work', hairStyle: 'unkempt', frame: 'powerful', skinTone: 'bronze', hairColor: 'black', wear: .6 }),
  wren: person({ presentation: 'feminine', garmentSilhouette: 'travel_coat', garmentPalette: 'moss_hunt', hairStyle: 'braided', accessories: ['hood', 'arm_wrap'], roleCues: ['hood', 'bow'], eyeColor: 'green', skinTone: 'olive' }),
  raider: person({ presentation: 'masculine', garmentSilhouette: 'ragged_layers', garmentPalette: 'outlaw_soot', hairStyle: 'unkempt', accessories: ['hood'], status: 'destitute', wear: .9, grooming: .15, skinTone: 'brown' }),
  raider_f: person({ presentation: 'feminine', garmentSilhouette: 'ragged_layers', garmentPalette: 'outlaw_soot', hairStyle: 'loose_long', accessories: ['hood'], status: 'destitute', wear: .85, grooming: .2, skinTone: 'fair' }),
  soldier: person({ presentation: 'masculine', garmentSilhouette: 'lamellar_armour', garmentPalette: 'watch_vermilion', hairStyle: 'cropped', frame: 'sturdy', accessories: ['helm'], roleCues: ['helm', 'spear'], culturalTags: ['ashford', 'lamellar'] }),
  archer: person({ presentation: 'masculine', garmentSilhouette: 'travel_coat', garmentPalette: 'outlaw_soot', hairStyle: 'short_swept', accessories: ['hood'], roleCues: ['hood', 'bow'], skinTone: 'fair', wear: .7 }),
  mystic: person({ presentation: 'feminine', garmentSilhouette: 'ceremonial_robe', garmentPalette: 'temple_slate', hairStyle: 'updo_ornamented', hairColor: 'black', accessories: ['hair_ornament'], status: 'comfortable', skinTone: 'porcelain', eyeColor: 'grey' }),
};
export type LookId = keyof typeof LOOKS;
