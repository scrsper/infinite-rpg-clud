import {
  AbstractEngine, SSAO2RenderingPipeline, Color3, Color4, ColorCurves, DefaultRenderingPipeline, Engine, HDRCubeTexture, ImageProcessingConfiguration, Scene, ScenePerformancePriority, Vector3, WebGPUEngine,
} from '@babylonjs/core';

export type RendererKind = 'webgpu' | 'webgl2';
export type QualityTier = 'high' | 'balanced' | 'low';

export interface QualityProfile {
  tier: QualityTier;
  /** Multiplier on device pixel ratio (1 = native). */
  resolutionScale: number;
  shadowMapSize: number;
  shadowCascades: number;
  shadowDistance: number;
  bloom: boolean;
  msaaSamples: number;
  grain: boolean;
  drawDistance: number;
  fogDensityScale: number;
  maxLights: number;
  treeDensity: number;
  vegetationNear: number;
  vegetationFar: number;
  grass: boolean;
}
export const QUALITY: Record<QualityTier, QualityProfile> = {
  high: { tier: 'high', resolutionScale: 1, shadowMapSize: 2048, shadowCascades: 3, shadowDistance: 140, bloom: true, msaaSamples: 4, grain: true, drawDistance: 900, fogDensityScale: 1, maxLights: 6, treeDensity: 1, vegetationNear: 120, vegetationFar: 420, grass: true },
  balanced: { tier: 'balanced', resolutionScale: 1, shadowMapSize: 1024, shadowCascades: 3, shadowDistance: 100, bloom: true, msaaSamples: 4, grain: false, drawDistance: 700, fogDensityScale: 1, maxLights: 6, treeDensity: 0.8, vegetationNear: 100, vegetationFar: 360, grass: true },
  low: { tier: 'low', resolutionScale: 0.85, shadowMapSize: 1024, shadowCascades: 2, shadowDistance: 70, bloom: false, msaaSamples: 1, grain: false, drawDistance: 500, fogDensityScale: 1.15, maxLights: 4, treeDensity: 0.5, vegetationNear: 70, vegetationFar: 260, grass: false },
};

export interface RenderContext {
  engine: AbstractEngine;
  scene: Scene;
  canvas: HTMLCanvasElement;
  kind: RendererKind;
  quality: QualityProfile;
  pipeline: DefaultRenderingPipeline | null;
  ssao?: SSAO2RenderingPipeline;
  /** Why WebGPU was not used, if it was not. */
  fallbackReason: string | null;
  setQuality(tier: QualityTier): void;
  dispose(): void;
}

/**
 * Create the renderer. WebGL2 is the verified default; WebGPU can be selected explicitly with
 * `?renderer=webgpu` for compatibility testing. Nothing
 * here touches game state: the renderer can be lost, rebuilt or run at any frame rate without
 * changing a single canonical outcome.
 */
export async function createRenderer(canvas: HTMLCanvasElement, options: { prefer?: RendererKind; quality?: QualityTier } = {}): Promise<RenderContext> {
  let engine: AbstractEngine | null = null, kind: RendererKind = 'webgl2', fallbackReason: string | null = null;
  if (options.prefer === 'webgpu') {
    try {
      if (await WebGPUEngine.IsSupportedAsync) {
        const gpu = new WebGPUEngine(canvas, { antialias: true, adaptToDeviceRatio: true, powerPreference: 'high-performance', stencil: true, setMaximumLimits: true });
        await gpu.initAsync();
        engine = gpu; kind = 'webgpu';
      } else fallbackReason = 'WebGPU is not available in this browser';
    } catch (e) { fallbackReason = `WebGPU failed to start: ${String((e as Error)?.message ?? e)}`; engine = null; }
  } else fallbackReason = options.prefer === 'webgl2' ? 'WebGL2 requested' : 'Verified WebGL2 presentation path';
  if (!engine) {
    engine = new Engine(canvas, true, { antialias: true, adaptToDeviceRatio: true, powerPreference: 'high-performance', stencil: true, preserveDrawingBuffer: false }, true);
    kind = 'webgl2';
  }
  const tier: QualityTier = options.quality ?? 'balanced';
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;               // simulation and glTF are both right-handed, Y up, forward = -Z
  scene.clearColor = new Color4(0.05, 0.06, 0.09, 1);
  scene.ambientColor = new Color3(0.2, 0.22, 0.28);
  scene.skipPointerMovePicking = true;
  scene.performancePriority = ScenePerformancePriority.Intermediate;
  scene.autoClear = true;
  // Shared, bundled CC0 sky irradiance gives skin, silk and metal a real environment response.
  // The visible sky and key light remain projections of canonical time and weather.
  scene.environmentTexture = new HDRCubeTexture('/textures/environment/kloppenheim_06_puresky_1k.hdr', scene, 128, false, true, false, true);
  scene.environmentIntensity = .75;

  const ctx: RenderContext = {
    engine, scene, canvas, kind, quality: QUALITY[tier], pipeline: null, fallbackReason,
    setQuality(next) {
      ctx.quality = QUALITY[next];
      engine!.setHardwareScalingLevel(1 / (QUALITY[next].resolutionScale * (window.devicePixelRatio || 1)) * (window.devicePixelRatio || 1));
      if (ctx.pipeline) configurePipeline(ctx.pipeline, ctx.quality);
    },
    dispose() { scene.dispose(); engine!.dispose(); },
  };
  engine.setHardwareScalingLevel(1 / QUALITY[tier].resolutionScale);
  window.addEventListener('resize', () => engine!.resize());
  return ctx;
}

