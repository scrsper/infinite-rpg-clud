import type { Person, KnowledgeItem } from '../sim/core/types';
import type { ConversationResult } from '../sim/mind/conversationalIntent';
import { knownName } from '../sim/mind/people';
import { factSentence, type ExpressibleKnowledge } from './context';

export interface SemanticResponse { act: string; line: string; facts: ExpressibleKnowledge[]; evidence: KnowledgeItem[] }
export function planResponse(result: ConversationResult, facts: ExpressibleKnowledge[], evidence: KnowledgeItem[]): SemanticResponse {
  return { act: result.reason, line: result.line, facts, evidence };
}
const TEMPLATES = {
  unknown: ['I do not know anything about that.', 'I cannot tell you about that.', 'I have no account of that to share.'],
  unknown_person: ['I do not know anyone by that name.', 'I am not sure who you mean.'],
  location: ['I saw {person} near {place}.', '{person} was near {place} when I saw them.', 'Last I saw {person}, they were near {place}.'],
  stale_location: ['I saw {person} near {place} earlier, but they may have moved on.', 'Last I knew, {person} was near {place}. They may have moved since.'],
};
export function realizeResponse(plan: SemanticResponse, npc: Person, listenerId: string, seed: number, now: number) {
  let hash = 2166136261;
  for (const ch of `${seed}:${npc.id}:${listenerId}:${now}:${plan.act}:${plan.evidence.map(k => k.key).join(',')}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const choose = (lines: readonly string[]) => lines[(hash >>> 0) % lines.length];
  let speech = plan.line, template = plan.act;
  if (plan.act === 'unknown' || plan.act === 'unknown_person') speech = choose(TEMPLATES[plan.act]);
  else if (plan.act === 'answered_from_belief') {
    const k = plan.evidence[0];
    if (k?.kind === 'location' && k.source.type === 'witnessed' && !k.hops && k.confidence >= .8 && k.claim.pos) {
      const person = knownName(npc, k.claim.entityId), place = plan.facts[0]?.placeName ?? `(${Math.round(k.claim.pos.x)}, ${Math.round(k.claim.pos.z)})`;
      template = now - k.learnedAt > 3600 ? 'stale_location' : 'location';
      speech = choose(TEMPLATES[template as 'location' | 'stale_location']).replaceAll('{person}', person).replaceAll('{place}', place);
    } else {
      speech = plan.facts.length ? plan.facts.map(factSentence).join(' ') : 'I hold an account, but cannot put it clearly enough to share here.';
      if (k && now - k.learnedAt > 3600) speech += ' That account is old; things may have changed.';
    }
  }
  const style = npc.emotions.anger > .5 ? 'irritated' : (npc.relationships[listenerId]?.affection ?? 0) > .3 ? 'friendly' : npc.traits.sociability < .3 ? 'reserved' : 'plain';
  // Tone never changes the supported clauses or their certainty.
  if (style === 'irritated' && plan.act === 'unknown') speech = 'Listen. ' + speech;
  if (style === 'friendly' && plan.act === 'answered_from_belief') speech = 'Glad to help. ' + speech;
  return { speech, template: `${template}:${style}:${(hash >>> 0)}`, style };
}
