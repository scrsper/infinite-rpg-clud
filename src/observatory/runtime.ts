import { canonicalDigest as hash } from './fingerprint';
import { createScenario, SCENARIOS } from './scenarios';
import { worldOverview, settlementMetrics, causalGraph, resourceState } from './readers';
import { healthSnapshot, type HealthCheck } from './health';
import { serialize, deserialize } from '../sim/persist/save';
import { Simulation } from '../sim/mind/agent';
import { setExternalControl } from '../sim/runtime/controllers';
import type { World } from '../sim/core/world';
import type { Observation } from '../headless/worldlab/types';
import type { ConversationContext } from '../language/parser';
import { LanguageService } from '../language/service';
import { RunDiagnostics } from './diagnostics';
import { ObservatoryViewport } from './viewport';

export const STEP = .15; // Existing headless runner quantum. UI speeds change pacing only.
export function stepWorld(w: World, sim: Simulation, dt = STEP) { const wd = w.clock.advance(dt); w.physicalTime += dt; sim.step(dt, wd); sim.flushSpeech(); }
export class Observatory {
  readonly viewport = new ObservatoryViewport(this);
  state = createScenario();
  diagnostics = new RunDiagnostics(this.state.world);
  readonly language = new LanguageService();
  private conversationContexts = new Map<string, ConversationContext>();
  paused = true; speed = 1; revision = 0;
  start = this.state.world.now;
  initial = worldOverview(this.state.world);
  checkpoint: string | null = null;
  latestLanguage: unknown = null;
  report: unknown = null;
  verification: HealthCheck[] = [];
  private previous?: Observation;
  healthHistory: { tick: number; status: string; failures: HealthCheck[] }[] = [];
  health = this.sampleHealth();
  private healthAt = this.start;
  private interval?: ReturnType<typeof setInterval>;
  private jobCancel = false;
  private wallAccum = 0;
  private wallAt = performance.now();
  private stepMs?: number;
  job: { active: boolean; from: number; to: number; mode: string; elapsedMs: number; error?: string } | null = null;
  private askController: AbortController | null = null;
  get world() { return this.state.world; }
  get sim() { return this.state.sim; }
  startLoop() {
    this.interval = setInterval(() => {
      const now = performance.now(), elapsed = Math.max(0, (now - this.wallAt) / 1000); this.wallAt = now;
      this.viewport.expire();
      if (this.paused || this.job?.active) return;
      this.wallAccum += elapsed * this.speed;
      const end = now + 12;
      const quantum = this.viewport.enabled ? 1 / 60 : STEP;
      try { while (this.wallAccum >= quantum && performance.now() < end) { this.step(quantum); this.wallAccum -= quantum; } }
      catch (e) { this.paused = true; this.job = { active: false, from: this.world.now, to: this.world.now, mode: 'Realtime stepping failed', elapsedMs: 0, error: String(e) }; }
    }, 25);
  }
  close() { clearInterval(this.interval); this.viewport.reset(); this.jobCancel = true; this.askController?.abort(); this.conversationContexts.clear(); }
  private step(dt = STEP) {
    const t = performance.now(); if (!this.viewport.step(dt)) stepWorld(this.world, this.sim, dt); this.stepMs = performance.now() - t;
    if (this.world.now - this.healthAt >= 3600) { this.health = this.sampleHealth(); this.healthAt = this.world.now; }
  }
  private sampleHealth() {
    const { current, report } = healthSnapshot(this.state.world, { seed: this.state.world.seed, requestedDays: 30, worldStart: this.start ?? this.state.world.now, startingPopulation: this.initial?.entities.filter(p => p.alive).length ?? this.state.world.livingPersons().length }, this.previous, this.verification ?? [], this.stepMs, this.diagnostics.checks());
    this.previous = current;
    this.healthHistory.push({ tick: this.state.world.now, status: report.status, failures: report.checks.filter(c => c.status === 'FAIL') });
    if (this.healthHistory.length > 800) this.healthHistory.shift();
    return report;
  }
  snapshot() { return { ...worldOverview(this.world), scenario: this.state.scenario, initialEvents: this.state.initialEvents, paused: this.paused, speed: this.speed, debtSeconds: this.wallAccum, revision: this.revision,
    job: this.job, health: this.health, report: this.report, language: { mode: 'deterministic' }, checkpoint: !!this.checkpoint, workbench: this.viewport.enabled,
    isolation: 'Disposable in-memory development world. No live/staging/save-directory APIs.', clock: this.viewport.enabled ? 'Gameplay workbench: 60 Hz canonical interaction, shared simulation, 60:1 world clock. Separate from headless validation trajectories.' : 'Fixed headless step 0.15 physical seconds at the existing 60:1 world clock. 1x/6x/60x change pacing, not the quantum.' }; }
  reset(id: string, seed: number) {
    this.requireIdle(); this.viewport.reset(); this.cancelLanguage(); this.paused = true;
    this.state = createScenario(id, seed); this.revision++; this.start = this.world.now; this.initial = worldOverview(this.world);
    this.diagnostics = new RunDiagnostics(this.world); this.stepMs = undefined;
    this.previous = undefined; this.healthAt = this.start; this.verification = []; this.healthHistory = []; this.health = this.sampleHealth(); this.report = null; this.latestLanguage = null; this.job = null; this.checkpoint = null; this.wallAccum = 0;
  }
  control(paused: boolean, speed: number) { this.requireIdle(); if (![1, 6, 60].includes(speed) || typeof paused !== 'boolean') throw new Error('Invalid time control'); this.viewport.stopInput(); this.paused = paused; this.speed = speed; this.wallAccum = 0; this.wallAt = performance.now(); }
  cancel() { this.viewport.stopInput(); this.jobCancel = true; this.paused = true; this.cancelLanguage(); }
  private cancelLanguage() { this.askController?.abort(); this.conversationContexts.clear(); }
  requireIdle() { if (this.job?.active) throw new Error('A world run is active; cancel it first'); }
  async advance(seconds: number, noPlayer = false) {
    this.requireIdle(); if (![3600, 86400, 604800, 2592000].includes(seconds)) throw new Error('Unsupported horizon');
    this.viewport.stopInput(); this.cancelLanguage(); this.paused = true; this.wallAccum = 0; this.jobCancel = false;
    if (noPlayer) { this.viewport.release(); for (const p of this.world.persons()) setExternalControl(p, false); }
    const before = worldOverview(this.world), beforeResources = resourceState(this.world), beforeMetrics = settlementMetrics(this.world).map(({ evidence, ...m }) => m);
    const relations = new Map(this.world.persons().flatMap(p => Object.entries(p.relationships).map(([id, r]) => [`${p.id}/${id}`, JSON.stringify(r)] as const)));
    const start = performance.now(), from = this.world.now, to = from + seconds;
    this.job = { active: true, from, to, mode: noPlayer ? 'World without player' : 'Advance time', elapsedMs: 0 };
    try {
      while (!this.jobCancel && this.world.now < to - 1e-6) {
        const end = performance.now() + 12;
        while (!this.jobCancel && this.world.now < to - 1e-6 && performance.now() < end) this.step(Math.min(STEP, (to - this.world.now) / this.world.clock.timeScale));
        this.job.elapsedMs = performance.now() - start;
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    } catch (e) { this.job.error = String(e); }
    finally {
      this.job.active = false; this.health = this.sampleHealth();
      const after = worldOverview(this.world);
      const candidates = this.world.events.filter(e => e.tick >= from && e.causes.length || e.tick >= from && e.effects.length).sort((a, b) => b.effects.length - a.effects.length).slice(0, 8);
      this.report = { mode: this.job.mode, from, to: this.world.now, requestedTo: to, completed: !this.jobCancel && !this.job.error && this.world.now >= to - 1e-6, elapsedMs: performance.now() - start,
        population: { before: before.entities.filter(p => p.alive).length, after: after.entities.filter(p => p.alive).length },
        resources: { before: beforeResources, after: resourceState(this.world), note: 'Physical stock units kept separate by type. Existing canonical tallies survive compaction; their detailed event receipts may not.' },
        metrics: after.metrics.map(m => ({ label: m.label, before: beforeMetrics.find(x => x.key === m.key)?.value, after: m.value, delta: m.value - (beforeMetrics.find(x => x.key === m.key)?.value ?? 0), scope: m.scope })),
        relationships: this.world.persons().flatMap(p => Object.entries(p.relationships).filter(([id, r]) => relations.get(`${p.id}/${id}`) !== JSON.stringify(r)).map(([id, r]) => ({ person: p.name, other: this.world.nameOf(id), current: r }))),
        importantCauses: candidates.map(e => ({ id: e.id, summary: e.summary, directEffects: e.effects.length, retainedGraph: causalGraph(this.world, e.id, 40) })),
        caveat: 'Factual before/after comparison. Event metrics cover retained events; compaction is not negative activity. Causal impact is stored direct effects with a bounded graph, not invented narrative.', health: this.health.status,
        healthObservations: this.healthHistory.filter(h => h.tick >= from),
      };
    }
  }
  saveCheckpoint() { this.requireIdle(); this.checkpoint = serialize(this.world); return { bytes: this.checkpoint.length, storage: 'Memory in this isolated Observatory process only' }; }
  loadCheckpoint() {
    this.requireIdle(); if (!this.checkpoint) throw new Error('No isolated checkpoint');
    const loaded = deserialize(this.checkpoint); if (!loaded) throw new Error('Checkpoint rejected');
    this.viewport.reset(); this.cancelLanguage(); this.paused = true; this.state = { ...this.state, world: loaded.world, sim: new Simulation(loaded.world) }; this.revision++;
    for (const p of this.world.persons()) setExternalControl(p, false);
    this.diagnostics = new RunDiagnostics(this.world); this.stepMs = undefined;
    this.previous = undefined; this.healthHistory = []; this.healthAt = this.world.now; this.health = this.sampleHealth(); this.latestLanguage = null; this.wallAccum = 0; this.report = null;
  }
  openValidationSave(raw: string) {
    this.requireIdle();
    // The server supplies only its fixed, isolated audit archive. No client file paths.
    const loaded = deserialize(raw); if (!loaded) throw new Error('Validation save rejected');
    this.viewport.reset(); this.cancelLanguage(); this.paused = true;
    this.state = { ...this.state, scenario: SCENARIOS.find(s => s.id === 'ordinary')!, initialEvents: [], world: loaded.world, sim: new Simulation(loaded.world) };
    for (const p of this.world.persons()) setExternalControl(p, false);
    this.revision++; this.start = this.world.now; this.initial = worldOverview(this.world);
    this.diagnostics = new RunDiagnostics(this.world); this.previous = undefined; this.verification = []; this.healthHistory = [];
    this.stepMs = undefined; this.healthAt = this.start; this.health = this.sampleHealth(); this.report = null; this.latestLanguage = null; this.job = null; this.checkpoint = null; this.wallAccum = 0;
  }
  verify() {
    this.requireIdle();
    const a = createScenario(this.state.scenario.id, this.world.seed), b = createScenario(this.state.scenario.id, this.world.seed);
    for (let i = 0; i < 20; i++) { stepWorld(a.world, a.sim); stepWorld(b.world, b.sim); }
    const replay = hash(a.world) === hash(b.world), restored = deserialize(serialize(a.world));
    let continuity = false;
    if (restored) { const sim = new Simulation(restored.world); for (let i = 0; i < 20; i++) { stepWorld(a.world, a.sim); stepWorld(restored.world, sim); } continuity = hash(a.world) === hash(restored.world); }
    this.verification = [
      { id: 'determinism', label: 'Determinism', status: replay ? 'PASS' : 'FAIL', detail: `Isolated ${this.state.scenario.id}, seed ${this.world.seed}: two independent initializations + 20 fixed steps, full serialized hash compared.` },
      { id: 'save-load', label: 'Save/load continuity', status: continuity ? 'PASS' : 'FAIL', detail: 'Isolated fixture: save after 20 steps; original vs restored for 20 more steps. Full serialized hash; bounded horizon only.' },
    ];
    this.health = this.sampleHealth(); return this.verification;
  }
  async thought(npcId: string) {
    this.requireIdle(); if (this.askController) throw new Error('A language request is active');
    const npc = this.world.person(npcId); if (!npc?.alive) throw new Error('Select a living person');
    const controller = new AbortController(); this.askController = controller; const revision = this.revision;
    try { const result = await this.language.thought(npc, controller.signal); if (controller.signal.aborted || revision !== this.revision) throw new Error('Language expression cancelled'); return result; }
    finally { if (this.askController === controller) this.askController = null; }
  }
  async ask(npcId: string, speakerId: string, text: string) {
    this.requireIdle(); if (this.askController) throw new Error('A conversation request is active');
    const npc = this.world.person(npcId), speaker = this.world.person(speakerId); if (!npc || !speaker) throw new Error('Choose a person and a nearby speaker');
    const controller = new AbortController(); this.askController = controller; const revision = this.revision;
    try { const key = `${speaker.id}:${npc.id}`, result = await this.language.ask(this.sim, speaker, npc, text, controller.signal, () => revision === this.revision, this.conversationContexts.get(key)); this.conversationContexts.set(key, result.nextContext); if (revision !== this.revision || controller.signal.aborted) throw new Error('Language request cancelled; any already accepted canonical conversation remains in history.'); this.latestLanguage = result; return result; }
    finally { if (this.askController === controller) this.askController = null; }
  }
}
