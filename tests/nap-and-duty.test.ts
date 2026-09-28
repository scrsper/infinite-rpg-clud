import { describe, expect, it } from 'vitest';
import { createTestWorld, addPerson, step, type TestWorld } from './helpers/world';
import { SECONDS_PER_DAY, SECONDS_PER_HOUR } from '../src/sim/core/time';
import { scheduleFor } from '../src/sim/mind/schedule';
import type { Person } from '../src/sim/core/types';

const at = (hour: number) => SECONDS_PER_DAY * 100 + hour * SECONDS_PER_HOUR;
const asleep = (p: Person) => p.mind.plan.some(a => a.type === 'sleep' && a.status === 'active');

/** An innkeeper with her real rhythm (tavern 7–14 and 16–23, a break 14–16, bed 23–7) and a
 * genuinely tired body: energy need is derived from fatigue and sleep debt, not set directly. */
function tiredKeeper(seed: number, hour: number): { tw: TestWorld; keeper: Person } {
  const tw = createTestWorld(seed), { world } = tw, tavern = world.place(tw.places.tavern)!;
  const keeper = addPerson(tw, 'Keeper', 'innkeeper', tavern.inside, { workId: tavern.id });
  keeper.schedule = scheduleFor(keeper, { work: tavern.id, home: tavern.id, tavern: tavern.id, square: tw.places.square, chapel: tw.places.chapel });
  world.clock.worldSeconds = at(hour);
  keeper.physiology.fatigue = 0.4; keeper.physiology.sleepDebt = 6;
  return { tw, keeper };
}

describe('a nap is not a night', () => {
  it('a tired innkeeper who naps in her afternoon break is back for the evening shift', () => {
    const { tw, keeper } = tiredKeeper(4242, 14.05), { world } = tw;
    step(tw, 20 * 60 / world.clock.timeScale, 0.25);
    expect(asleep(keeper), 'precondition: she takes her break as a nap').toBe(true);
    // Her shift starts at 16:00. Old rule: a sleep ended only when fully rested or after 9 h.
    while (world.clock.hourF < 17.5) step(tw, 60, 0.25);
    expect(asleep(keeper)).toBe(false);
    expect(keeper.needs.energy, 'woken before full restoration').toBeGreaterThan(0.05);
  }, 60000);

  it('night sleep still lasts until the sleeper is rested', () => {
    const { tw, keeper } = tiredKeeper(4243, 23.2), { world } = tw;
    step(tw, 20 * 60 / world.clock.timeScale, 0.25);
    expect(asleep(keeper)).toBe(true);
    while (world.clock.worldSeconds < at(24 + 3)) step(tw, 60, 0.25);
    expect(asleep(keeper), 'no duty is due at 03:00').toBe(true);
  }, 60000);
});
