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
      CUSTOM_FRAGMENT_DEFINITIONS: wgsl ? `
        varying tvGrassWeight: f32; var tvGroundGrass: texture_2d<f32>; var tvGroundGrassSampler: sampler;
        fn tvGroundNoise(p: vec2f) -> f32 {
          let i = floor(p); let f = fract(p); let s = f*f*(3.0-2.0*f);
          let h = fract(sin(vec4f(dot(i,vec2f(127.1,311.7)),dot(i+vec2f(1,0),vec2f(127.1,311.7)),dot(i+vec2f(0,1),vec2f(127.1,311.7)),dot(i+vec2f(1,1),vec2f(127.1,311.7))))*43758.5453);
          return mix(mix(h.x,h.y,s.x),mix(h.z,h.w,s.x),s.y);
        }` : `
        varying float tvGrassWeight; uniform sampler2D tvGroundGrass;
        float tvGroundNoise(vec2 p) {
          vec2 i=floor(p), f=fract(p), s=f*f*(3.0-2.0*f);
          vec4 h=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+vec2(1,1),vec2(127.1,311.7))))*43758.5453);
          return mix(mix(h.x,h.y,s.x),mix(h.z,h.w,s.x),s.y);
        }`,
      // Run after albedoOpacityBlock and before reflectivity/lighting, where both
      // the composed albedo and perturbed normal are available on either backend.
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: wgsl ? `
        let tvUV = fragmentInputs.vAlbedoUV;
        let tvPatch = tvGroundNoise(tvUV*.19);
        let tvUV2 = vec2f(tvUV.x*.73-tvUV.y*.51,tvUV.x*.51+tvUV.y*.73)+vec2f(.37,.61);
        let tvGrass = mix(textureSample(tvGroundGrass,tvGroundGrassSampler,tvUV).rgb,textureSample(tvGroundGrass,tvGroundGrassSampler,tvUV2).rgb,.45);
        let tvSoil = mix(surfaceAlbedo,toLinearSpaceVec3(textureSample(albedoSampler,albedoSamplerSampler,tvUV2).rgb)*fragmentInputs.vColor.rgb,.45);
        let tvCoverage = smoothstep(.08,.92,clamp(fragmentInputs.tvGrassWeight+(tvGroundNoise(tvUV*1.7)-.5)*.2,0.0,1.0));
        surfaceAlbedo = mix(tvSoil,toLinearSpaceVec3(tvGrass*vec3f(.91,1.12,.78))*fragmentInputs.vColor.rgb,tvCoverage)*(.83+.32*tvPatch);
        normalW = normalize(mix(normalW,normalize(fragmentInputs.vNormalW),tvCoverage*.82));
      ` : `
        vec2 tvUV = vAlbedoUV;
        float tvPatch = tvGroundNoise(tvUV*.19);
        vec2 tvUV2 = vec2(tvUV.x*.73-tvUV.y*.51,tvUV.x*.51+tvUV.y*.73)+vec2(.37,.61);
        vec3 tvGrass = mix(texture2D(tvGroundGrass,tvUV).rgb,texture2D(tvGroundGrass,tvUV2).rgb,.45);
        vec3 tvSoil = mix(surfaceAlbedo,toLinearSpace(texture2D(albedoSampler,tvUV2).rgb)*vColor.rgb,.45);
        float tvCoverage = smoothstep(.08,.92,clamp(tvGrassWeight+(tvGroundNoise(tvUV*1.7)-.5)*.2,0.0,1.0));
        surfaceAlbedo = mix(tvSoil,toLinearSpace(tvGrass*vec3(.91,1.12,.78))*vColor.rgb,tvCoverage)*(.83+.32*tvPatch);
        normalW = normalize(mix(normalW,normalize(vNormalW),tvCoverage*.82));
      `,
    };
  }
}
