import { describe, expect, it } from 'vitest';
import { NullEngine, PBRMaterial, Scene, ShaderLanguage, ShaderStore } from '@babylonjs/core';
import '@babylonjs/core/Shaders/pbr.fragment';
import '@babylonjs/core/ShadersWGSL/pbr.fragment';
import { GroundCover } from '../src/web/render/groundCover';

describe('terrain material integration', () => {
  it('injects its blend into an actual PBR hook on both backends', () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    const material = new PBRMaterial('terrain', scene); const cover = new GroundCover(material);
    for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
      const code = cover.getCustomCode('fragment', language)!;
      const shader = ShaderStore.GetShadersStore(language).pbrPixelShader;
      for (const hook of Object.keys(code)) expect(shader).toContain(`#define ${hook}`);
      expect(code.CUSTOM_FRAGMENT_BEFORE_LIGHTS).toContain('surfaceAlbedo = mix');
    }
    scene.dispose(); engine.dispose();
  });
});
