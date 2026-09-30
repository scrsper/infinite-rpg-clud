import { describe, expect, it } from 'vitest';
import { addPerson, createTestWorld, v } from './helpers/world';
import { learn } from '../src/sim/mind/knowledge';
import { B } from '../src/sim/physical/blocks';
import type { Body, Goal, Person, Vec3 } from '../src/sim/core/types';
import { serialize, deserialize } from '../src/sim/persist/save';
import { Simulation } from '../src/sim/mind/agent';
import type { Topic } from '../src/sim/mind/conversation';
import { RunDiagnostics } from '../src/observatory/diagnostics';
import { canonicalDigest, canonicalSave } from '../src/observatory/fingerprint';
import { createScenario } from '../src/observatory/scenarios';
import { healthSnapshot } from '../src/observatory/health';

describe('root causes recovered from the Observatory seed 918271 receipts', () => {
  it('does not subtract wildlife kilogram intake from an edible-item-unit ledger', () => {
    const { world: w } = createScenario('wildlife', 918271), diag = new RunDiagnostics(w);
    const before = diag.ledger();
    w.emit('food_consumed', { actor: w.creatures()[0].id, data: { nodeId: 'habitat', amount: .02, unit: 'kg', scope: 'first_intake_of_bout' } });
    expect(diag.ledger()).toEqual(before);
    expect(diag.checks().find(c => c.id === 'food-balance')?.status).toBe('PASS');
  });
  it('round trips live topic references while preserving detached older evidence', () => {
    const tw = createScenario('ordinary', 918271), p = tw.world.persons()[0];
    const key = Object.keys(p.knowledge)[0], k = p.knowledge[key];
    // Different identity with equal data must remain detached: equality alone is insufficient.
    const detached = JSON.parse(JSON.stringify(k));
    const topic = { k, supporting: [k, detached], reasons: [], score: 1, resolvedForSpeaker: false } as unknown as Topic;
    (tw.sim as unknown as { lastTopic: Map<string, Topic> }).lastTopic.set(p.id, topic);
    const raw = serialize(tw.world), restored = deserialize(raw)!;
    const sim = new Simulation(restored.world), rp = restored.world.person(p.id)!;
    const rt = (sim as unknown as { lastTopic: Map<string, Topic> }).lastTopic.get(p.id)!;
    expect(rt.k).toBe(rp.knowledge[key]); expect(rt.supporting[0]).toBe(rt.k); expect(rt.supporting[1]).not.toBe(rt.k);
    k.confidence = .4; rp.knowledge[key].confidence = .4;
    expect(rt.supporting[1].confidence).toBe(detached.confidence);
    expect(canonicalSave(restored.world)).toEqual(canonicalSave(tw.world));
  });

  it('diagnostic receipts preserve decision evidence and detect repeated completed cases without changing truth', () => {
    const tw = createTestWorld(), p = addPerson(tw, 'Investigator', 'guard', v(10, 1, 10));
    const diag = new RunDiagnostics(tw.world);
    p.mind.goal = { type: 'investigate', key: 'investigate:place:ev:case', utility: .8, reasons: ['case evidence'], createdAt: tw.world.now, data: { key: 'ev:case' } };
    tw.world.emit('goal_completed', { actor: p.id, data: { goalType: 'investigate' } });
    expect(diag.checks().find(c => c.id === 'completed-case-reprocessed')!.status).toBe('PASS');
    tw.world.emit('goal_completed', { actor: p.id, data: { goalType: 'investigate' } });
    const before = canonicalDigest(tw.world);
    expect(diag.checks().find(c => c.id === 'completed-case-reprocessed')!.status).toBe('FAIL');
    expect(diag.person(p.id).timeline).toHaveLength(2); diag.summary();
    expect(canonicalDigest(tw.world)).toBe(before);
  });

  it('rate alerts and a slow step remain AMBER; a concrete repeated completed case is RED', () => {
    const tw = createTestWorld(), p = addPerson(tw, 'Busy', 'villager', v(10, 1, 10));
    for (let i = 0; i < 45; i++) tw.world.emit('goal_changed', { actor: p.id, data: { to: i % 2 ? 'eat' : 'work' } });
    const context = { seed: tw.world.seed, requestedDays: 30, worldStart: tw.world.now, startingPopulation: 1 };
    const report = healthSnapshot(tw.world, context, undefined, [], 150).report;
    expect(report.status).toBe('AMBER');
    expect(report.anomalies.some(a => a.type === 'goal_churn')).toBe(true);
    expect(report.checks.find(c => c.id === 'performance')!.status).toBe('UNVERIFIED');
    const diag = new RunDiagnostics(tw.world);
    p.mind.goal = { type: 'investigate', key: 'case', createdAt: tw.world.now, utility: .8, reasons: [] };
    for (let i = 0; i < 2; i++) tw.world.emit('goal_completed', { actor: p.id });
    expect(healthSnapshot(tw.world, context, undefined, [], 1, diag.checks()).report.status).toBe('RED');
  });
  it('a new accusation against the same person does not restart a handled confrontation', () => {
    const tw = createTestWorld(918274, 60), w = tw.world;
    const guard = addPerson(tw, 'Investigator', 'guard', v(10, 1, 10));
    const suspect = addPerson(tw, 'Suspect', 'villager', v(18, 1, 10), { controlled: true });
    const sb = w.primaryBody(suspect.id)!;
    guard.mind.percepts = [{ entityId: suspect.id, bodyId: sb.id, pos: { ...sb.pos }, distance: 8, how: 'saw', tick: w.now }];
    const keys: string[] = [];
    for (let i = 0; i < 2; i++) {
      const e = w.emit('attack', { actor: suspect.id, target: guard.id, pos: { ...sb.pos }, significance: .7 });
      const key = `ev:${e.id}`; keys.push(key);
      learn(w, guard, { key, kind: 'event', claim: { eventId: e.id, type: 'attack', actor: suspect.id, target: guard.id, pos: e.pos }, confidence: 1, source: { type: 'witnessed', viaEvent: e.id } });
    }
    const sim = tw.sim as unknown as { think(p: Person, b: Body): void };
    sim.think(guard, w.primaryBody(guard.id)!);
    expect(guard.mind.goal?.type).toBe('confront');
    const finished = guard.mind.goal!.data!.crime;
    guard.knowledge[finished].handled = true; guard.mind.plan.forEach(a => a.status = 'done');
    sim.think(guard, w.primaryBody(guard.id)!);
    expect(guard.mind.goal?.data?.crime).toBe(keys.find(k => k !== finished));
  });

  it('an already investigated case cannot borrow another case’s candidate to restart its completed plan', () => {
    const tw = createTestWorld(918271, 60), w = tw.world;
    const guard = addPerson(tw, 'Investigator', 'guard', v(10, 1, 10));
    const suspect = addPerson(tw, 'Suspect', 'villager', v(45, 1, 45), { controlled: true });
    const keys: string[] = [];
    for (let i = 0; i < 2; i++) {
      const e = w.emit('theft', { actor: suspect.id, target: guard.id, pos: v(10 + i, 1, 10), significance: .6 });
      const key = `ev:${e.id}`; keys.push(key);
      learn(w, guard, { key, kind: 'event', claim: { eventId: e.id, type: 'theft', actor: suspect.id, target: guard.id, pos: e.pos }, confidence: 1, source: { type: 'witnessed', viaEvent: e.id } });
    }
    const sim = tw.sim as unknown as { think(p: Person, b: Body): void };
    sim.think(guard, w.primaryBody(guard.id)!);
    expect(guard.mind.goal?.type).toBe('investigate');
    const finished = guard.mind.goal!.data!.key;
    guard.mind.investigated.add(finished); guard.knowledge[finished].handled = true;
    guard.mind.plan.forEach(a => a.status = 'done');
    sim.think(guard, w.primaryBody(guard.id)!);
    expect(guard.mind.goal?.data?.key).toBe(keys.find(k => k !== finished));
    expect(guard.mind.plan.find(a => a.type === 'look')?.data?.key).not.toBe(finished);
  });

  it('turning away from a perceived threat does not abandon an unfinished escape', () => {
    const tw = createTestWorld(918272, 60), w = tw.world;
    const p = addPerson(tw, 'Escaping', 'villager', v(10, 1, 10));
    const goal: Goal = { type: 'flee', key: 'flee:threat', targetEntity: 'threat', utility: .9, reasons: ['perceived danger'], createdAt: w.now };
    p.mind.goal = goal;
    p.mind.plan = [{ type: 'goto', pos: v(28, 1, 10), run: true, data: { flee: true }, status: 'active' }, { type: 'wait', duration: 180, data: { hide: true }, status: 'pending' }];
    p.mind.percepts = []; // Moving away has put the threat outside the facing cone.
    const sim = tw.sim as unknown as { think(p: Person, b: Body): void };
    sim.think(p, w.primaryBody(p.id)!);
    expect(p.mind.goal?.type).toBe('flee');
    // Commitment is to this finite attempt, not perpetual safety or an arbitrary cooldown.
    p.mind.plan.forEach(a => a.status = 'done');
    sim.think(p, w.primaryBody(p.id)!);
    expect(p.mind.goal?.type).not.toBe('flee');
  });

  it('an escape destination excludes a disconnected roof even though its column is walkable', () => {
    const tw = createTestWorld(918273, 64), w = tw.world;
    for (let x = 28; x <= 34; x++) for (let z = 8; z <= 14; z++) for (let y = 1; y <= 3; y++) w.grid.set(x, y, z, B.Stone);
    w.nav.rebuildAll();
    const from = v(10.5, 1, 10.5), threat = v(9.5, 1, 10.5);
    const destination = (tw.sim as unknown as { awayFrom(a: Vec3, b: Vec3, distance: number): Vec3 }).awayFrom(from, threat, 20);
    expect(w.nav.findPath(from, destination)).not.toBeNull();
    expect(destination.y).toBe(1);
    expect(destination.x).toBeGreaterThan(from.x);
  });
});
