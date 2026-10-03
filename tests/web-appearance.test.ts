import { describe, expect, it } from 'vitest';
import { realize } from '../src/web/actors/appearanceMap';
import { projectAppearanceDescription } from '../src/sim/core/appearance';
import { resolveAppearance } from '../src/sim/world/characterAppearance';

describe('existing couture realises canonical human clothing', () => {
  const base=projectAppearanceDescription(resolveAppearance({seed:91,identity:'festival',age:26,gender:'f',occupation:'merchant',wealth:200,archetype:'hana'}).description!,26,'merchant');
  it('uses the existing layered rig for crimson festival silk while retaining its palette and human anatomy', () => {
    const r=realize('festival',{...base,garmentPalette:'festival_crimson',garmentSilhouette:'formal_kimono',culturalTags:['festival_silk','blossom_motif'],accessories:['hair_ornament','ear_drops']},undefined);
    expect(r.parts).toContain('G_furisode_hero');expect(r.parts).toContain('Hero_bow');expect(r.parts).toContain('Hero_filigree');
    expect(r.parts).not.toContain('Hero_ears');expect(r.parts).not.toContain('Hero_tail');expect(r.parts).not.toContain('Hero_stole');
    expect(r.materials.cloth.primary).toEqual([122,26,36]);expect(r.materials.cloth.motif).toBe('blossom');
  });
  it('retains the existing snow-moon wardrobe and leaves ordinary work clothing alone', () => {
    const snow=realize('snow',{...base,garmentPalette:'snow_moon',garmentSilhouette:'layered_kimono'},undefined);
    expect(snow.parts).toContain('Hero_stole');expect(snow.parts).toContain('Hero_gemstones');expect(snow.parts).not.toContain('Hero_ears');
    const work=realize('work',{...base,garmentPalette:'earth_work',garmentSilhouette:'work_kimono'},undefined);
    expect(work.parts).toContain('G_work_kimono');expect(work.parts).not.toContain('G_furisode_hero');
  });
});
