import { Mesh, TransformNode, Vector3 } from '@babylonjs/core';
import type { RenderContext } from '../render/engine';
import { MaterialLibrary } from '../render/materials';
import type { DynamicsProjection, PresentationPayload, RegionProjection, Vec3 } from '../net/messages';
import type { Atmosphere } from './atmosphere';
import { PropLibrary, RegionDynamics } from './dynamicWorld';
import { LightPool } from './lights';
import { buildStaticProps, type DoorHandle } from './props';
import { buildStructures, decodeStructure, type WorldLight } from './structures';
import { buildTerrain, type TerrainBuild } from './terrain';
import { InstanceSet, VegetationLibrary, scatterVegetation } from './vegetation';

/**
 * Owns every resident region's scene content and the floating origin.
 *
 * Simulation coordinates go up to 24 km; single-precision vertex maths visibly shakes beyond a few
 * kilometres, so every scene object is placed at (simulation position - origin) and the server
 * moves the origin (`regions_state.origin`) as the player travels. Region content is built once
 * in region-local coordinates under one root node, so rebasing is a single position update per
 * region, and unloading a region disposes everything it owns (nothing leaks across a long walk).
 */
interface RegionEntry {
  id: string; projection: RegionProjection; root: TransformNode; terrain: TerrainBuild; meshes: Mesh[]; instances: InstanceSet; lightIds: string[];
  doors: DoorHandle[]; dynamics: RegionDynamics; stats: { cells: number; roofs: number; windows: number; trees: number; props: number; buildMs: number };
}

export class RegionManager {
  readonly mats: MaterialLibrary;
  readonly lights: LightPool;
  readonly vegetation: VegetationLibrary;
  readonly props: PropLibrary;
  readonly regions = new Map<string, RegionEntry>();
  readonly origin = { x: 0, y: 0, z: 0 };
  regionSize = 256;
  private lastDynamics: DynamicsProjection | null = null;
  worldTime = 0;
  weather = { kind: 'clear', intensity: 0, wind: 0 };

  constructor(private readonly ctx: RenderContext, private readonly atmosphere: Atmosphere) {
    this.mats = new MaterialLibrary(ctx.scene);
    this.lights = new LightPool(ctx.scene, ctx.quality.maxLights);
    this.vegetation = new VegetationLibrary(ctx.scene, this.mats);
    this.props = new PropLibrary(ctx.scene, this.mats);
  }

  /** Where a simulation position is drawn. */
  toRender(p: Vec3, out = new Vector3()): Vector3 { return out.set(p.x - this.origin.x, p.y - this.origin.y, p.z - this.origin.z); }
  regionOf(x: number, z: number): string { return `${Math.floor(x / this.regionSize)},${Math.floor(z / this.regionSize)}`; }

  setOrigin(o: Vec3): void {
    this.origin.x = o.x; this.origin.y = o.y ?? 0; this.origin.z = o.z;
    for (const r of this.regions.values()) this.place(r);
  }
  private place(r: RegionEntry): void { r.root.position.set(r.projection.bounds.x0 - this.origin.x, -this.origin.y, r.projection.bounds.z0 - this.origin.z); }

  /** Height of the drawn ground at a simulation position, or null if that region is not resident. */
  groundAt(x: number, z: number): number | null {
    const r = this.regions.get(this.regionOf(x, z)); return r ? r.terrain.heightAt(x, z) : null;
  }

  applyPresentation(payload: PresentationPayload): void {
    for (const proj of payload.regions) this.build(proj);
    if (payload.dynamic) this.applyDynamics(payload.dynamic);
  }

