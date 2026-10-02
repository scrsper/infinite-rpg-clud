import { MaterialPluginBase, ShaderLanguage, type UniformBuffer } from '@babylonjs/core';

/**
 * Vertex-only breeze for the grass field. The instance matrices stay fixed: only
 * the upper blade profile moves, which keeps scattering deterministic and avoids
 * rewriting the thin-instance buffers every frame.
 */
export class GrassWind extends MaterialPluginBase {
  private time = 0;
  private strength = 0;

  constructor(material: import('@babylonjs/core').PBRMaterial) {
    super(material, 'TornVeilGrassWind', 210, {}, true, true);
  }

  setWind(dt: number, projectedWind: number, reducedMotion: boolean): void {
    this.time += Math.max(0, dt);
    this.strength = reducedMotion ? 0 : Math.max(0, Math.min(1, projectedWind)) * 0.055;
  }

  override getUniforms(): { ubo: Array<{ name: string; size: number; type: string }> } {
    return { ubo: [{ name: 'tvGrassWind', size: 4, type: 'vec4' }] };
  }

  override bindForSubMesh(buffer: UniformBuffer): void {
    // A stable world-space direction gives nearby tufts coherent motion while
    // the world position term makes each tuft phase slightly different.
    buffer.updateFloat4('tvGrassWind', this.time, this.strength, 0.82, 0.57);
  }

  override getCustomCode(type: string, language = ShaderLanguage.GLSL): Record<string, string> | null {
    if (type !== 'vertex') return null;
    const wgsl = language === ShaderLanguage.WGSL;
    return {
      CUSTOM_VERTEX_UPDATE_POSITION: wgsl ? `
        // This hook runs before instancesVertex creates finalWorld. Use the
        // thin-instance translation attribute directly for phase variation.
        #ifdef INSTANCES
        let tvGrassWorldXZ = vertexInputs.world3.xz + positionUpdated.xz;
        #else
        let tvGrassWorldXZ = positionUpdated.xz;
        #endif
        let tvGrassTip = smoothstep(0.04, 0.42, positionUpdated.y);
        let tvGrassDir = uniforms.tvGrassWind.zw;
        let tvGrassPhase = dot(tvGrassWorldXZ, tvGrassDir) * 0.23 + uniforms.tvGrassWind.x * 1.4;
        let tvGrassWave = sin(tvGrassPhase) + 0.35 * sin(tvGrassPhase * 1.7 + 1.9);
        positionUpdated.xz += tvGrassDir * (tvGrassWave * uniforms.tvGrassWind.y * tvGrassTip * tvGrassTip);
      ` : `
        // This hook runs before instancesVertex creates finalWorld. Use the
        // thin-instance translation attribute directly for phase variation.
        #ifdef INSTANCES
        vec2 tvGrassWorldXZ = world3.xz + positionUpdated.xz;
        #else
        vec2 tvGrassWorldXZ = positionUpdated.xz;
        #endif
        float tvGrassTip = smoothstep(0.04, 0.42, positionUpdated.y);
        vec2 tvGrassDir = tvGrassWind.zw;
        float tvGrassPhase = dot(tvGrassWorldXZ, tvGrassDir) * 0.23 + tvGrassWind.x * 1.4;
        float tvGrassWave = sin(tvGrassPhase) + 0.35 * sin(tvGrassPhase * 1.7 + 1.9);
        positionUpdated.xz += tvGrassDir * (tvGrassWave * tvGrassWind.y * tvGrassTip * tvGrassTip);
      `,
    };
  }
}
