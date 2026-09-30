import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createGunzip, gunzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { deserialize } from '../../src/sim/persist/save';

const dir = process.argv[2] ?? '.debug/observatory-hardening/baseline/replay-918271';
const report = JSON.parse(await readFile(`${dir}/report.json`, 'utf8'));
const evidence = JSON.parse(await readFile(`${dir}/final.evidence.json`, 'utf8'));
const restored = deserialize(gunzipSync(await readFile(`${dir}/final.save.json.gz`)).toString());
if (!restored) throw new Error('Invalid evidence checkpoint');
const w = restored.world;
const states = new Map<string, { tick: number; goal: string }>();
const goalHours: Record<string, Record<string, number>> = {};
const lastMealFailures: Record<string, unknown> = {};
const heals = new Map<string, any>();
const integrity = { duplicateEventIds: [] as string[], contactIdentityFailures: [] as string[], absentActionParents: [] as string[] };
const centerBeyondNominalReach: unknown[] = [];
const ids = new Set<string>();
const lines = createInterface({ input: createReadStream(`${dir}/receipts.ndjson.gz`).pipe(createGunzip()), crlfDelay: Infinity });
for await (const line of lines) {
  const { event: e } = JSON.parse(line);
  if (ids.has(e.id)) integrity.duplicateEventIds.push(e.id); ids.add(e.id);
  if (e.type === 'goal_changed' && e.actor) {
    const old = states.get(e.actor), durations = goalHours[e.actor] ??= {};
    if (old) durations[old.goal] = (durations[old.goal] ?? 0) + (e.tick - old.tick) / 3600;
    states.set(e.actor, { tick: e.tick, goal: e.data.to ?? e.data.goal ?? 'unknown' });
  }
  if (e.type === 'resource_shortage' && e.data.need === 'food') lastMealFailures[e.actor] = e;
  if (e.type === 'heal') {
    const key = `${e.actor}/${e.target}`, old = heals.get(key) ?? { actor: e.actor, target: e.target, count: 0, first: e, last: e };
    old.count++; old.last = e; heals.set(key, old);
  }
  if (e.type === 'attack' && e.data.combat?.hit) {
    const c = e.data.combat, f = e.data.combatFacts;
    if (c.rejection || c.targetBodyId !== f?.targetBodyId || !w.body(c.targetBodyId)) integrity.contactIdentityFailures.push(e.id);
    // Reported distance is between body origins at the step boundary. Actual contact uses
    // swept weapon + anatomical spheres and can precede it. A center-distance test is NOT
    // a collision invariant (combatAction.ts / combatGeometry.ts).
    if (c.distance > c.reach) centerBeyondNominalReach.push({ event: e.id, distance: c.distance, pathReach: c.reach, region: c.contactRegion });
    if (!e.causes.length || e.causes.some((id: string) => !ids.has(id) && !w.event(id))) integrity.absentActionParents.push(e.id);
  }
}
for (const [id, s] of states) { const durations = goalHours[id] ??= {}; durations[s.goal] = (durations[s.goal] ?? 0) + (w.now - s.tick) / 3600; }
const analysis = {
  scope: 'Emission receipts over this entire isolated run; final snapshots are not claims about every earlier moment. Goal hours measure selected-goal residence, not productive labor. Event observer order can precede later perceivedBy updates.',
  integrity, centerBeyondNominalReach, contactLimit: 'Distance beyond nominal path reach is not an impossible hit: swept contact includes both motions and hurt-volume/weapon radii. Receipt identities and action parents are checked; no independent full trajectory replay is claimed.', goalHours, lastMealFailures, heals: [...heals.values()],
  producers: evidence.workplaces.map((p: any) => ({ id: p.place.id, name: p.place.name, staff: p.staff,
    finalStock: p.stock.filter((i: any) => i.quantity > 0),
    output: evidence.flows.filter((f: any) => f.place === p.place.id && ['resource_transformed', 'resource_extracted', 'crop_harvested'].includes(f.type)),
    blockedBatches: evidence.workBlocks.filter((b: any) => b.first.event.placeId === p.place.id),
    staffGoalHours: p.staff.map((s: any) => ({ id: s.id, hours: goalHours[s.id] })) })),
  households: evidence.stressedHouseholds.map((h: any) => ({ name: h.household.name, wealth: h.household.wealth,
    members: h.members.map((p: any) => ({ id: p.id, name: p.name, needs: p.needs, wealth: p.wealth, goal: p.goal, plan: p.plan,
      lastMealFailure: lastMealFailures[p.id], foodBeliefs: p.foodBeliefs.filter((k: any) => /food-access:|pantry:|place:/.test(k.key)),
      accessibleFoodNow: p.accessibleFood, ownedFoodElsewhere: p.ownedFood, hours: goalHours[p.id] })) })),
  injuries: evidence.injured.map((i: any) => { const p = w.person(i.body.ownerId)!, last = i.lastAttacks.at(-1)?.event, canonical = last && w.event(last.id); return {
    person: p.name, body: i.body, physiology: p.physiology, custody: p.custody, surrender: p.surrender,
    lastHit: canonical ?? last, lastHitRetained: !!canonical, causes: canonical?.causes.map((id: string) => w.event(id) ?? { id, missing: true }),
    witnesses: canonical?.perceivedBy, relatedKnowledge: w.persons().flatMap(q => Object.values(q.knowledge).filter(k => k.claim.eventId === last?.id).map(k => ({ person: q.id, key: k.key, source: k.source, claim: k.claim }))),
    careReceipts: [...heals.values()].filter(h => h.target === p.id) }; }),
  foodLedger: report.foodLedger, tally: w.runTally,
  gaps: ['No calorie/mass model across different food types.', 'Legacy blocked-work events do not enumerate every rejected alternative or every machine/tool state.', 'Unavailable meal receipts distinguish no affordable offer only when a seller offers stock; they do not always distinguish absent stock from refusal.', 'Localized injury healing is not implemented; health regeneration is separate.'],
};
await writeFile(`${dir}/final.analysis.json`, JSON.stringify(analysis, null, 2));
console.log(JSON.stringify({ output: `${dir}/final.analysis.json`, integrity, carePairs: heals.size }));
