import { describe, expect, it } from 'vitest';
import { addPerson, createTestWorld, v } from './helpers/world';
import { makeItem, makePlace } from '../src/sim/world/factory';
import { startCommitment } from '../src/sim/mind/commitment';
import { locationKnowledge, locationNotFound } from '../src/sim/mind/knowledge';
import { believedPosition } from '../src/sim/mind/pursuit';
import type { Body, Person } from '../src/sim/core/types';
import { RunDiagnostics } from '../src/observatory/diagnostics';

describe('material delivery progress', () => {
  function fixture(remote = false) {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Carrier', 'villager', v(10, 1, 10));
    const to = addPerson(tw, 'Recipient', 'villager', remote ? v(30, 1, 30) : v(11, 1, 10));
    const it = makeItem(w, 'bread', 'household bread', { owner: p.id, holder: p.id, quantity: 2 });
    p.mind.goal = { type: 'provide', key: 'provide:recipient', targetEntity: to.id, targetPos: v(11, 1, 10), data: { itemId: it.id }, utility: .8, reasons: ['recipient needs food'], createdAt: w.now };
    startCommitment(w, p, p.mind.goal);
    p.mind.plan = [{ type: 'give', targetEntity: to.id, data: { item: it.id, provision: true }, status: 'pending' }];
    locationKnowledge(w, p, to.id, v(11, 1, 10), { type: 'prior' });
    const act = () => (tw.sim as unknown as { act(p: Person, b: Body, dt: number, worldDt: number): void }).act(p, w.primaryBody(p.id)!, .15, 9);
    return { w, p, to, it, act };
  }

  it('an absent recipient produces failure evidence, not a completed delivery or remote knowledge', () => {
    const { w, p, to, it, act } = fixture(true);
    act();
    expect(w.events.filter(e => e.type === 'goal_completed')).toHaveLength(0);
    expect(it.holderId).toBe(p.id);
    expect(p.mind.commitment).toBeNull();
    expect(p.mind.goal).toBeNull();
    expect(p.knowledge[`loc:${to.id}`].claim.pos).toBeUndefined();
    expect(p.knowledge[`loc:${to.id}`].source.type).toBe('witnessed');
    expect(w.event(p.knowledge[`loc:${to.id}`].source.viaEvent!)?.data.reason).toBe('recipient_not_in_reach');
    expect(p.knowledge[`loc:${to.id}`].claim.searched).toEqual([v(10, 1, 10)]);
    expect(believedPosition(w, p, to.id)).toBeNull();
    // Fresh evidence can enable a new attempt; no timed ban on helping this person.
    locationKnowledge(w, p, to.id, v(12, 1, 10), { type: 'witnessed' });
    expect(believedPosition(w, p, to.id)?.pos).toEqual(v(12, 1, 10));
  });

  it('successful delivery retires the finite errand exactly once', () => {
    const { w, p, to, it, act } = fixture();
    act(); act();
    expect(it.holderId).toBe(to.id);
    expect(w.events.filter(e => e.type === 'goal_completed')).toHaveLength(1);
    expect(p.mind.commitment).toBeNull();
    expect(p.mind.goal).toBeNull();
  });

  it('diagnoses repeated autonomous handoff failure with unchanged material and spatial evidence', () => {
    const { w, p, to, it, act } = fixture(true), diagnostics = new RunDiagnostics(w);
    const retry = () => {
      // Reproduce the broken selector repeatedly forgetting its failed search.
      delete p.knowledge[`loc:${to.id}`];
      p.mind.goal = { type: 'provide', key: `provide:${to.id}`, targetEntity: to.id, targetPos: v(10, 1, 10), data: { itemId: it.id }, utility: .8, reasons: [], createdAt: w.now };
      p.mind.plan = [{ type: 'give', targetEntity: to.id, data: { item: it.id, provision: true }, status: 'pending' }];
      act();
    };
    for (let i = 0; i < 4; i++) retry();
    expect(diagnostics.checks().find(c => c.id === 'failed-handoff-retry')?.status).toBe('PASS');
    retry();
    expect(diagnostics.checks().find(c => c.id === 'failed-handoff-retry')?.status).toBe('FAIL');
    expect(it.holderId).toBe(p.id);
    expect(w.events.filter(e => e.type === 'perceived' && e.data.kind === 'failed_handoff')).toHaveLength(5);
  });

  it('overlapping searches still record the newly checked home destination', () => {
    const { w, p, to } = fixture(true);
    const home = makePlace(w, 'house', 'Known home', { x0: 18, z0: 18, x1: 22, z1: 22, y0: 1, y1: 3 }, { inside: v(20, 1, 20) });
    delete p.knowledge[`loc:${to.id}`];
    p.knowledge[`home:${to.id}`] = { key: `home:${to.id}`, kind: 'fact', claim: { entityId: to.id, placeId: home.id }, confidence: 1, learnedAt: w.now, source: { type: 'prior' }, hops: 0, sharedWith: [] };
    locationNotFound(w, p, to.id, v(20, 1, 23.6), 'first-search');
    expect(believedPosition(w, p, to.id)?.pos).toEqual(home.inside);
    locationNotFound(w, p, to.id, v(20, 1, 20.8), 'home-search');
    expect(believedPosition(w, p, to.id)).toBeNull();
    expect(p.knowledge[`loc:${to.id}`].source.viaEvent).toBe('home-search');
    locationNotFound(w, p, to.id, v(20, 1, 20.8), 'same-search');
    expect(p.knowledge[`loc:${to.id}`].claim.searched).toHaveLength(2);
  });

  it('failure at an old destination does not erase a newer location learned elsewhere', () => {
    const { w, p, to } = fixture(true);
    locationKnowledge(w, p, to.id, v(25, 1, 25), { type: 'told', from: p.id });
    locationNotFound(w, p, to.id, v(10, 1, 10), 'attempt-at-old-destination');
    expect(believedPosition(w, p, to.id)?.pos).toEqual(v(25, 1, 25));
  });

  it('a missing pickup cannot run its dependent handoff or complete the plan', () => {
    const { w, p, act } = fixture();
    p.mind.plan.unshift({ type: 'pickup', targetEntity: 'missing', data: { provision: true }, status: 'pending' });
    act(); act();
    expect(w.events.some(e => e.type === 'goal_completed' || e.type === 'gift')).toBe(false);
  });

  it('splitting household stock retargets both the delivery and its commitment', () => {
    const { w, p, it, act } = fixture();
    p.inventory = p.inventory.filter(id => id !== it.id);
    it.holderId = null; it.pos = v(10, 1, 10); it.quantity = 12;
    p.mind.plan.unshift({ type: 'pickup', targetEntity: it.id, data: { provision: true }, status: 'pending' });
    act();
    const carried = p.inventory.map(id => w.item(id)!).find(i => i.type === 'bread')!;
    expect(carried.id).not.toBe(it.id);
    expect(p.mind.goal?.data?.itemId).toBe(carried.id);
    expect(p.mind.commitment?.data?.itemId).toBe(carried.id);
    expect(carried.quantity + it.quantity).toBe(12);
  });
});