  private build(proj: RegionProjection): void {
    const t0 = performance.now();
    this.unload(proj.id);
    const scene = this.ctx.scene, root = new TransformNode(`region-${proj.id}`, scene);
    const terrain = buildTerrain(scene, this.mats, proj); terrain.mesh.parent = root; if (terrain.water) terrain.water.parent = root;
    const meshes: Mesh[] = [terrain.mesh]; if (terrain.water) meshes.push(terrain.water);
    const lightList: WorldLight[] = [];

    const st = buildStructures(scene, this.mats, proj);
    for (const m of st.meshes) { m.parent = root; meshes.push(m); if (m.name.startsWith('walls') || m.name.startsWith('roof') || m.name.includes('struct')) this.atmosphere.addCaster(m); }
    for (const m of st.panes.values()) { m.parent = root; meshes.push(m); }
    lightList.push(...st.lights);

    const cells = proj.structures?.runs.length ? decodeStructure(proj.structures.runs, proj.bounds.x0, proj.bounds.z0) : null;
    const sp = buildStaticProps(scene, this.mats, proj, cells, root);
    for (const m of sp.meshes) { meshes.push(m); this.atmosphere.addCaster(m); }
    lightList.push(...sp.lights);

    // Trees and rocks: canonical resources come from dynamics, decoration fills between them.
    const instances = new InstanceSet();
    const density = this.ctx.quality.treeDensity;
    const trees = scatterVegetation(this.vegetation, instances, {
      region: proj, terrain, density, canonical: this.lastDynamics?.resources.filter(r => this.regionOf(r.pos.x, r.pos.z) === proj.id) ?? [],
      exclusions: [...proj.dressingExclusions.map(e => e.bounds), ...proj.places.map(p => p.bounds), ...proj.settlements.map(s => s.bounds)],
    }, proj.decoration.seed);
    instances.finish(root, `veg-${proj.id}`, m => this.atmosphere.addCaster(m));

    const lightIds: string[] = [];
    lightList.forEach((l, i) => {
      const id = `${proj.id}:l${i}`; lightIds.push(id);
      this.lights.add({ id, root, x: l.x, y: l.y, z: l.z, color: l.color, intensity: l.intensity, range: l.range, flicker: l.kind === 'torch' ? 1 : 0.3, enabled: true });
    });

    const dynamics = new RegionDynamics(scene, this.mats, this.props, this.vegetation, proj, terrain, this.lights, sp.doors, root, m => this.atmosphere.addCaster(m));
    const entry: RegionEntry = {
      id: proj.id, projection: proj, root, terrain, meshes, instances, lightIds, doors: sp.doors, dynamics,
      stats: { cells: st.stats.cells, roofs: st.stats.roofsAnalytic, windows: st.stats.windows, trees, props: proj.furnishings.length, buildMs: performance.now() - t0 },
    };
    this.regions.set(proj.id, entry); this.place(entry);
    for (const m of meshes) { m.freezeWorldMatrix?.(); m.unfreezeWorldMatrix(); }
    if (this.lastDynamics) dynamics.apply(this.subset(this.lastDynamics, proj.id));
  }

  private subset(d: DynamicsProjection, id: string): DynamicsProjection {
    const inRegion = (p: Vec3) => this.regionOf(p.x, p.z) === id;
    return {
      ...d, resources: d.resources.filter(r => inRegion(r.pos)), items: d.items.filter(i => inRegion(i.pos)), containers: d.containers.filter(c => inRegion(c.pos)),
      crops: d.crops.filter(c => inRegion(c.pos)), mechanisms: d.mechanisms.filter(m => inRegion(m.pos)), construction: d.construction.filter(c => inRegion(c.pos)),
      fires: d.fires.filter(f => inRegion(f.pos)), doors: d.doors.filter(x => inRegion(x.pos)),
    };
  }

  applyDynamics(d: DynamicsProjection): void {
    this.lastDynamics = d; this.worldTime = d.worldTime; this.weather = { kind: d.environment.kind, intensity: d.environment.intensity, wind: d.environment.wind };
    for (const r of this.regions.values()) r.dynamics.apply(this.subset(d, r.id));
  }

  unload(id: string): void {
    const r = this.regions.get(id); if (!r) return;
    for (const lid of r.lightIds) this.lights.remove(lid);
    r.dynamics.dispose(); r.instances.dispose();
    for (const m of r.meshes) { this.atmosphere.removeCaster(m); m.dispose(false, false); }
    r.root.dispose(false, false); this.regions.delete(id);
  }

  update(dt: number, cameraPos: Vector3, night: number): void {
    for (const r of this.regions.values()) r.dynamics.update(dt);
    this.lights.update(dt, cameraPos, night);
  }
  dispose(): void { for (const id of [...this.regions.keys()]) this.unload(id); this.lights.dispose(); this.vegetation.dispose(); this.props.dispose(); }
}