export function configurePipeline(p: DefaultRenderingPipeline, q: QualityProfile): void {
  p.samples = q.msaaSamples;
  p.fxaaEnabled = q.msaaSamples <= 1;
  p.bloomEnabled = q.bloom;
  p.bloomThreshold = 1.1; p.bloomWeight = 0.10; p.bloomKernel = 40; p.bloomScale = 0.5;
  p.grainEnabled = q.grain; if (q.grain) { p.grain.intensity = .6; p.grain.animated = true; }
  p.sharpenEnabled = true; p.sharpen.edgeAmount = 0.22; p.sharpen.colorAmount = 0.9;
  p.imageProcessingEnabled = true;
  const ip = p.imageProcessing;
  ip.toneMappingEnabled = true; ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1.05; ip.contrast = 1.1;
  ip.vignetteEnabled = true; ip.vignetteWeight = 1.7; ip.vignetteStretch = 0.5; ip.vignetteColor = new Color4(0.02, 0.02, 0.04, 0);
  ip.colorCurvesEnabled = true;
}

/** Attach the post-processing pipeline once the camera exists. */
export function attachPipeline(ctx: RenderContext, camera: import('@babylonjs/core').Camera): DefaultRenderingPipeline {
  const p = new DefaultRenderingPipeline('tv-pipeline', true, ctx.scene, [camera]);
  configurePipeline(p, ctx.quality);
  // Pale-gold highlights, cool slate shadows: the reference palette expressed as a grade.
  const grade = new ColorCurves();
  grade.shadowsHue = 218; grade.shadowsDensity = 28; grade.shadowsSaturation = 18;
  grade.highlightsHue = 42; grade.highlightsDensity = 26; grade.highlightsSaturation = 24;
  grade.midtonesHue = 200; grade.midtonesDensity = 6; grade.globalSaturation = -6;
  p.imageProcessing.colorCurves = grade;
  ctx.pipeline = p;
  // The portrait target opts out of prepass; contact shadows stay on the gameplay camera.
  if (ctx.kind === 'webgl2' && ctx.quality.tier !== 'low' && new URLSearchParams(location.search).get('ssao') === '1') {
    try {
      // Contact shadowing under characters, props and eaves; the single biggest 'grounding' gain for a stylised scene.
      // Babylon 9.28 prepass intermittently occludes skinned bodies and thin instances on
      // both backends here. Keep this explicit diagnostic opt-in until that depth path is
      // repaired; scanned material AO and canonical sun shadows remain active by default.
      const ssao = new SSAO2RenderingPipeline('tv-ssao', ctx.scene, { ssaoRatio: 0.5, blurRatio: 1 }, [camera]);
      ssao.radius = 1.5; ssao.totalStrength = 0.5; ssao.expensiveBlur = false; ssao.samples = ctx.quality.tier === 'high' ? 16 : 10; ssao.maxZ = 110; ssao.minZAspect = 0.5;
      ctx.ssao = ssao;
    } catch (e) { console.warn('[tv] SSAO unavailable', e); }
  }
  return p;
}

export const V3 = (x: number, y: number, z: number) => new Vector3(x, y, z);
