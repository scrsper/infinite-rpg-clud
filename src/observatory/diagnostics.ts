import type { World } from '../sim/core/world';
import type { WorldEvent } from '../sim/core/types';
import { isFood } from '../sim/world/factory';
import type { HealthCheck } from './health';
import { conflictBetween } from '../sim/social/conflict';

/** Developer receipts, outside canonical state. Never consulted by a mind or a planner. */
export class RunDiagnostics {
  readonly from: number;
  readonly counts: Record<string, number> = {};
  readonly food = { initial: 0, production: 0, consumption: 0, spoilage: 0, transformationInput: 0 };
  private timelines = new Map<string, unknown[]>();
  private falseDeliveries: unknown[] = [];
  private handoffAttempts = new Map<string, { signature: string; actor: string; target?: string; first: string; last: string; firstAt: number; lastAt: number; count: number }>();
  private handoffLoops: unknown[] = [];
  private reportAttempts = new Map<string, { signature: string; actor: string; target?: string; first: string; last: string; firstAt: number; lastAt: number; count: number }>();
  private reportLoops: unknown[] = [];
  private attackGrounds = new Map<string, { adoptedAt: number; event: string }>();
  private defeatedCompletions = new Map<string, { first: string; last: string; count: number; actor: string; target: string; downedAt: number; renewedAggression?: string }>();
  private completions = new Map<string, { first: string; firstAt: number; last: string; lastAt: number; count: number; actor: string; goal: unknown }>();
  private signatures = new Map<string, { count: number; firstAt: number; lastAt: number; first: string; last: string; causes: string[] }>();
  constructor(readonly world: World) {
    this.from = world.now; this.food.initial = this.foodUnits();
    world.onEvent(e => this.observe(e));
  }
  private foodUnits() { return this.world.items().filter(i => isFood(i.type)).reduce((n, i) => n + i.quantity, 0); }
  private observe(e: WorldEvent) {
    const w = this.world, d = e.data, p = e.actor ? w.person(e.actor) : undefined;
    this.counts[e.type] = (this.counts[e.type] ?? 0) + 1;
    // Wildlife emits the same event type for kilogram intake from resource nodes.
    // Only a real edible Item consumption removes one unit from this stock ledger.
    if (e.type === 'food_consumed' && e.item && isFood(d.food)) this.food.consumption++;
    if (e.type === 'resource_spoiled' && isFood(d.resource as any)) this.food.spoilage += Number(d.lost);
    if (e.type === 'resource_transformed') {
      if (isFood(d.to as any)) this.food.production += Number(d.toQty);
      if (isFood(d.from as any)) this.food.transformationInput += Number(d.fromQty);
    }
    if (e.type === 'resource_extracted' && isFood(d.yield as any)) this.food.production += Number(d.amount);
    const signature = `${e.type}:${e.actor ?? ''}:${e.target ?? ''}`;
    const s = this.signatures.get(signature);
    if (s) { s.count++; s.last = e.id; s.lastAt = e.tick; s.causes = [...e.causes]; }
    else this.signatures.set(signature, { count: 1, first: e.id, last: e.id, firstAt: e.tick, lastAt: e.tick, causes: [...e.causes] });
    if (!p) return;
    if (['goal_changed', 'goal_abandoned', 'path_failure', 'investigation', 'work_blocked', 'goal_completed'].includes(e.type) || e.type === 'perceived' && ['failed_handoff', 'failed_report'].includes(d.kind)) {
      const list = this.timelines.get(p.id) ?? [];
      // Copy immediately: plans, decisions and bodies subsequently mutate in place.
      list.push(JSON.parse(JSON.stringify({ event: e, needs: p.needs, wealth: p.wealth, goal: p.mind.goal,
        plan: p.mind.plan, decision: p.mind.decision, percepts: p.mind.percepts,
        bodies: p.bodies.map(id => { const b = w.body(id); return b && { id, pos: b.pos, health: b.health, pathGoal: b.pathGoal }; }),
        evidence: p.mind.goal?.data?.key ? p.knowledge[String(p.mind.goal.data.key)] : p.mind.goal?.data?.crime ? p.knowledge[String(p.mind.goal.data.crime)] : undefined })));
      if (list.length > 250) list.shift(); this.timelines.set(p.id, list);
    }
    const g = p.mind.goal;
    if (e.type === 'told') this.reportAttempts.delete(p.id);
    if (e.type === 'perceived' && d.kind === 'failed_report') {
      const b = w.primaryBody(p.id), loc = p.knowledge[`loc:${e.target}`];
      // Changing the incident being reported does not change an absent listener.
      // A new positive sighting, moved search, or successful report does.
      const signature = JSON.stringify({ target: e.target, destination: g?.targetPos,
        reason: d.reason,
        position: b && [b.pos.x, b.pos.y, b.pos.z].map(n => Number(n.toFixed(2))),
        observation: d.reason === 'conversation_unavailable' || d.reason === 'testimony_exhausted'
          // Seeing the same sleeping listener again is not changed evidence of
          // conversation availability. Preserve the actual physical blocker.
          ? { hops: p.knowledge[d.key]?.hops, listener: w.person(e.target!)?.bodies.map(id => {
            const body = w.body(id); return body && { present: body.present, dead: body.dead, healthy: body.health > 0,
              unresponsive: ['sleep', 'downed'].includes(body.pose), pos: body.pos };
          }) }
          : loc?.claim.pos ? { pos: loc.claim.pos, at: loc.learnedAt } : null });
      const old = this.reportAttempts.get(p.id);
      if (old?.signature === signature && e.tick - old.firstAt <= 10800) {
        old.count++; old.last = e.id; old.lastAt = e.tick;
        if (old.count === 5) this.reportLoops.push(old);
      } else this.reportAttempts.set(p.id, { signature, actor: p.id, target: e.target, first: e.id, last: e.id, firstAt: e.tick, lastAt: e.tick, count: 1 });
    }
    if (e.type === 'gift') this.handoffAttempts.delete(p.id);
    if (e.type === 'perceived' && d.kind === 'failed_handoff' && g?.type === 'provide') {
      const b = w.primaryBody(p.id), seen = p.mind.percepts.find(pc => pc.entityId === e.target);
      const signature = JSON.stringify({ target: e.target, item: d.itemId, holder: w.item(d.itemId)?.holderId, reason: d.reason,
        position: b && [b.pos.x, b.pos.y, b.pos.z].map(n => Number(n.toFixed(2))),
        destination: g.targetPos, locationClaim: p.knowledge[`loc:${e.target}`]?.claim, observedTarget: seen?.pos });
      const old = this.handoffAttempts.get(p.id);
      if (old?.signature === signature && e.tick - old.firstAt <= 10800) {
        old.count++; old.last = e.id; old.lastAt = e.tick;
        // Same five-attempt trigger as the path-failure lead, with an additional
        // unchanged material/position/evidence signature: an actual failed retry loop.
        if (old.count === 5) this.handoffLoops.push(old);
      } else this.handoffAttempts.set(p.id, { signature, actor: p.id, target: e.target, first: e.id, last: e.id, firstAt: e.tick, lastAt: e.tick, count: 1 });
    }
    if (e.type === 'goal_changed' && g?.type === 'attack' && g.targetEntity) {
      const seen = p.mind.percepts.find(pc => pc.entityId === g.targetEntity && pc.how === 'saw');
      const body = seen && w.body(seen.bodyId), event = body?.pose === 'attack' ? body.combatAction?.eventId : undefined;
      if (event && w.event(event)) this.attackGrounds.set(p.id, { adoptedAt: g.createdAt, event });
      else this.attackGrounds.delete(p.id);
    }
    if (e.type === 'goal_completed' && g?.type === 'attack' && g.targetEntity) {
      const downed = conflictBetween(w, p.id, g.targetEntity)?.downed;
      if (downed?.who === g.targetEntity) {
        const ground = this.attackGrounds.get(p.id);
        // A reflex can extend an existing plan without selecting another goal. Its
        // consumed sensory receipt is new evidence too; merely retaining/reusing
        // the same defense in the plan must not excuse another completion.
        const defenses = p.mind.plan.filter(a => a.type === 'defend' && a.status === 'done').flatMap(a => {
          const receipt = a.data?.evidenceEvent && w.event(a.data.evidenceEvent);
          const action = receipt?.data.eventId && w.event(receipt.data.eventId);
          return receipt?.type === 'perceived' && receipt.actor === p.id && receipt.target === g.targetEntity
            && receipt.data.how === 'saw' && action?.type === 'combat_action' && action.actor === g.targetEntity
            && receipt.causes.includes(action.id) ? [receipt.id] : [];
        });
        const grounds = [...(ground?.adoptedAt === g.createdAt ? [ground.event] : []), ...defenses];
        const renewedAggression = grounds.length ? grounds.join('/') : undefined;
        const key = `${p.id}/${g.targetEntity}/${downed.at}/${renewedAggression ?? ''}`, old = this.defeatedCompletions.get(key);
        if (old) { old.count++; old.last = e.id; }
        else this.defeatedCompletions.set(key, { first: e.id, last: e.id, count: 1, actor: p.id, target: g.targetEntity, downedAt: downed.at, renewedAggression });
      }
    }
    if (e.type === 'goal_completed' && g?.type === 'provide' && w.item(g.data?.itemId)?.holderId !== g.targetEntity) this.falseDeliveries.push(JSON.parse(JSON.stringify({ event: e, goal: g, plan: p.mind.plan })));
    if (e.type === 'goal_completed' && g && ['investigate', 'confront'].includes(g.type)) {
      const key = `${p.id}/${g.key}/${g.createdAt}`;
      const old = this.completions.get(key);
      if (old) { old.count++; old.last = e.id; old.lastAt = e.tick; }
      else this.completions.set(key, { first: e.id, firstAt: e.tick, last: e.id, lastAt: e.tick, count: 1, actor: p.id, goal: JSON.parse(JSON.stringify(g)) });
    }
  }
  checks(): HealthCheck[] {
    const repeated = [...this.completions.values()].filter(v => v.count > 1);
    const ledger = this.ledger();
    const defeated = [...this.defeatedCompletions.values()].filter(v => v.count > 1);
    // Hourly health retains these results. Later attempts must not retroactively
    // insert a finding or increase its count in an earlier sampled observation.
    return structuredClone<HealthCheck[]>([
      { id: 'failed-report-retry', label: 'Failed report retried without changed evidence', status: this.reportLoops.length ? 'FAIL' : 'PASS', detail: 'Five failed reports within three hours at the same position/destination without changed evidence or a successful report. Repeated sightings of the same unresponsive listener and different incident keys do not reset a conversation blocker.', evidence: this.reportLoops },
      { id: 'failed-handoff-retry', label: 'Failed handoff retried without progress', status: this.handoffLoops.length ? 'FAIL' : 'PASS', detail: 'Five autonomous provide failures within three hours with unchanged item holder, actor position, destination and recipient-location evidence. Actual transfers or new spatial evidence reset the attempt sequence.', evidence: this.handoffLoops },
      { id: 'defeated-target-reprocessed', label: 'Same recorded defeat completed repeatedly', status: defeated.length ? 'FAIL' : 'PASS', detail: 'Attack completed again against the same recorded downing without a distinct newly observed combat action. Separate responses to fresh aggression are separate evidence.', evidence: defeated },
      { id: 'delivery-progress', label: 'Completed delivery transferred its item', status: this.falseDeliveries.length ? 'FAIL' : 'PASS', detail: `Physical item holder checked at every provide completion since ${this.from}.`, evidence: this.falseDeliveries },
      { id: 'completed-case-reprocessed', label: 'Completed case processed again', status: repeated.length ? 'FAIL' : 'PASS', detail: `Same actor, case key and goal adoption completed more than once; continuous receipts since ${this.from}.`, evidence: repeated },
      { id: 'food-balance', label: 'Edible stock balance', status: Math.abs(ledger.unexplained) > 1e-6 ? 'FAIL' : 'PASS', detail: 'Edible item units, not calories; all represented production, eating, spoilage and edible transformation inputs since recording began.', evidence: [ledger] },
    ]);
  }
  ledger() {
    const final = this.foodUnits(), f = this.food;
    return { ...f, final, unexplained: final - (f.initial + f.production - f.consumption - f.spoilage - f.transformationInput) };
  }
  person(id: string) { return { from: this.from, through: this.world.now, limit: 250, note: 'Last 250 recorded decision/action receipts for this person; event-time developer truth. Older receipts can be in the archived validation run.', timeline: this.timelines.get(id) ?? [] }; }
  summary() { return { from: this.from, through: this.world.now, food: this.ledger(), counts: this.counts, checks: this.checks(), signatures: [...this.signatures].map(([signature, value]) => ({ signature, ...value })).sort((a, b) => b.count - a.count).slice(0, 100) }; }
}
