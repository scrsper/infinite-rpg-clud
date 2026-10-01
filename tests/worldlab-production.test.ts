import { describe, expect, it } from 'vitest';
import { takeProbe } from '../src/headless/worldlab/probe';
import { newWorld } from '../src/sim/persist/save';
import { createRequest } from '../src/sim/core/requests';
import { LIVENESS } from '../src/headless/worldlab/liveness';
import type { Observation, ProductionProgress } from '../src/headless/worldlab/types';
import type { World } from '../src/sim/core/world';
const check = LIVENESS.find(c => c.id === 'grain-flour-bread-chain-progresses')!.check;
const obs = (hours: number, productionProgress: ProductionProgress[]): Observation => ({ atWorldSeconds: hours * 3600, atWorldDays: hours / 24, productionProgress } as Observation);
const post = (placeId = 'bakery', demand = 10, fulfilled = 0, inputReady = true): ProductionProgress => ({ placeId, demand, fulfilled, inputReady });
const findings = (series: Observation[]) => check({} as World, series);
describe('request-driven WorldLab production liveness', () => {
  it('derives local inputs, demand and partial progress from canonical requests', () => {
    const { world } = newWorld(918271);
    const bakery = world.places().find(p => p.type === 'bakery')!;
    const ctx = { seed: 918271, requestedDays: 2, worldStart: world.now, startingPopulation: world.persons().length };
    const baseline = takeProbe(ctx, world, 0).productionProgress.find(p => p.placeId === bakery.id)!;
    expect(baseline).toMatchObject({ inputReady: true, demand: 0, fulfilled: 0 });
    const request = createRequest(world, { type: 'production', reward: 0, cause: 'diagnostic fixture', requesterPlaceId: bakery.id, requesterId: bakery.ownerId!, payload: { placeId: bakery.id, resource: 'bread', quantity: 10 } });
    request.fulfilledQuantity = 3;
    expect(takeProbe(ctx, world, 0).productionProgress.find(p => p.placeId === bakery.id)).toMatchObject({ demand: 7, fulfilled: 3 });
    request.status = 'completed';
    expect(takeProbe(ctx, world, 0).productionProgress.find(p => p.placeId === bakery.id)).toMatchObject({ demand: 0, fulfilled: 10 });
  });
  it('does not require production just because raw inputs remain stocked', () => {
    expect(findings([obs(0, [post('mill', 0)]), obs(48, [post('mill', 0)])])).toEqual([]);
  });
  it('starts the bound when demand exists, rather than at the earlier stocked baseline', () => {
    expect(findings([obs(0, [post('bakery', 0)]), obs(24, [post()]), obs(48, [post()])])).toEqual([]);
  });
  it('still fails a ready workplace with continuous unfilled demand for 36 hours', () => {
    expect(findings([obs(0, [post()]), obs(36, [post()])])).toMatchObject([{ id: 'WL-PRODUCTION-IDLE' }]);
  });
  it('does not let another workplace hide the stalled producer', () => {
    expect(findings([obs(0, [post(), post('mill')]), obs(36, [post(), post('mill', 10, 4)])])).toMatchObject([{ id: 'WL-PRODUCTION-IDLE' }]);
  });
  it('recognizes partial progress but still catches a subsequent 36-hour stall', () => {
    expect(findings([obs(0, [post()]), obs(18, [post('bakery', 7, 3)]), obs(54, [post('bakery', 7, 3)])])).toMatchObject([{ id: 'WL-PRODUCTION-IDLE' }]);
    expect(findings([obs(0, [post()]), obs(18, [post('bakery', 7, 3)]), obs(54, [post('bakery', 0, 10)])])).toEqual([]);
  });
  it('recognizes completion and interrupted demand/input availability', () => {
    expect(findings([obs(0, [post()]), obs(36, [post('bakery', 10, 1)])])).toEqual([]);
    for (const middle of [post('bakery', 0), post('bakery', 10, 0, false)])
      expect(findings([obs(0, [post()]), obs(18, [middle]), obs(36, [post()])])).toEqual([]);
  });
});
