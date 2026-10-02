import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, type InstancedMesh } from '@babylonjs/core';
import type { MaterialLibrary } from '../render/materials';
import { hash2, worldNoise } from '../render/noise';
import type { ContainerProjection, DynamicsProjection, ItemProjection, RegionProjection, ResourceProjection } from '../net/messages';
import { MeshBatch } from './meshBatch';
import { COLORS, PropBuilder, containerGeometry, itemGeometry } from './propGeometry';
import { stepDoors, type DoorHandle } from './props';
import type { LightPool } from './lights';
import type { Species, VegetationLibrary } from './vegetation';
import type { TerrainBuild } from './terrain';
import { buildCropGeometry } from './cropGeometry';

/**
 * The region's changing things, built from the projected dynamics: lying items, containers, crops,
 * trees and rocks in their current lifecycle stage, fires, mechanisms and construction sites, and
 * the door states. `apply` diffs by id and signature, so a snapshot that changes one loaf touches
 * one instance. Nothing here is authoritative; it draws what the projection says exists.
 */
export class PropLibrary {
  private readonly protos = new Map<string, Mesh>();
  constructor(private readonly scene: Scene, private readonly mats: MaterialLibrary) {}
  private make(key: string, fill: (b: PropBuilder) => void): Mesh {
    let m = this.protos.get(key); if (m) return m;
    const batch = new MeshBatch(); fill(new PropBuilder(batch));
    m = batch.build(`proto-${key}`, this.scene, this.mats.get('props'), { receiveShadow: true }) ?? new Mesh(`proto-${key}`, this.scene);
    m.isVisible = false; this.protos.set(key, m); return m;
  }
  item(type: string): Mesh { return this.make(`item:${type}`, b => itemGeometry(type, b)); }
  container(open: boolean): Mesh { return this.make(`container:${open}`, b => containerGeometry(b, open)); }
  crop(state: string, seed: number): Mesh {
    return this.make(`crop:${state}:${seed % 3}`, b => buildCropGeometry(b.batch,state,seed%3));
  }
  scaffold(): Mesh {
    return this.make('scaffold', b => {
      for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) b.box(x - 0.05, 0, z - 0.05, 0.1, 2.2, 0.1, COLORS.pine);
      for (const y of [0.6, 1.3, 2.0]) { b.box(-0.55, y, -0.55, 1.1, 0.06, 0.06, COLORS.oak); b.box(-0.55, y, 0.49, 1.1, 0.06, 0.06, COLORS.oak); b.box(-0.55, y, -0.55, 0.06, 0.06, 1.1, COLORS.oak); b.box(0.49, y, -0.55, 0.06, 0.06, 1.1, COLORS.oak); }
    });
  }
  mechanism(): Mesh {
    return this.make('mechanism', b => {
      b.cyl(0, 0, 0, 0.5, 0.15, COLORS.stone, 12); b.box(-0.08, 0.15, -0.08, 0.16, 1.6, 0.16, COLORS.darkOak);
      b.box(-0.9, 1.35, -0.05, 1.8, 0.1, 0.1, COLORS.oak); b.box(-0.05, 0.5, -0.9, 0.1, 0.1, 1.8, COLORS.oak);
    });
  }
  dispose(): void { for (const m of this.protos.values()) m.dispose(); this.protos.clear(); }
}

let flameTexture: DynamicTexture | null = null;
function flameMaterial(scene: Scene): StandardMaterial {
  const existing = scene.getMaterialByName('flame') as StandardMaterial | null; if (existing) return existing;
  if (!flameTexture) {
    flameTexture = new DynamicTexture('flame-tex', { width: 64, height: 128 }, scene, true);
    const g = flameTexture.getContext() as CanvasRenderingContext2D;
    const grad = g.createRadialGradient(32, 92, 2, 32, 82, 56);
    grad.addColorStop(0, 'rgba(255,244,200,1)'); grad.addColorStop(0.28, 'rgba(255,190,80,0.95)'); grad.addColorStop(0.6, 'rgba(255,110,30,0.55)'); grad.addColorStop(1, 'rgba(255,60,10,0)');
    g.clearRect(0, 0, 64, 128); g.fillStyle = grad; g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(60, 50, 62, 96, 32, 124); g.bezierCurveTo(2, 96, 4, 50, 32, 2); g.fill();
    flameTexture.hasAlpha = true; flameTexture.update();
  }
  const m = new StandardMaterial('flame', scene);
  m.diffuseTexture = flameTexture; m.opacityTexture = flameTexture; m.emissiveColor = new Color3(1, 0.7, 0.35); m.disableLighting = true; m.backFaceCulling = false;
  m.alphaMode = 1; m.fogEnabled = false; return m;
}

interface Entry { sig: string; node: TransformNode | InstancedMesh | Mesh; lightIds?: string[]; tick?: (t: number) => void }

