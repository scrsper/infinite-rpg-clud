import { describe, expect, it } from 'vitest';
import { BridgeSession } from '../src/bridge/session';
import type { Creature } from '../src/sim/core/types';
import { senseDefense } from '../src/sim/ecology/defense';

/**
 * A multi-seed run (seed 918273) crashed the world tick: an animal whose retreat had run its
 * course, still near the same person, fell through to a cleared defence state. After a retreat it
 * must simply size up the same person again.
 */
describe('animal defence after a retreat', () => {
  it('a boar whose retreat has ended warns the same nearby person again instead of crashing', () => {
    // This regression exercises one embodied animal's state transition. The ordinary
    // bridge world has the same wildlife mechanics; generating the entire playable
    // region made setup alone exceed the five-second test budget under audit load.
    const s = new BridgeSession(918271), w = s.world;
    const person = w.person(w.playerId!)!, pb = w.primaryBody(person.id)!;
    const boar = w.creatures().find(c => c.species === 'woodland_boar' && c.wildlife!.sex === 'male' && !c.wildlife!.parentIds.length) as Creature;
    const bb = w.primaryBody(boar.id)!, spec = w.ecology!.species[boar.species], d = spec.defense!;
    pb.pos = { x: bb.pos.x + d.warnRadiusM * 0.6, y: bb.pos.y, z: bb.pos.z }; // inside the warn radius, not the charge radius
    const state = boar.wildlife!.embodiments[bb.id], at = w.physicalTime;
    state.provokedBy = undefined;
    state.defense = { mode: 'retreat', targetBodyId: pb.id, since: at - d.retreatSeconds - 1 };
    expect(() => senseDefense(w, boar, bb, state, spec, pb, at)).not.toThrow();
    expect(state.defense?.mode).toBe('warn');
    expect(state.defense?.targetBodyId).toBe(pb.id);
  });
});
