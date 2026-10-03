import { describe, expect, it } from 'vitest';
import { BridgeSession } from '../src/bridge/session';
import { makeItem } from '../src/sim/world/factory';
import { teach } from '../src/sim/mind/apprenticeship';

/**
 * The player's carried-item and ability rows come from canonical state and the simulation's own
 * action rules: bread can be eaten and a knife cannot; an untaught person has no hush; a thirsty
 * person is told why they cannot train. Each offered request is the ordinary intent that performs
 * it, and the server still decides. Disclosed fixtures: items are created in hand and needs are
 * set directly; nothing is injected mid-journey.
 */
let seq = 0;
const say = (s: BridgeSession, m: Record<string, unknown>) => s.intent({ version: 1, sequence: ++seq, ...m }).result;
function world() {
  const s = new BridgeSession(918271, { playable: true }), w = s.world, p = w.person(w.playerId!)!;
  const bread = makeItem(w, 'bread', 'a round loaf', { owner: p.id, holder: p.id });
  const knife = makeItem(w, 'dagger', 'a skinning knife', { owner: p.id, holder: p.id });
  return { s, w, p, bread, knife };
}
const row = (s: BridgeSession, id: string) => (s.snapshot(false) as any).carried.find((r: any) => r.id === id);

describe('carried items and abilities are projected from canonical rules', () => {
  it('food offers eating, a blade does not; both can be set down; names and descriptions are the real ones', () => {
    const { s, bread, knife } = world();
    const b = row(s, bread.id), k = row(s, knife.id);
    expect(b.name).toBe('a round loaf');
    expect(b.actions.find((a: any) => a.kind === 'eat')).toMatchObject({ available: true, request: { type: 'interact', interactionId: `consume:${bread.id}` } });
    expect(k.actions.some((a: any) => a.kind === 'eat' || a.kind === 'drink')).toBe(false);
    expect(k.actions.find((a: any) => a.kind === 'drop')).toMatchObject({ label: 'Drop a skinning knife' });
    expect(k.description.length).toBeGreaterThan(0);
    // No player intent hands things over yet, so the panel must not offer it.
    expect([...b.actions, ...k.actions].some((a: any) => a.kind === 'give')).toBe(false);
  }, 120_000);

  it('eating through the offered request consumes the loaf and sates hunger; a blade is refused', () => {
    const { s, w, p, bread, knife } = world();
    p.needs.hunger = 0.7;
    const request = row(s, bread.id).actions.find((a: any) => a.kind === 'eat').request;
    expect(say(s, request)).toBe('accepted');
    for (let i = 0; i < 60; i++) s.step(1 / 60);
    expect(w.item(bread.id)?.holderId === p.id && (w.item(bread.id)?.quantity ?? 0) > 0).toBe(false);
    expect(p.needs.hunger).toBeLessThan(0.7);
    expect(say(s, { type: 'interact', interactionId: `consume:${knife.id}` })).not.toBe('accepted');
    expect(p.inventory).toContain(knife.id);
  }, 120_000);

  it('asleep, every carried action is unavailable with the reason', () => {
    const { s, w, p, bread } = world();
    w.primaryBody(p.id)!.pose = 'sleep';
    for (const a of row(s, bread.id).actions) expect(a).toMatchObject({ available: false, reason: 'You are asleep.' });
    // Execution agrees: a sleeping body does not eat (this used to be accepted).
    expect(say(s, { type: 'interact', interactionId: `consume:${bread.id}` })).toBe('incapacitated');
    expect(w.item(bread.id)?.holderId).toBe(p.id);
  }, 120_000);

  it('abilities: no hush until taught; training refused for thirst with the reason; Iron lists what blocks it', () => {
    const { s, w, p } = world();
    const abilities = () => (s.snapshot(false) as any).abilities as any[];
    expect(abilities().some(a => a.kind === 'hush' || a.kind === 'meditate')).toBe(false);
    expect(abilities().find(a => a.kind === 'train')).toMatchObject({ available: true });
    const advance = abilities().find(a => a.kind === 'advance');
    expect(advance.available).toBe(false);
    expect(advance.reason).toMatch(/must reach|capability/);

    p.physiology.hydration = 0.2;
    expect(abilities().find(a => a.kind === 'train')).toMatchObject({ available: false, reason: 'You are too thirsty to practise.' });
    // The projection agrees with execution: the same intent is refused.
    expect(say(s, { type: 'person_action', intent: { kind: 'train' } })).not.toBe('accepted');

    const keeper = w.livingPersons().find(q => q.id !== p.id && q.knowledge['technique:veilcraft'])!;
    w.primaryBody(keeper.id)!.pos = { ...w.primaryBody(p.id)!.pos, x: w.primaryBody(p.id)!.pos.x + 1 };
    expect(teach(w, keeper, p, 'veilcraft')).toBeTruthy();
    expect(abilities().find(a => a.kind === 'hush')).toMatchObject({ available: true });
    expect(abilities().find(a => a.kind === 'meditate')).toMatchObject({ available: true, request: { type: 'person_action', intent: { kind: 'meditate' } } });
  }, 120_000);
});