export class RegionDynamics {
  readonly root: TransformNode;
  private readonly entries = new Map<string, Entry>();
  private time = 0;
  constructor(private readonly scene: Scene, private readonly mats: MaterialLibrary, private readonly props: PropLibrary, private readonly veg: VegetationLibrary,
    private readonly region: RegionProjection, private readonly terrain: TerrainBuild, private readonly lights: LightPool, private readonly doors: DoorHandle[], parent: TransformNode,
    private readonly addCaster: (m: Mesh) => void) {
    this.root = new TransformNode(`dyn-${region.id}`, scene); this.root.parent = parent;
  }
  private lx(x: number) { return x - this.region.bounds.x0; }
  private lz(z: number) { return z - this.region.bounds.z0; }
  private sync(seen: Set<string>, key: string, sig: string, create: () => Entry): void {
    seen.add(key); const e = this.entries.get(key);
    if (e && e.sig === sig) return;
    if (e) this.drop(key);
    this.entries.set(key, create());
  }
  private drop(key: string): void {
    const e = this.entries.get(key); if (!e) return;
    e.node.dispose(false, false); for (const id of e.lightIds ?? []) this.lights.remove(id);
    this.entries.delete(key);
  }
  private instance(proto: Mesh, name: string, x: number, y: number, z: number, yaw: number, scale = 1): InstancedMesh {
    const i = proto.createInstance(name); i.parent = this.root; i.position.set(this.lx(x), y, this.lz(z)); i.rotation.y = yaw; i.scaling.setAll(scale); i.isPickable = false; return i;
  }
  private treeSpecies(r: ResourceProjection): Species {
    const n = worldNoise(r.pos.x, r.pos.z, 150, 21), h = hash2(r.pos.x, r.pos.z, 9);
    return n < 0.38 ? 'oak' : n < 0.62 ? (h < 0.55 ? 'birch' : 'oak') : n < 0.8 ? (h < 0.5 ? 'pine' : 'birch') : 'pine';
  }

  apply(d: DynamicsProjection): void {
    const seen = new Set<string>();
    for (const dr of d.doors) { const h = this.doors.find(x => x.cell.x === dr.pos.x && x.cell.y === dr.pos.y && x.cell.z === dr.pos.z); if (h) h.target = dr.open ? 1 : 0; }
    for (const it of d.items as ItemProjection[]) {
      const sig = `${it.type}|${it.pos.x},${it.pos.y},${it.pos.z}`;
      this.sync(seen, `i:${it.id}`, sig, () => ({ sig, node: this.instance(this.props.item(it.type), `item-${it.id}`, it.pos.x + 0.5, it.pos.y, it.pos.z + 0.5, hash2(it.pos.x, it.pos.z, 2) * Math.PI * 2) }));
    }
    for (const c of d.containers as ContainerProjection[]) {
      const sig = `${c.open}|${c.pos.x},${c.pos.y},${c.pos.z}`;
      this.sync(seen, `c:${c.id}`, sig, () => ({ sig, node: this.instance(this.props.container(c.open), `container-${c.id}`, c.pos.x + 0.5, c.pos.y, c.pos.z + 0.5, hash2(c.pos.x, c.pos.z, 7) * 0.4) }));
    }
    for (const c of d.crops) {
      const growth=Math.round(Math.max(0,Math.min(1,c.growth))*8)/8, sig=`${c.state}|${c.state==='growing'?growth:0}|${c.pos.x},${c.pos.y},${c.pos.z}`;
      this.sync(seen, `p:${c.id}`, sig, () => {
        if (c.state === 'fallow') return { sig, node: new TransformNode(`empty-${c.id}`, this.scene) };
        const m = this.instance(this.props.crop(c.state, Math.floor(hash2(c.pos.x, c.pos.z, 1) * 3)), `crop-${c.id}`, c.pos.x + 0.5, c.pos.y + 1, c.pos.z + 0.5, 0);
        // Height follows growth; row spacing is fixed across adjacent canonical plot cells.
        m.scaling.y=c.state==='growing'?.45+.55*growth:1;
        return { sig, node: m };
      });
    }
    for (const r of d.resources as ResourceProjection[]) this.resource(seen, r);
    for (const f of d.fires) this.sync(seen, `f:${f.id}`, `${f.lit}|${Math.round(f.intensity * 4)}`, () => this.fire(f.id, f.pos.x, f.pos.y, f.pos.z, f.lit, f.intensity));
    for (const m of d.mechanisms) this.sync(seen, `m:${m.id}`, m.state, () => {
      const mesh = this.instance(this.props.mechanism(), `mech-${m.id}`, m.pos.x + 0.5, m.pos.y, m.pos.z + 0.5, 0);
      return { sig: m.state, node: mesh, tick: t => { if (m.state === 'working') mesh.rotation.y = t * 0.6; } };
    });
    for (const c of d.construction) if (c.state !== 'complete' && c.state !== 'cancelled') {
      const sig = `${c.state}|${Math.round(c.progress * 10)}`;
      this.sync(seen, `k:${c.id}`, sig, () => {
        const b = c.bounds as { x0: number; z0: number; x1: number; z1: number; y0: number }, node = new TransformNode(`site-${c.id}`, this.scene); node.parent = this.root;
        const proto = this.props.scaffold(), w = Math.max(1, b.x1 - b.x0 + 1), dz = Math.max(1, b.z1 - b.z0 + 1);
        for (const [ix, iz] of [[0, 0], [w - 1, 0], [0, dz - 1], [w - 1, dz - 1]]) { const i = proto.createInstance(`sc-${c.id}-${ix}-${iz}`); i.parent = node; i.position.set(this.lx(b.x0) + ix + 0.5, b.y0, this.lz(b.z0) + iz + 0.5); i.scaling.y = 0.4 + c.progress * 1.2; }
        return { sig, node };
      });
    }
    for (const key of [...this.entries.keys()]) if (!seen.has(key)) this.drop(key);
  }

