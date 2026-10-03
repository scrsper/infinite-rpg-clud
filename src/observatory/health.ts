import type { World } from '../sim/core/world';
import { INVARIANTS } from '../headless/worldlab/invariants';
import { takeProbe, type ProbeContext } from '../headless/worldlab/probe';
import type { Observation } from '../headless/worldlab/types';
import { detectAnomalies } from '../sim/telemetry/anomaly';

export interface HealthCheck { id: string; label: string; status: 'PASS' | 'FAIL' | 'UNVERIFIED'; detail: string; evidence?: unknown }
/** A report is a sampled observation, never a claim that the artificial world is correct. */
export function healthSnapshot(w: World, context: ProbeContext, previous?: Observation, verification: HealthCheck[] = [], performanceMs?: number, diagnosticChecks: HealthCheck[] = []) {
  const current = takeProbe(context, w, w.now - context.worldStart);
  const configured = INVARIANTS.map(check => {
    const findings = check.check(w, previous ?? null, current);
    const interval = /currency|spendable/.test(check.id);
    return { id: check.id, label: check.id.replaceAll('-', ' '), status: findings.some(f => f.severity === 'failure') ? 'FAIL' : findings.length || interval && !previous ? 'UNVERIFIED' : 'PASS', detail: check.description, evidence: findings } as HealthCheck;
  });
  const knowledgeProblems = w.persons().flatMap(p => Object.values(p.knowledge).filter(k => !k.source || !Number.isFinite(k.confidence) || k.confidence < 0 || k.confidence > 1 || !Number.isFinite(k.learnedAt) || ['told', 'read'].includes(k.source.type) && !k.source.from).map(k => ({ person: p.id, key: k.key })));
  const invalid = w.events.filter(e => e.actor && !w.get(e.actor));
  const locations = w.items().filter(i => Number(!!i.holderId) + Number(!!i.pos) + Number(!!i.containerId) > 1);
  const anomalies = detectAnomalies(w);
  const checks: HealthCheck[] = [...configured,
    { id: 'item-locations', label: 'Duplicate item locations', status: locations.length ? 'FAIL' : 'PASS', detail: 'An item cannot have both holder and ground position (or holder and container).', evidence: locations.map(i => i.id) },
    { id: 'knowledge-provenance', label: 'Knowledge provenance shape', status: knowledgeProblems.length ? 'FAIL' : 'PASS', detail: 'Confidence, time and sources represented; not proof every legacy premise is epistemically valid.', evidence: knowledgeProblems },
    { id: 'invalid-actors', label: 'Invalid event actors', status: invalid.length ? 'FAIL' : 'PASS', detail: 'Retained event actor references resolve.', evidence: invalid.map(e => e.id) },
    ...['dangling_cause', 'invalid_entity_reference', 'epistemic_leak', 'surrender_or_custody_ignored'].map(type => ({ id: type, label: type.replaceAll('_', ' '), status: anomalies.some(a => a.type === type) ? 'FAIL' : 'PASS', detail: 'Existing structural anomaly check; recorded canonical evidence, not an activity-rate threshold.', evidence: anomalies.filter(a => a.type === type) } as HealthCheck)),
    { id: 'resource-conservation', label: 'Full resource conservation', status: 'UNVERIFIED', detail: 'Stock/haul/currency checks are configured. No complete material balance for all transformations exists.' },
    { id: 'movement', label: 'Impossible movement', status: 'UNVERIFIED', detail: 'No continuous trajectory proof in this sampled inspector.' },
    ...['stuck_agent', 'goal_churn', 'event_spam', 'unresolved_conflict_loop'].map(type => ({ id: type, label: type.replaceAll('_', ' '), status: 'UNVERIFIED', detail: 'Unchanged rate threshold: a diagnostic lead, not proof of a defect. Inspect event-time decisions and blockers. Absence does not prove full-window coverage.', evidence: anomalies.filter(a => a.type === type) } as HealthCheck)),
    ...diagnosticChecks,
    { id: 'conversation-loop', label: 'Runaway conversation loops', status: 'UNVERIFIED', detail: 'Event spam checks cover repeated event types. A dedicated conversation-cycle invariant is not yet represented.' },
    ...['determinism', 'save-load'].map(id => verification.find(c => c.id === id) ?? { id, label: id === 'determinism' ? 'Determinism' : 'Save/load continuity', status: 'UNVERIFIED' as const, detail: 'Run the isolated replay / continuity check.' }),
    { id: 'performance', label: 'Simulation performance', status: performanceMs === undefined ? 'UNVERIFIED' : performanceMs <= 100 ? 'PASS' : 'UNVERIFIED', detail: performanceMs === undefined ? 'No step measured yet.' : `Last fixed 0.15 s headless step: ${performanceMs.toFixed(2)} ms; unchanged budget 100 ms. Exceedance is an AMBER performance warning.` },
  ];
  return { current, report: { tick: w.now, status: checks.some(c => c.status === 'FAIL') ? 'RED' : checks.every(c => c.status === 'PASS') ? 'GREEN' : 'AMBER', checks, anomalies } };
}
