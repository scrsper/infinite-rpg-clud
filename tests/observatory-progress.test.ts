import { describe, expect, it } from 'vitest';
import { addPerson, createTestWorld, v } from './helpers/world';
import { beginConflict, recordDowning } from '../src/sim/social/conflict';
import { getRel, setRelTags } from '../src/sim/mind/relationships';
import { makeBody, makeItem, makePlace } from '../src/sim/world/factory';
import { serialize, deserialize } from '../src/sim/persist/save';
import { createScenario } from '../src/observatory/scenarios';
import { B } from '../src/sim/physical/blocks';
import { noteReportFailed, refreshReport, shouldSeekAuthority } from '../src/sim/mind/reporting';
import { learn } from '../src/sim/mind/knowledge';
import { createFields } from '../src/sim/world/metabolism';
import { observeFields } from '../src/sim/mind/routine';
import { formConcerns } from '../src/sim/mind/concern';
import { formPursuits, livePursuits, pursuitSteps, resolvePursuit, satisfiedNow } from '../src/sim/mind/pursuit';
import { materializeStructure } from '../src/sim/world/construction';
import { RunDiagnostics } from '../src/observatory/diagnostics';

describe('progress defects exposed by every-hour 30-day review', () => {
  it('reconsiders failed plans with current candidate parameters even when the goal key is unchanged', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Witness', 'villager', v(10, 1, 10), { traits: { honesty: 1, sociability: 0 } });
    const guard = addPerson(tw, 'Watch', 'guard', v(25, 1, 10));
    const culprit = addPerson(tw, 'Thief', 'villager', v(35, 1, 35));
    const event = w.emit('theft', { actor: culprit.id, target: p.id });
    const key = `ev:${event.id}`;
    learn(w, p, { key, kind: 'event', claim: { eventId: event.id, type: 'theft', actor: culprit.id, target: p.id }, confidence: 1, source: { type: 'witnessed', viaEvent: event.id } });
    learn(w, p, { key: `loc:${guard.id}`, kind: 'location', claim: { entityId: guard.id, pos: v(25, 1, 10) }, confidence: 1, source: { type: 'witnessed' } });
    p.schedule = [];
    p.mind.goal = { type: 'report', key: `report:${guard.id}:${key}`, targetEntity: guard.id, targetPos: v(10, 1, 10), utility: 1, createdAt: w.now - 600, reasons: [], data: { key } };
    p.mind.plan = [{ type: 'goto', pos: v(10, 1, 10), status: 'done' }, { type: 'tell', targetEntity: guard.id, status: 'failed', data: { key } }];
    (tw.sim as any).think(p, w.primaryBody(p.id));
    expect(p.mind.goal?.key).toBe(`report:${guard.id}:${key}`);
    expect(p.mind.goal?.targetPos).toEqual(v(25, 1, 10));
    expect(p.mind.plan[0].pos).toEqual(v(25, 1, 10));
    expect(p.mind.plan[1].data?.intentionEvent).toBe(w.events.filter(e => e.type === 'goal_changed' && e.actor === p.id).at(-1)?.id);
  });

  it('detects retrying an absent listener across different case keys, while accepting new observations', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Witness', 'villager', v(10, 1, 10));
    const guard = addPerson(tw, 'Watch', 'guard', v(35, 1, 35));
    const diagnostics = new RunDiagnostics(w);
    const fail = (i: number) => {
      p.mind.goal = { type: 'report', key: `report:${guard.id}:case-${i}`, targetEntity: guard.id, targetPos: v(10, 1, 10), utility: 1, createdAt: w.now, reasons: [] };
      w.emit('perceived', { actor: p.id, target: guard.id, data: { kind: 'failed_report' } });
    };
    for (let i = 0; i < 4; i++) fail(i);
    const before = diagnostics.checks().find(c => c.id === 'failed-report-retry')!;
    expect(before.status).toBe('PASS');
    fail(4);
    expect(before.evidence).toEqual([]); // Later findings cannot rewrite an earlier hourly sample.
    expect(diagnostics.checks().find(c => c.id === 'failed-report-retry')?.status).toBe('FAIL');
    const fresh = new RunDiagnostics(w);
    for (let i = 0; i < 6; i++) {
      p.knowledge[`loc:${guard.id}`] = { key: `loc:${guard.id}`, kind: 'location', claim: { pos: v(10, 1, 10) }, confidence: 1, learnedAt: w.now + i, source: { type: 'witnessed' }, hops: 0, sharedWith: [] };
      fail(i);
    }
    expect(fresh.checks().find(c => c.id === 'failed-report-retry')?.status).toBe('PASS');
  });

  it('an absent report recipient refutes the shared location across different cases', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Witness', 'villager', v(10, 1, 10));
    const guard = addPerson(tw, 'Watch', 'guard', v(35, 1, 35));
    const post = makePlace(w, 'guardhouse', 'Known post', { x0: 8, x1: 12, z0: 8, z1: 12, y0: 1, y1: 3 }, { inside: v(10, 1, 10) });
    guard.workId = post.id;
    learn(w, p, { key: `place:${post.id}`, kind: 'fact', claim: { placeId: post.id, type: 'guardhouse' }, confidence: 1, source: { type: 'prior' } });
    learn(w, p, { key: `loc:${guard.id}`, kind: 'location', claim: { entityId: guard.id, pos: v(10, 1, 10) }, confidence: 1, source: { type: 'witnessed' } });
    const incident = w.emit('theft', { actor: guard.id, target: p.id });
    learn(w, p, { key: 'first-case', kind: 'event', claim: { eventId: incident.id, type: 'theft', target: p.id }, confidence: 1, source: { type: 'witnessed', viaEvent: incident.id } });
    const adoption = w.emit('goal_changed', { actor: p.id });
    p.mind.goal = { type: 'report', key: `report:${guard.id}:first-case`, targetEntity: guard.id, utility: 1, createdAt: w.now, reasons: [], data: { key: 'first-case' } };
    p.mind.plan = [{ type: 'tell', targetEntity: guard.id, status: 'pending', data: { key: 'first-case', intentionEvent: adoption.id } }];
    (tw.sim as any).act(p, w.primaryBody(p.id), .15, 9);
    expect(p.mind.plan[0].status).toBe('failed');
    const absence = p.knowledge[`loc:${guard.id}`];
    expect(absence.claim.pos).toBeUndefined();
    expect(absence.claim.searched).toEqual([v(10, 1, 10)]);
    expect(w.event(absence.source.viaEvent!)?.causes).toEqual([adoption.id]);
    // Another case cannot revive the searched post, or discover the guard's actual position.
    p.mind.goal = { ...p.mind.goal!, key: `report:${guard.id}:second-case`, data: { key: 'second-case' } };
    expect((tw.sim as any).knownGuardPosition(p, guard)).toBeNull();
    w.primaryBody(guard.id)!.pos = v(20, 1, 20);
    expect((tw.sim as any).knownGuardPosition(p, guard)).toBeNull();
    // Switching to another activity must not evict the reason the reports failed.
    p.mind.goal = null; p.mind.plan = [];
    const crowdMemory = (prefix: string) => { for (let i = 0; i < 500; i++) learn(w, p, { key: `${prefix}:${i}`, kind: 'event', claim: { type: 'theft', target: p.id, eventId: incident.id }, confidence: 1, source: { type: 'witnessed', viaEvent: incident.id } }); };
    crowdMemory('busy');
    expect(p.knowledge[`loc:${guard.id}`]?.claim.pos).toBeUndefined();
    expect(p.knowledge[`loc:${guard.id}`]?.claim.searched).toEqual([v(10, 1, 10)]);
    expect(Object.keys(p.knowledge).length).toBeLessThanOrEqual(440);
    p.mind.reports!['first-case'].status = 'moot'; crowdMemory('later');
    expect(p.knowledge[`loc:${guard.id}`]).toBeUndefined(); // No permanent pin.
    // A genuinely new observation supplies a location through ordinary perception.
    p.mind.percepts = [{ entityId: guard.id, bodyId: w.primaryBody(guard.id)!.id, how: 'saw', pos: v(20, 1, 20), distance: 14, tick: w.now }];
    expect((tw.sim as any).knownGuardPosition(p, guard)).toEqual(v(20, 1, 20));
  });

  it('remembers the danger behind its view cone while replanning the same escape', () => {
    const tw = createTestWorld(918271, 64), w = tw.world;
    const p = addPerson(tw, 'Escaping', 'villager', v(20, 1, 20), { traits: { sociability: 0 } });
    const first = addPerson(tw, 'First danger', 'bandit', v(35, 1, 20));
    const second = addPerson(tw, 'Second danger', 'villager', v(10, 1, 20));
    const home = makePlace(w, 'house', 'Home', { x0: 33, z0: 18, x1: 37, z1: 22, y0: 1, y1: 3 }, { inside: v(35, 1, 20) });
    p.homeId = home.id; getRel(p, first.id).fear = .32; getRel(p, second.id).fear = .8;
    const observe = (q: typeof first) => ({ entityId: q.id, bodyId: w.primaryBody(q.id)!.id, how: 'saw' as const, pos: { ...w.primaryBody(q.id)!.pos }, distance: 15, tick: w.now });
    p.mind.percepts = [observe(first)];
    const firstGoal = { type: 'flee' as const, key: `flee:${first.id}`, targetEntity: first.id, utility: .7, createdAt: w.now, reasons: [] };
    p.mind.plan = (tw.sim as any).plan(p, w.primaryBody(p.id), firstGoal); p.mind.goal = firstGoal;
    // Seeing a second danger does not grant access to the first danger's actual movement.
    p.mind.percepts = [observe(second)]; w.primaryBody(first.id)!.pos = v(60, 1, 60);
    const plan = (tw.sim as any).plan(p, w.primaryBody(p.id), { ...firstGoal, targetEntity: second.id });
    for (const pos of [v(35, 1, 20), v(10, 1, 20)]) expect(Math.hypot(plan[0].pos.x - pos.x, plan[0].pos.z - pos.z)).toBeGreaterThanOrEqual(8);
    expect(plan[0].data.escapeThreats.find((t: any) => t.entityId === first.id).pos).toEqual(v(35, 1, 20));
    expect(w.nav.findPath(w.primaryBody(p.id)!.pos, plan[0].pos)).not.toBeNull();
    // Once the finite escape is over, its scratch observations are not a permanent registry.
    p.mind.plan.forEach(a => { a.status = 'done'; });
    const next = (tw.sim as any).plan(p, w.primaryBody(p.id), { ...firstGoal, targetEntity: second.id });
    expect(next[0].data.escapeThreats.map((t: any) => t.entityId)).toEqual([second.id]);
  });

  it('does not seek refuge with another watchman whom the actor also fears', () => {
    const tw = createTestWorld(918272, 64), w = tw.world;
    const p = addPerson(tw, 'Escaping', 'villager', v(20, 1, 20), { traits: { sociability: 1 } });
    const first = addPerson(tw, 'First watchman', 'guard', v(19, 1, 20));
    const second = addPerson(tw, 'Second watchman', 'guard', v(35, 1, 20));
    for (const q of [first, second]) {
      getRel(p, q.id).fear = .7; const b = w.primaryBody(q.id)!;
      p.mind.percepts.push({ entityId: q.id, bodyId: b.id, how: 'saw', pos: { ...b.pos }, distance: Math.abs(b.pos.x - 20), tick: w.now });
    }
    const plan = (tw.sim as any).plan(p, w.primaryBody(p.id), { type: 'flee', targetEntity: first.id });
    for (const q of [first, second]) {
      const b = w.primaryBody(q.id)!;
      expect(Math.hypot(plan[0].pos.x - b.pos.x, plan[0].pos.z - b.pos.z)).toBeGreaterThanOrEqual(8);
    }
    expect(w.nav.findPath(w.primaryBody(p.id)!.pos, plan[0].pos)).not.toBeNull();
    expect(plan[0].pos).not.toBe(w.primaryBody(p.id)!.pos);
  });

  it('distant fear respects an unfinished errand while immediate danger interrupts', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Carrier', 'villager', v(10, 1, 10), { traits: { courage: 0 } });
    const t = addPerson(tw, 'Feared', 'villager', v(25, 1, 10)), body = w.primaryBody(p.id)!, tb = w.primaryBody(t.id)!;
    getRel(p, t.id).fear = .66; p.schedule = [];
    p.mind.goal = { type: 'haul', key: 'haul:delivery', utility: .96, createdAt: w.now, reasons: ['carrying an accepted order'] };
    p.mind.plan = [{ type: 'goto', pos: v(30, 1, 30), status: 'active' }, { type: 'haul_unload', status: 'pending' }];
    p.mind.percepts = [{ entityId: t.id, bodyId: tb.id, how: 'saw', tick: w.now, distance: 15, pos: { ...tb.pos } }];
    (tw.sim as any).think(p, body);
    expect(p.mind.decision?.candidates[0].type).toBe('flee');
    expect(p.mind.goal?.type).toBe('haul');
    tb.pos = v(11, 1, 10); p.mind.percepts[0] = { ...p.mind.percepts[0], distance: 1, pos: { ...tb.pos } };
    (tw.sim as any).think(p, body);
    expect(p.mind.goal?.type).toBe('flee');
    p.mind.percepts = []; p.needs.social = 1; p.mind.goal!.utility = .1;
    (tw.sim as any).think(p, body);
    expect(p.mind.decision?.candidates[0].type).toBe('socialize');
    expect(p.mind.goal?.type).toBe('flee');
  });

  it('equal attack targets do not reset an approach; a new immediate attacker can', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Defender', 'guard', v(10, 1, 10));
    const a = addPerson(tw, 'First', 'bandit', v(25, 1, 10));
    const b = addPerson(tw, 'Second', 'bandit', v(15, 1, 10)), body = w.primaryBody(p.id)!, bb = w.primaryBody(b.id)!;
    b.hostile = true; getRel(p, b.id).fear = 1;
    p.mind.goal = { type: 'attack', key: `attack:${a.id}`, targetEntity: a.id, utility: 1, createdAt: w.now, reasons: [] };
    p.mind.plan = [{ type: 'goto', targetEntity: a.id, status: 'active' }, { type: 'attack', targetEntity: a.id, status: 'pending' }];
    p.mind.percepts = [{ entityId: b.id, bodyId: bb.id, how: 'saw', tick: w.now, distance: 5, pos: { ...bb.pos } }];
    (tw.sim as any).think(p, body);
    expect(p.mind.decision?.candidates[0].key).toBe(`attack:${b.id}`);
    expect(p.mind.goal?.targetEntity).toBe(a.id);
    bb.pos = v(11, 1, 10); bb.pose = 'attack'; bb.attackTarget = p.id;
    p.mind.percepts[0] = { ...p.mind.percepts[0], distance: 1, pos: { ...bb.pos } };
    (tw.sim as any).think(p, body);
    expect(p.mind.goal?.targetEntity).toBe(b.id);
  });

  it('a failed route informs deliberation until the physical route opens', () => {
    const tw = createTestWorld(918273, 40), w = tw.world;
    const p = addPerson(tw, 'Stranded', 'villager', v(10.5, 1, 10.5)), body = w.primaryBody(p.id)!;
    p.needs.thirst = 1; p.schedule = [];
    const well = makePlace(w, 'well', 'water', { x0: 19, z0: 19, x1: 21, z1: 21, y0: 1, y1: 3 }, { inside: v(20, 1, 20) });
    for (let x = 8; x <= 12; x++) for (let z = 8; z <= 12; z++) if (x === 8 || x === 12 || z === 8 || z === 12) for (let y = 1; y <= 3; y++) w.grid.set(x, y, z, B.Stone);
    w.nav.rebuildAll();
    (tw.sim as any).think(p, body);
    expect(p.mind.goal?.type).toBe('drink_water');
    (tw.sim as any).act(p, body, .15, 9);
    const failure = w.events.find(e => e.type === 'path_failure' && e.actor === p.id)!;
    expect(failure).toBeDefined();
    expect(p.knowledge[`route:drink_water:${well.id}`].source.viaEvent).toBe(failure.id);
    for (let i = 0; i < 20; i++) (tw.sim as any).think(p, body);
    expect(p.mind.decision?.candidates.some(g => g.type === 'drink_water')).toBe(false);
    expect(p.mind.decision?.note).toContain('blocked routes');
    expect(w.events.filter(e => e.type === 'path_failure' && e.actor === p.id)).toHaveLength(1);
    // Even the ordinary idle trip to the square can fail; it then becomes local rest,
    // rather than leaving the chooser empty or making another impossible journey.
    p.mind.plan = [{ type: 'goto', pos: well.inside, status: 'pending' }];
    p.mind.goal = { type: 'idle', key: 'idle:', utility: .1, createdAt: w.now, reasons: [] };
    (tw.sim as any).act(p, body, .15, 9);
    (tw.sim as any).think(p, body);
    expect(p.mind.goal?.type).toBe('idle');
    expect(p.mind.plan[0].pos).toEqual(body.pos);
    expect(p.mind.plan[0].pos).not.toBe(body.pos);
    for (let y = 1; y <= 3; y++) w.grid.set(10, y, 12, B.Air);
    w.nav.rebuildAll();
    (tw.sim as any).think(p, body);
    expect(p.mind.goal?.type).toBe('drink_water');
  });

  it('an unfinished food trip survives a new equal-urgency destination proposal', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Hungry', 'villager', v(10, 1, 10)), body = w.primaryBody(p.id)!;
    p.needs.hunger = .9; p.schedule = [];
    makeItem(w, 'bread', 'carried meal', { quantity: 2, holder: p.id, owner: p.id });
    p.mind.goal = { type: 'eat', key: 'eat:previous-source', utility: .8, createdAt: w.now - 600, reasons: ['previously observed food'], targetPlace: 'previous-source' };
    p.mind.plan = [{ type: 'goto', pos: v(20, 1, 20), status: 'active' }, { type: 'eat', status: 'pending', duration: 1500 }];
    (tw.sim as any).think(p, body);
    expect(p.mind.decision?.candidates[0].type).toBe('eat');
    expect(p.mind.decision?.candidates[0].key).not.toBe('eat:previous-source');
    expect(p.mind.goal?.key).toBe('eat:previous-source');
  });

  it('loading a completed building preserves its open door', () => {
    const { world: w } = createScenario('ordinary', 918271);
    const project = w.constructionProjects[0]; project.status = 'complete'; project.laborDone = project.laborRequired;
    materializeStructure(w, project);
    const b = project.siteBounds, x = Math.floor((b.x0 + b.x1) / 2), y = b.y0 + 1, z = b.z0;
    expect(w.grid.setDoorOpen(x, y, z, true)).toBe(true);
    const restored = deserialize(serialize(w))!.world;
    expect(restored.grid.isDoorOpen(x, y, z)).toBe(true);
    expect([...restored.grid.doorStates]).toEqual([...w.grid.doorStates]);
  });

  it('threat-suppressed proposals do not cancel unfinished needs for weaker ordinary goals', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Thirsty', 'villager', v(10, 1, 10), { traits: { courage: .5 } });
    const t = addPerson(tw, 'Threat', 'villager', v(15, 1, 10)); t.hostile = true;
    const body = w.primaryBody(p.id)!, tb = w.primaryBody(t.id)!;
    p.needs.thirst = 1; p.needs.comfort = 1; p.schedule = [];
    w.weather.kind = 'storm'; w.weather.intensity = 1;
    const water = makePlace(w, 'well', 'well', { x0: 19, x1: 21, z0: 19, z1: 21, y0: 1, y1: 3 }, { inside: v(20, 1, 20) });
    p.mind.goal = { type: 'drink_water', key: `drink_water:${water.id}`, targetPlace: water.id, utility: 1, createdAt: w.now - 600, reasons: ['critical thirst'] };
    p.mind.plan = [{ type: 'goto', pos: water.inside, status: 'active' }, { type: 'drink', pos: water.inside, status: 'pending', duration: 300 }];
    p.mind.percepts = [{ entityId: t.id, bodyId: tb.id, pos: { ...tb.pos }, distance: 5, how: 'saw', tick: w.now }];
    (tw.sim as any).think(p, body);
    expect(p.mind.decision?.candidates.some(g => g.type === 'drink_water')).toBe(false); // Threat gates new proposals.
    expect(p.mind.decision?.candidates[0].type).toBe('shelter');
    expect(p.mind.goal?.type).toBe('drink_water'); // Existing physical attempt remains coherent.
    tb.pos = v(11, 1, 10); tb.pose = 'attack'; tb.attackTarget = p.id;
    p.mind.percepts = [{ entityId: t.id, bodyId: tb.id, pos: { ...tb.pos }, distance: 1, how: 'saw', tick: w.now }];
    (tw.sim as any).think(p, body);
    expect(['flee', 'attack']).toContain(p.mind.goal?.type); // A winning emergency can interrupt.
  });
  it('keeps an unfinished escape across equal threats unless its refuge becomes unsafe', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Escaping', 'villager', v(10, 1, 10), { traits: { courage: 0 } });
    const t = addPerson(tw, 'Other threat', 'villager', v(12, 1, 10));
    const body = w.primaryBody(p.id)!, tb = w.primaryBody(t.id)!;
    getRel(p, t.id).fear = 1; p.schedule = [];
    p.mind.goal = { type: 'flee', key: 'flee:earlier', targetEntity: 'earlier', utility: 1, createdAt: w.now, reasons: ['earlier sighting'] };
    p.mind.plan = [{ type: 'goto', pos: v(30, 1, 30), status: 'active', data: { flee: true } }, { type: 'wait', status: 'pending', duration: 180 }];
    p.mind.percepts = [{ entityId: t.id, bodyId: tb.id, pos: { ...tb.pos }, distance: 2, how: 'saw', tick: w.now }];
    (tw.sim as any).think(p, body);
    expect(p.mind.goal?.key).toBe('flee:earlier');
    tb.pos = v(30, 1, 30);
    p.mind.percepts = [{ entityId: t.id, bodyId: tb.id, pos: { ...tb.pos }, distance: 28, how: 'saw', tick: w.now }];
    (tw.sim as any).think(p, body);
    expect(p.mind.goal?.key).toBe(`flee:${t.id}`);
  });
  it('an unreachable preferred refuge falls back to a reachable escape', () => {
    const tw = createTestWorld(918272, 64), w = tw.world;
    const p = addPerson(tw, 'Escaping', 'villager', v(10.5, 1, 10.5));
    const threat = addPerson(tw, 'Threat', 'bandit', v(9.5, 1, 10.5));
    const home = makePlace(w, 'house', 'raised home', { x0: 28, x1: 34, z0: 8, z1: 14, y0: 4, y1: 7 }, { inside: v(31, 4, 11) });
    p.homeId = home.id;
    for (let x = 28; x <= 34; x++) for (let z = 8; z <= 14; z++) for (let y = 1; y <= 3; y++) w.grid.set(x, y, z, B.Stone);
    w.nav.rebuildAll();
    const body = w.primaryBody(p.id)!, tb = w.primaryBody(threat.id)!;
    p.mind.percepts = [{ entityId: threat.id, bodyId: tb.id, pos: tb.pos, distance: 1, how: 'saw', tick: w.now }];
    const plan = (tw.sim as any).plan(p, body, { type: 'flee', targetEntity: threat.id });
    expect(w.nav.findPath(body.pos, home.inside)).toBeNull();
    expect(w.nav.findPath(body.pos, plan[0].pos)).not.toBeNull();
    expect(plan[0].pos).not.toEqual(home.inside);
  });

  it('failed sowing is not completion, and only locally observed new seed reopens it', () => {
    const tw = createTestWorld(918272, 40), w = tw.world;
    const farm = makePlace(w, 'farm', 'field', { x0: 2, x1: 14, z0: 2, z1: 14, y0: 1, y1: 3 }, { inside: v(5.5, 1, 5.5), indoor: false });
    const p = addPerson(tw, 'Farmer', 'farmer', v(5.5, 1, 5.5), { workId: farm.id });
    w.grid.set(5, 0, 5, B.Farmland);
    createFields(w, [{ placeId: farm.id, ownerId: p.id, startMoisture: .5 }]);
    const field = w.fields[0], body = w.primaryBody(p.id)!;
    p.mind.goal = { type: 'plant', key: 'plant:field', utility: .8, reasons: [], createdAt: w.now, data: { fieldId: field.id } };
    p.mind.plan = [{ type: 'plant', status: 'pending', duration: 600, data: { fieldId: field.id } }];
    (tw.sim as any).act(p, body, .15, 9);
    expect(p.mind.plan[0].status).toBe('failed');
    expect(w.events.some(e => e.type === 'goal_completed' && e.actor === p.id)).toBe(false);
    const shortage = p.knowledge[`short:${farm.id}:grain`];
    expect(shortage).toBeDefined(); expect(shortage.handled).not.toBe(true);
    const observe = () => { w.physicalTime += 3; observeFields(w, p); (tw.sim as any).think(p, body); };
    observe();
    expect(p.mind.decision?.candidates.some(g => g.type === 'plant')).toBe(false);
    body.pos = v(15.5, 1, 5.5);
    makeItem(w, 'grain', 'delivered seed', { owner: p.id, pos: farm.inside, placeId: farm.id, quantity: 2 });
    observe();
    expect(shortage.handled).not.toBe(true); // Seeing crops at a distance does not reveal new stock.
    body.pos = v(5.5, 1, 5.5); observe();
    expect(shortage.handled).toBe(true);
    expect(p.mind.decision?.candidates.some(g => g.type === 'plant')).toBe(true);
    field.plots[0].state = 'harvested'; observe();
    expect(p.knowledge[`field-observation:${field.id}`].claim.fallow).toBe(false);
    expect(p.mind.decision?.candidates.some(g => g.type === 'plant')).toBe(false);
  });

  it('care completion updates old injury evidence using the body actually seen', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Carer', 'villager', v(10, 1, 10));
    const subject = addPerson(tw, 'Kin', 'villager', v(30, 1, 30));
    setRelTags(p, subject.id, 'spouse');
    const ev = w.emit('attack', { actor: p.id, target: subject.id, significance: .7 });
    const k = learn(w, p, { key: `ev:${ev.id}`, kind: 'event', claim: { eventId: ev.id, type: 'attack', actor: p.id, target: subject.id, tick: w.now }, confidence: 1, source: { type: 'witnessed', viaEvent: ev.id } })!;
    formConcerns(w, p, k); formPursuits(w, p);
    const pu = livePursuits(p).find(x => x.kind === 'tend')!;
    expect(pu).toBeDefined();
    learn(w, p, { key: `state:${subject.id}`, kind: 'state', claim: { entityId: subject.id, state: 'badly hurt', wound: .8, tick: w.now }, confidence: 1, source: { type: 'witnessed', viaEvent: ev.id } });
    w.primaryBody(subject.id)!.health = 1; // An unseen other body must not dictate the observation.
    const seen = makeBody(w, subject.id, v(11, 1, 10)); subject.bodies.push(seen.id);
    seen.health = seen.maxHealth * .85; // No care step is possible, but old completion required 90%.
    expect(satisfiedNow(w, p, pu)).toBeNull(); // Remote recovery is not evidence.
    p.mind.percepts = [{ entityId: subject.id, bodyId: seen.id, pos: seen.pos, distance: 1, how: 'saw', tick: w.now }];
    expect(pursuitSteps(w, p, pu)).toEqual([]);
    expect(satisfiedNow(w, p, pu)).toBe('seen_well');
    resolvePursuit(w, p, pu, 'satisfied', 'seen_well');
    const state = p.knowledge[`state:${subject.id}`];
    expect(state.claim.state).toBe('unharmed'); expect(state.claim.bodyId).toBe(seen.id);
    expect(w.event(state.source.viaEvent!)?.data?.kind).toBe('observed_recovery');
    expect(p.mind.concerns?.find(c => c.id === pu.source.id)?.status).toBe('addressed');
    p.mind.percepts = []; formPursuits(w, p);
    expect(livePursuits(p).some(x => x.kind === 'tend')).toBe(false);
  });
  it('does not propose attacking an opponent whose defeat this actor already recorded', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Defender', 'guard', v(10, 1, 10));
    const t = addPerson(tw, 'Opponent', 'villager', v(11, 1, 10)); t.hostile = true;
    const tb = w.primaryBody(t.id)!;
    const c = beginConflict(w, { initiator: p.id, target: t.id, cause: 'self_defense', intent: 'subdue' });
    recordDowning(w, c, t.id, p.id);
    tb.pose = 'stand'; // The pose expired; the ending of this encounter did not.
    p.mind.percepts = [{ entityId: t.id, bodyId: tb.id, pos: tb.pos, distance: 1, how: 'saw', tick: w.now }];
    (tw.sim as any).think(p, w.primaryBody(p.id));
    expect(p.mind.decision?.candidates.some(g => g.type === 'attack')).toBe(false);
    tb.pose = 'attack'; tb.attackTarget = p.id;
    (tw.sim as any).think(p, w.primaryBody(p.id));
    expect(p.mind.decision?.candidates.some(g => g.type === 'attack')).toBe(true);
  });

  it('executes a response to observed fresh aggression instead of completing an old defeat again', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Defender', 'guard', v(10, 1, 10));
    const t = addPerson(tw, 'Opponent', 'villager', v(11, 1, 10));
    const pb = w.primaryBody(p.id)!, tb = w.primaryBody(t.id)!;
    const c = beginConflict(w, { initiator: p.id, target: t.id, cause: 'self_defense', intent: 'subdue' });
    recordDowning(w, c, t.id, p.id);
    tb.pose = 'attack'; tb.attackTarget = p.id;
    p.mind.percepts = [{ entityId: t.id, bodyId: tb.id, pos: { ...tb.pos }, distance: 1, how: 'saw', tick: w.now }];
    p.mind.goal = { type: 'attack', key: `attack:${t.id}`, targetEntity: t.id, createdAt: w.now, utility: 1, reasons: [] };
    p.mind.plan = [{ type: 'attack', targetEntity: t.id, status: 'pending', data: { intent: 'defend' } }];
    (tw.sim as any).act(p, pb, .15, 9);
    expect(p.mind.plan[0].status).toBe('active');
    expect(pb.combatAction?.kind).toBe('attack');
    expect(w.events.some(e => e.type === 'goal_completed' && e.actor === p.id)).toBe(false);
    // Actual incapacity remains terminal, regardless of the previous sensory cue.
    w.physicalTime = pb.combatAction!.completeAt + 1; tb.pose = 'downed';
    (tw.sim as any).act(p, pb, .15, 9);
    expect(p.mind.plan[0].status).toBe('done');
    // Unseen activity is not permission to reopen the old defeat.
    const previousAction = pb.combatAction!.id;
    tb.pose = 'attack'; p.mind.percepts = [];
    p.mind.plan = [{ type: 'attack', targetEntity: t.id, status: 'pending', data: { intent: 'defend' } }];
    (tw.sim as any).act(p, pb, .15, 9);
    expect(p.mind.plan[0].status).toBe('done');
    expect(pb.combatAction!.id).toBe(previousAction);
  });

  it('distinguishes fresh observed aggression from reprocessing the same defeat', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Defender', 'guard', v(10, 1, 10));
    const t = addPerson(tw, 'Opponent', 'villager', v(11, 1, 10));
    const tb = w.primaryBody(t.id)!, diag = new RunDiagnostics(w);
    const c = beginConflict(w, { initiator: p.id, target: t.id, cause: 'self_defense', intent: 'subdue' });
    recordDowning(w, c, t.id, p.id);
    for (let i = 0; i < 2; i++) {
      const action = w.emit('combat_action', { actor: t.id, data: { phase: 'active', kind: 'attack' } });
      tb.pose = 'attack'; tb.combatAction = { eventId: action.id } as typeof tb.combatAction;
      p.mind.percepts = [{ entityId: t.id, bodyId: tb.id, how: 'saw', tick: w.now, pos: tb.pos, distance: 1 }];
      p.mind.goal = { type: 'attack', key: `attack:${t.id}`, targetEntity: t.id, utility: 1, createdAt: w.now + i, reasons: [] };
      w.emit('goal_changed', { actor: p.id, target: t.id, data: { to: 'attack' } });
      w.emit('goal_completed', { actor: p.id, data: { goalType: 'attack' } });
    }
    expect(diag.checks().find(c => c.id === 'defeated-target-reprocessed')?.status).toBe('PASS');
    w.emit('goal_completed', { actor: p.id, data: { goalType: 'attack' } });
    expect(diag.checks().find(c => c.id === 'defeated-target-reprocessed')?.status).toBe('FAIL');
  });

  it('counts a consumed defensive perception during an existing attack plan as new evidence', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Defender', 'guard', v(10, 1, 10));
    const t = addPerson(tw, 'Opponent', 'villager', v(11, 1, 10));
    const diag = new RunDiagnostics(w);
    const c = beginConflict(w, { initiator: p.id, target: t.id, cause: 'self_defense', intent: 'subdue' });
    recordDowning(w, c, t.id, p.id);
    p.mind.goal = { type: 'attack', key: `attack:${t.id}`, targetEntity: t.id, utility: 1, createdAt: w.now, reasons: [] };
    w.emit('goal_completed', { actor: p.id, data: { goalType: 'attack' } });
    const action = w.emit('combat_action', { actor: t.id, data: { phase: 'preparation', kind: 'attack' } });
    const receipt = w.emit('perceived', { actor: p.id, target: t.id, causes: [action.id], data: { how: 'saw', eventType: 'combat_action', eventId: action.id } });
    p.mind.plan = [{ type: 'defend', status: 'done', data: { kind: 'sidestep', evidenceEvent: receipt.id } }];
    w.emit('goal_completed', { actor: p.id, data: { goalType: 'attack' } });
    expect(diag.checks().find(c => c.id === 'defeated-target-reprocessed')?.status).toBe('PASS');
    // The same evidence cannot excuse repeatedly completing the same response.
    w.emit('goal_completed', { actor: p.id, data: { goalType: 'attack' } });
    expect(diag.checks().find(c => c.id === 'defeated-target-reprocessed')?.status).toBe('FAIL');
  });

  it('ordinary wariness does not erase water candidates and make rain shelter interrupt them', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Thirsty', 'villager', v(10, 1, 10));
    const other = addPerson(tw, 'Wary acquaintance', 'villager', v(12, 1, 10));
    const ob = w.primaryBody(other.id)!;
    getRel(p, other.id).fear = .3; getRel(p, other.id).grudge = .6;
    makePlace(w, 'well', 'water', { x0: 19, z0: 19, x1: 21, z1: 21, y0: 1, y1: 2 }, { inside: v(20, 1, 20) });
    p.needs.thirst = 1; p.needs.comfort = 1; p.schedule = [];
    w.weather.kind = 'rain'; w.weather.intensity = .8;
    p.mind.percepts = [{ entityId: other.id, bodyId: ob.id, pos: ob.pos, distance: 2, how: 'saw', tick: w.now }];
    (tw.sim as any).think(p, w.primaryBody(p.id));
    expect(p.mind.decision?.candidates.some(g => g.type === 'drink_water')).toBe(true);
    expect(p.mind.goal?.type).toBe('drink_water');
  });

  it('a failed reporting path records one failed attempt before reconsidering', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Witness', 'villager', v(10, 1, 10));
    const guard = addPerson(tw, 'Watch', 'guard', v(20, 1, 20));
    p.mind.goal = { type: 'report', key: 'report:case', createdAt: w.now, utility: .8, reasons: [], targetEntity: guard.id, data: { key: 'case' } };
    p.mind.plan = [{ type: 'goto', pos: v(20, 6, 20), status: 'pending' }, { type: 'tell', targetEntity: guard.id, status: 'pending', data: { key: 'case' } }];
    // A real disconnected raised cell; no nav stub or forced failure.
    for (let y = 1; y <= 5; y++) w.grid.set(20, y, 20, B.Stone);
    w.nav.rebuildAll();
    (tw.sim as any).act(p, w.primaryBody(p.id), .15, 9);
    expect(p.mind.plan.every(a => a.status === 'failed')).toBe(true);
    expect(p.mind.reports?.case?.attempts).toBe(1);
    expect(p.mind.reports?.case?.deferUntil).toBeGreaterThan(w.now);
    (tw.sim as any).setGoal(p, { type: 'idle', key: 'idle:', utility: .1, reasons: [], createdAt: w.now }, [], 'changed after failure');
    expect(p.mind.reports?.case?.attempts).toBe(1);
  });

  it('new Observatory worlds record terrain edits exactly as reloaded worlds do', () => {
    const { world: w } = createScenario('ordinary', 918271);
    expect(w.grid.recording).toBe(true);
    const node = w.resourceNodes.find(n => n.blocks.length && n.kind !== 'surface_water')!;
    node.state = 'depleted'; node.remaining = 0;
    for (const b of node.blocks) w.grid.set(b.x, b.y, b.z, B.Air);
    const before = JSON.parse(serialize(w)), restored = deserialize(JSON.stringify(before))!;
    expect(JSON.parse(serialize(restored.world)).diffs).toEqual(before.diffs);
    for (const b of node.blocks) expect(restored.world.grid.get(b.x, b.y, b.z)).toBe(B.Air);
  });

  it('seeing an unreachable guard does not erase failure evidence, and reporting follows believed whereabouts', () => {
    const tw = createTestWorld(), w = tw.world;
    const p = addPerson(tw, 'Witness', 'villager', v(10, 1, 10));
    const g = addPerson(tw, 'Watch', 'guard', v(30, 1, 30));
    const e = w.emit('theft', { actor: 'unknown', target: p.id, pos: v(10, 1, 10) });
    const k = learn(w, p, { key: `ev:${e.id}`, kind: 'event', claim: { eventId: e.id, type: 'theft', target: p.id }, confidence: 1, source: { type: 'witnessed', viaEvent: e.id } })!;
    noteReportFailed(w, p, k.key, g.id, 'no path found');
    p.mind.percepts = [{ entityId: g.id, bodyId: g.bodies[0], pos: v(30, 1, 30), distance: 28, how: 'saw', tick: w.now }];
    expect(shouldSeekAuthority(w, refreshReport(w, p, k, [g]))).toBe(false);
    p.mind.percepts = [];
    const goal = { type: 'report', key: `report:${g.id}:${k.key}`, createdAt: w.now, utility: .8, reasons: [], targetEntity: g.id, targetPos: v(20, 1, 20), data: { key: k.key } };
    const plan = (tw.sim as any).plan(p, w.primaryBody(p.id), goal);
    w.primaryBody(g.id)!.pos = v(1, 1, 1);
    expect(plan[0].pos).toEqual(v(20, 1, 20));
    expect(plan[0].targetEntity).toBeUndefined();
    expect((tw.sim as any).knownGuardPosition(p, g)).toBeNull(); // No known post assignment or sighting.
    g.workId = tw.places.guardhouse;
    expect((tw.sim as any).knownGuardPosition(p, g)).toEqual(w.place(tw.places.guardhouse)!.inside);
  });
});
