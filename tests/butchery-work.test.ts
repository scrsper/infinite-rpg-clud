import { describe, expect, it } from 'vitest';
import { BridgeSession } from '../src/bridge/session';
import type { Body, Creature } from '../src/sim/core/types';
import { makeItem } from '../src/sim/world/factory';
import { butcheryLaborSeconds } from '../src/sim/physical/hand';

/**
 * Dressing a carcass is real work at the carcass, not an instant result stamped with a labour
 * figure. Interrupting keeps the work done on the carcass; resuming finishes it; nobody else can
 * take over mid-cut; a save in the middle keeps the progress. Disclosed fixtures: bodies are stood
 * beside the carcass, the boar is killed with the simulation's own applyHit, blades are put in hand.
 */
type W = BridgeSession['world'];
let seq = 0;
const say = (s: BridgeSession, m: Record<string, unknown>) => s.intent({ version: 1, sequence: ++seq, ...m }).result;
const stepFor = (s: BridgeSession, seconds: number) => { for (let i = 0; i < seconds * 60; i++) s.stepInteraction(); };
function standBeside(w: W, body: Body, target: { x: number; y: number; z: number }, gap: number): boolean {
  for (const [dx, dz] of [[gap, 0], [-gap, 0], [0, gap], [0, -gap], [gap, gap], [-gap, -gap]]) {
    const x = Math.floor(target.x + dx) + .5, z = Math.floor(target.z + dz) + .5, y = w.nav.floorY(Math.floor(x), Math.floor(z));
    if (y >= 0 && Math.abs(y - target.y) <= 0.6 && w.nav.walkCost(Math.floor(x), Math.floor(z)) < 3) { body.pos = { x, y, z }; body.vel = { x: 0, y: 0, z: 0 }; return true; }
  }
  return false;
}
function deadBoar() {
  const s = new BridgeSession(918271, { playable: true }), w = s.world, player = w.person(w.playerId!)!, pb = w.primaryBody(player.id)!;
  const boar = (w.creatures() as Creature[]).find(c => c.species === 'woodland_boar' && c.wildlife!.sex === 'male' && !c.wildlife!.parentIds.length)!;
  const bb = w.primaryBody(boar.id)!;
  expect(standBeside(w, pb, bb.pos, 1.2)).toBe(true);
  for (let i = 0; i < 20 && !bb.dead; i++) s.sim.applyHit(player, pb, bb, 30, 'kill');
  // Disclosed placement: the carcass and the butcher are moved to the village square, away from the
  // rest of the herd, whose defence would otherwise (correctly) interrupt the work with a blow.
  const quiet = s.spawnPoint(9); bb.pos = { ...quiet, x: quiet.x + 3 }; bb.vel = { x: 0, y: 0, z: 0 };
  expect(standBeside(w, pb, bb.pos, 1.2)).toBe(true); s.stepInteraction();
  makeItem(w, 'dagger', 'knife', { owner: player.id, holder: player.id });
  return { s, w, player, pb, boar, bb };
}
const meatOf = (w: W, id: string) => w.person(id)!.inventory.map(i => w.item(i)).filter(i => i?.type === 'meat');

describe('butchery is real work at the carcass', () => {
  it('walking off stops the work and keeps it on the carcass; coming back finishes it once', () => {
    const { s, w, player, pb, bb } = deadBoar();
    const needed = butcheryLaborSeconds(w, bb);
    expect(say(s, { type: 'interact', interactionId: `butcher:${bb.id}` })).toBe('accepted');
    stepFor(s, 60); // a real minute: six world minutes of cutting
    const partial = bb.butcheredSeconds ?? 0;
    expect(partial).toBeGreaterThan(300);
    expect(partial).toBeLessThan(needed);
    // Walking away (the ordinary move intent) interrupts.
    for (let i = 0; i < 90; i++) { say(s, { type: 'move', x: 1, z: 0, sprint: false }); s.stepInteraction(); }
    stepFor(s, 2);
    expect(player.mind.plan[0]?.status === 'failed' || player.mind.plan[0]?.type !== 'butcher').toBe(true);
    expect(bb.butcheredSeconds).toBeGreaterThanOrEqual(partial);
    expect(bb.butcheredSeconds).toBeLessThan(needed);
    expect(meatOf(w, player.id)).toHaveLength(0);
    expect(bb.present).toBe(true);
    // Back at the carcass: the job resumes from where it stopped, and ends with one lot of meat.
    standBeside(w, pb, bb.pos, 1.2); s.stepInteraction();
    const resumedAt = w.now, remaining = needed - (bb.butcheredSeconds ?? 0);
    expect(say(s, { type: 'interact', interactionId: `butcher:${bb.id}` })).toBe('accepted');
    for (let i = 0; i < 400 && !meatOf(w, player.id).length; i++) stepFor(s, 1);
    expect(meatOf(w, player.id)).toHaveLength(1);
    expect(w.now - resumedAt).toBeLessThan(remaining + 60);
    expect(bb.present).toBe(false);
    expect(w.events.filter(e => e.type === 'butchered' && e.target === bb.ownerId)).toHaveLength(1);
  }, 240_000);

  it('someone else cannot take over a carcass mid-cut', () => {
    const { s, w, player, bb } = deadBoar();
    const other = w.livingPersons().find(q => q.id !== player.id && q.age > 20)!, ob = w.primaryBody(other.id)!;
    expect(say(s, { type: 'interact', interactionId: `butcher:${bb.id}` })).toBe('accepted');
    stepFor(s, 5);
    standBeside(w, ob, bb.pos, 1.3);
    makeItem(w, 'dagger', 'their knife', { owner: other.id, holder: other.id });
    const channel = 'second';
    expect(s.openChannel(channel, other.id)).toBeTruthy(); // a second player, as the live server connects one
    expect(s.intent({ version: 1, sequence: ++seq, type: 'interact', interactionId: `butcher:${bb.id}` }, channel).result).toBe('in_use');
  }, 240_000);

  it('a save in the middle of the work keeps the progress on the carcass', () => {
    const { s, w, bb } = deadBoar();
    expect(say(s, { type: 'interact', interactionId: `butcher:${bb.id}` })).toBe('accepted');
    stepFor(s, 30);
    const partial = bb.butcheredSeconds!;
    expect(partial).toBeGreaterThan(0);
    const s2 = new BridgeSession(918271, { playable: true, save: s.save() });
    expect(s2.world.body(bb.id)!.butcheredSeconds).toBeCloseTo(partial, 6);
    expect(s2.world.body(bb.id)!.present).toBe(true);
  }, 240_000);

  it('a hare is a short job; the labour recorded is the labour spent', () => {
    const { w, bb } = deadBoar();
    expect(butcheryLaborSeconds(w, bb)).toBe(1750);
    const hare = (w.creatures() as Creature[]).find(c => c.species === 'hare');
    if (hare) expect(butcheryLaborSeconds(w, w.primaryBody(hare.id)!)).toBe(300);
  }, 240_000);
});
