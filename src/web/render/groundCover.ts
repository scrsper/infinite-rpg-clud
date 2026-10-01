import { MaterialPluginBase, PBRMaterial, ShaderLanguage, Texture, type BaseTexture, type UniformBuffer } from '@babylonjs/core';

/** Blend grass into the existing ground surface using the projected biome at each vertex.
 * Alpha is a material weight here, never transparency. It adds no height or collision. */
export class GroundCover extends MaterialPluginBase {
  private readonly grass: Texture;
  constructor(material: PBRMaterial) {
    super(material, 'TornVeilGroundCover', 200, {}, true, true);
    this.grass = new Texture('/textures/world/grass_ground-albedo.jpg', material.getScene(), false, false, Texture.TRILINEAR_SAMPLINGMODE);
    this.grass.gammaSpace = true; this.grass.anisotropicFilteringLevel = 8;
    this.grass.wrapU = this.grass.wrapV = Texture.WRAP_ADDRESSMODE;
  }
  override isCompatible(): boolean { return true; }
  override isReadyForSubMesh(): boolean { return this.grass.isReady(); }
  override getSamplers(samplers: string[]): void { samplers.push('tvGroundGrass'); }
  override getActiveTextures(textures: BaseTexture[]): void { textures.push(this.grass); }
  override bindForSubMesh(buffer: UniformBuffer): void { buffer.setTexture('tvGroundGrass', this.grass); }
  override dispose(): void { this.grass.dispose(); }
  override getCustomCode(type: string, language = ShaderLanguage.GLSL): Record<string, string> | null {
    const wgsl = language === ShaderLanguage.WGSL;
    if (type === 'vertex') return {
      CUSTOM_VERTEX_DEFINITIONS: wgsl ? 'varying tvGrassWeight: f32;' : 'varying float tvGrassWeight;',
      CUSTOM_VERTEX_MAIN_END: wgsl ? 'vertexOutputs.tvGrassWeight = vertexInputs.color.a;' : 'tvGrassWeight = color.a;',
    };
    if (type !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: wgsl ? 'varying tvGrassWeight: f32; var tvGroundGrass: texture_2d<f32>; var tvGroundGrassSampler: sampler;' : 'varying float tvGrassWeight; uniform sampler2D tvGroundGrass;',
      CUSTOM_FRAGMENT_UPDATE_ALBEDO: wgsl
        ? `surfaceAlbedo = mix(surfaceAlbedo, toLinearSpaceVec3(textureSample(tvGroundGrass, tvGroundGrassSampler, fragmentInputs.vAlbedoUV).rgb) * fragmentInputs.vColor.rgb, fragmentInputs.tvGrassWeight);`
        : `surfaceAlbedo = mix(surfaceAlbedo, toLinearSpace(texture2D(tvGroundGrass, vAlbedoUV).rgb) * vColor.rgb, tvGrassWeight);`,
    };
  }
}