  private resource(seen: Set<string>, r: ResourceProjection): void {
    if (r.kind === 'surface_water') return;
    let species: Species | null = null, scale = 1, sig = '';
    if (r.kind === 'tree') {
      const stage = r.growthStage ?? (r.state === 'available' ? 'mature' : 'felled');
      species = stage === 'felled' ? 'stump' : stage === 'sapling' ? 'sapling' : this.treeSpecies(r);
      scale = stage === 'young' ? 0.6 : stage === 'sapling' ? 1 : 0.85 + hash2(r.pos.x, r.pos.z, 3) * 0.5; sig = `${species}|${stage}`;
    } else if (r.kind === 'stone') { species = 'rock'; scale = r.state === 'available' ? 1 : 0.4; sig = `rock|${r.state}`; }
    else if (r.kind === 'forage') { if (r.forage === 'grass') return; species = r.forage === 'mast' ? 'berry' : 'bush'; scale = r.state === 'available' ? 1 : 0.5; sig = `${species}|${r.state}`; }
    if (!species) return;
    const sp = species;
    this.sync(seen, `r:${r.id}`, sig, () => {
      const proto = this.veg.get(sp, Math.floor(hash2(r.pos.x, r.pos.z, 1) * 97)), host = proto.createInstance(`res-${r.id}`);
      host.parent = this.root; host.rotation.y = hash2(r.pos.x, r.pos.z, 4) * 6.28; host.scaling.setAll(scale); host.isPickable = false;
      host.position.set(this.lx(r.pos.x) + 0.5, this.terrain.heightAt(r.pos.x + 0.5, r.pos.z + 0.5) - 0.1, this.lz(r.pos.z) + 0.5);
      return { sig, node: host };
    });
  }

  private fire(id: string, x: number, y: number, z: number, lit: boolean, intensity: number): Entry {
    const node = new TransformNode(`fire-${id}`, this.scene); node.parent = this.root; node.position.set(this.lx(x) + 0.5, y, this.lz(z) + 0.5);
    const logs = new MeshBatch(), pb = new PropBuilder(logs);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; pb.box(Math.cos(a) * 0.1 - 0.02, 0.02, Math.sin(a) * 0.1 - 0.16, 0.05, 0.07, 0.32, COLORS.coal); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; pb.blob(Math.cos(a) * 0.32, 0.05, Math.sin(a) * 0.32, 0.09, 0.06, 0.09, COLORS.stone, 6, 3, 0.3, i); }
    const lm = logs.build(`fire-logs-${id}`, this.scene, this.mats.get('props')); if (lm) lm.parent = node;
    const ids: string[] = []; let tick: ((t: number) => void) | undefined;
    if (lit) {
      const flames: Mesh[] = [], base = (i: number) => 0.6 + intensity * 0.5 - i * 0.12;
      for (let i = 0; i < 3; i++) {
        const f = MeshBuilder.CreatePlane(`flame-${id}-${i}`, { width: 0.5, height: 0.8 }, this.scene);
        f.material = flameMaterial(this.scene); f.parent = node; f.position.set((i - 1) * 0.08, 0.42, (i - 1) * 0.05); f.billboardMode = Mesh.BILLBOARDMODE_Y; f.isPickable = false; f.scaling.setAll(base(i)); flames.push(f);
      }
      tick = t => flames.forEach((f, i) => { const s = base(i); f.scaling.set(s * (1 + Math.sin(t * 5 + i) * 0.06), s * (1 + Math.sin(t * 11 + i * 2) * 0.12), 1); });
      const lid = `fire:${id}`; ids.push(lid);
      this.lights.add({ id: lid, root: this.root, x: this.lx(x) + 0.5, y: y + 0.9, z: this.lz(z) + 0.5, color: [1, 0.6, 0.28], intensity: 1.7 * Math.max(0.5, intensity), range: 9, flicker: 1, enabled: true });
    }
    return { sig: `${lit}|${Math.round(intensity * 4)}`, node, lightIds: ids, tick };
  }

  update(dt: number): void {
    this.time += dt;
    stepDoors(this.doors, dt);
    for (const e of this.entries.values()) e.tick?.(this.time);
  }
  dispose(): void { for (const k of [...this.entries.keys()]) this.drop(k); this.root.dispose(); }
}
