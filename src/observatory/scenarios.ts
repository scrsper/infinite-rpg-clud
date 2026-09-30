import { World } from '../sim/core/world';
import { Simulation } from '../sim/mind/agent';
import { generateVillage } from '../sim/world/village';
import { makeItem, isFood } from '../sim/world/factory';
import { setExternalControl } from '../sim/runtime/controllers';
import { learn } from '../sim/mind/knowledge';
import { introduce } from '../sim/mind/people';
import { createAnimal, enableEcology } from '../sim/ecology/animals';
import { registerEcologyResources } from '../sim/world/ecologyResources';

export const SCENARIO_VERSION = 2; // v1 left terrain-edit recording disabled after generation.
export const SCENARIOS = [
  ['ordinary', 'Ordinary settlement', 'Authored Ashford reference settlement, generated from seed; all inhabitants autonomous.'],
  ['food-shortage', 'Food shortage', 'Initial edible stocks reduced to 5%; needs and production rates unchanged.'],
  ['resource-shortage', 'Resource shortage', 'Initial flour, grain, logs and planks depleted; resource nodes at 10%.'],
  ['witnessed-theft', 'Witnessed theft', 'Three people initially near one another; an initial theft uses takeItem, then ordinary perception.'],
  ['unwitnessed-theft', 'Unwitnessed theft', 'Initial theft occurs with bystanders initially distant. No witness knowledge is injected.'],
  ['injury', 'Injury', 'One initial canonical hit injures a worker; subsequent choices remain autonomous.'],
  ['family-response', 'Family / social response', 'A household member starts injured beside family; ordinary perception and appraisal decide the response.'],
  ['labor-shortage', 'Labor shortage', 'Initial mill workers are physically injured. Vacancies must derive from capacity, demand and output.'],
  ['trade-failure', 'Trade failure', 'Initial food sellers have no edible stock; no forced purchase, theft or recovery.'],
  ['procurement', 'Procurement', 'Bakery inputs start empty; upstream stocks and normal request/procurement mechanics remain.'],
  ['testimony', 'Rumor / testimony', 'An uncertain prior account is shared once through ordinary tell; no truth event is invented.'],
  ['wildlife', 'Wildlife encounter', 'Two embodied hares start near the settlement with ordinary finite habitat resources.'],
  ['combat', 'Combat', 'Two initially nearby adults; one ordinary attack intention is submitted. No required outcome.'],
  ['training', 'Training / progression', 'One adult begins an ordinary practice action; ability growth depends on canonical work.'],
  ['no-player', 'World without player', 'Reference settlement with all people autonomous, no external controller.'],
].map(([id, title, description]) => ({ id, title, description, invariants: ['No duplicate item locations', 'Knowledge needs provenance', 'No invented required story', 'Ordinary canonical actions only after setup'] }));

/** Fixture authoring is permitted only before publishing this new, disposable World. No save
 * path or environment parameter exists, and no runtime UI command edits its entities. */
export function createScenario(id = 'ordinary', seed = 918271) {
  if (!SCENARIOS.some(s => s.id === id) || !Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw new Error('Invalid scenario or seed');
  const world = new World(seed), gen = generateVillage(world), sim = new Simulation(world);
  world.grid.recording = true;
  for (const p of world.persons()) setExternalControl(p, false);
  const adults = world.persons().filter(p => p.alive && p.age >= 18 && !p.hostile);
  const center = gen.places.square.inside;
  const a = adults[0], b = adults[1], witness = adults[2];
  const locate = (p: typeof a, dx: number, dz: number) => { for (const bodyId of p.bodies) { const body = world.body(bodyId); if (body?.present) { body.pos = { x: center.x + dx, y: center.y, z: center.z + dz }; body.yaw = Math.PI / 2; } } };
  const initialEvents: string[] = [];
  if (['food-shortage', 'trade-failure'].includes(id)) for (const item of world.items()) if (isFood(item.type)) item.quantity = id === 'food-shortage' ? Math.floor(item.quantity * .05) : 0;
  if (id === 'resource-shortage') {
    for (const item of world.items()) if (['flour', 'grain', 'log', 'plank'].includes(item.type)) item.quantity = 0;
    for (const node of world.resourceNodes) node.remaining *= .1;
  }
  if (id === 'procurement') for (const item of world.items()) if (item.type === 'flour' && world.place(item.placeId)?.type === 'bakery') item.quantity = 0;
  if (id === 'labor-shortage') for (const p of adults) if (world.place(p.workId)?.type === 'mill') for (const bid of p.bodies) { const body = world.body(bid); if (body) body.health = body.maxHealth * .3; }
  if (['witnessed-theft', 'unwitnessed-theft', 'injury', 'family-response', 'combat', 'testimony'].includes(id)) {
    locate(a, 0, 0); locate(b, 1, 0); locate(witness, -1, 0);
    if (id === 'family-response') for (const [i, kin] of adults.filter(p => p.householdId === b.householdId && p.id !== b.id).entries()) locate(kin, -1, i + 1);
    if (id === 'unwitnessed-theft') {
      // Initial placement, not a teleport during the scenario. All potential witnesses distant.
      for (const [i, p] of world.persons().filter(p => p.id !== a.id).entries()) locate(p, 35 + i % 4, 35 + Math.floor(i / 4));
    }
    if (id.endsWith('theft')) {
      const item = makeItem(world, 'bread', 'scenario bread', { owner: b.id, pos: { ...world.primaryBody(a.id)!.pos }, quantity: 1 });
      initialEvents.push(sim.takeItem(a, item, 'theft', b.id).id);
    }
    if (['injury', 'family-response'].includes(id)) { const e = sim.applyHit(a, world.primaryBody(a.id)!, world.primaryBody(b.id)!, 35); if (e) initialEvents.push(e.id); }
    if (id === 'combat') sim.submitIntention(a, { type: 'attack', targetEntity: b.id, status: 'pending', data: { intent: 'subdue' } });
    if (id === 'testimony') {
      introduce(world, a, b);
      const k = learn(world, a, { key: 'rumor:old-road', kind: 'event', claim: { type: 'rumor', text: 'the old road may be unsafe', significance: .3 }, confidence: .45, source: { type: 'prior' } });
      if (k) sim.tell(a, b, k);
    }
    // Sample initial stimuli before publishing. Future responses are ordinary autonomous choices.
    world.physicalTime += .3; const wd = world.clock.advance(.3); sim.step(.3, wd); sim.flushSpeech();
  }
  if (id === 'wildlife') {
    enableEcology(world); registerEcologyResources(world, { x0: 70, z0: 70, x1: 115, z1: 115 });
    createAnimal(world, 'field_hare', { ...center, x: center.x + 2 }, { sex: 'male' });
    createAnimal(world, 'field_hare', { ...center, z: center.z + 2 }, { sex: 'female' });
  }
  if (id === 'training') sim.submitIntention(a, { type: 'work', status: 'pending', data: { martial: 'practice', techniqueId: 'motor:basic-punch', bodyId: a.bodies[0] } });
  return { world, sim, scenario: SCENARIOS.find(s => s.id === id)!, initialEvents };
}
