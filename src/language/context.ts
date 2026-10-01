import type { KnowledgeItem, Person } from '../sim/core/types';
import { knownName } from '../sim/mind/people';

export interface ExpressibleKnowledge {
  knowledgeId: string; text: string; confidence: number; source: string;
  learnedAt: number; hops: number; sourceName?: string; placeName?: string;
}
/** Deliberately accepts one mind, never World. No nameOf, event lookup or other minds. */
export function expressibleFact(p: Person, k: KnowledgeItem): ExpressibleKnowledge | null {
  const c = k.claim;
  const name = (id: unknown) => typeof id === 'string' ? knownName(p, id) : 'someone';
  let text: string | undefined;
  if (c.identity && typeof c.identity.name === 'string') text = `${name(c.identity.subject)} introduced themself as ${c.identity.name}`;
  else if (k.kind === 'event') {
    const actor = c.actorUnknown ? 'someone' : name(c.actor), target = name(c.target);
    const lines: Record<string, string> = {
      theft: `${actor} stole something from ${target}`, attack: `${actor} attacked ${target}`,
      kill: `${actor} killed ${target}`, death: `${target} died`, heal: `${actor} tended to ${target}`,
      apology: `${actor} apologized to ${target}`, gift: `${actor} gave something to ${target}`,
      item_missing: 'an item went missing', work_blocked: `work was blocked by a shortage of ${safeWord(c.need)}`,
      resource_shortage: `there was a shortage of ${safeWord(c.resource ?? c.need)}`,
      introduction: `${actor} introduced themself as ${typeof c.claimedName === 'string' ? c.claimedName : 'someone'}`,
    };
    text = lines[c.type];
    // A recorded rumor is itself a belief, not a canonical assertion. The qualifier below is mandatory.
    if (c.type === 'rumor' && typeof c.text === 'string') text = c.text;
  } else if (k.kind === 'fact' && c.occupation?.subject && typeof c.occupation.role === 'string') text = `${name(c.occupation.subject)} works as a ${safeWord(c.occupation.role)}`;
  else if (k.kind === 'fact' && typeof c.text === 'string') text = c.text;
  else if (k.kind === 'state' && typeof c.text === 'string') text = c.text;
  else if (k.kind === 'service' && Array.isArray(c.offers)) text = `a place I know offers ${c.offers.filter((x: unknown) => typeof x === 'string').join(', ')}`;
  else if (k.kind === 'location' && c.pos && [c.pos.x, c.pos.z].every(Number.isFinite)) {
    // Location records also concern items. The mind-only record does not establish entity kind.
    const label = name(c.entityId);
    text = `${label === 'an unfamiliar person' ? 'something' : label} was near (${Math.round(c.pos.x)}, ${Math.round(c.pos.z)})`;
  }
  else if (k.kind === 'ownership') text = `an item belongs to ${name(c.ownerId)}`;
  if (!text || text.length > 400 || !Number.isFinite(k.confidence)) return null;
  return { knowledgeId: k.key, text, confidence: k.confidence, source: k.source.type, sourceName: k.source.from ? knownName(p, k.source.from) : undefined, learnedAt: k.learnedAt, hops: k.hops };
}
function safeWord(value: unknown): string { return typeof value === 'string' && /^[a-z_ ]{1,35}$/.test(value) ? value.replaceAll('_', ' ') : 'materials'; }

export function factSentence(f: ExpressibleKnowledge): string {
  // Realization must retain the actual source and uncertainty.
  const qualifier = f.source === 'told' || f.hops > 0 ? 'I heard, though I cannot be certain, that '
    : f.source === 'heard' ? 'From what I heard, '
    : f.source === 'inferred' ? 'I suspect that '
    : f.confidence < .8 ? 'As far as I know, '
    : f.source === 'witnessed' ? 'I saw that ' : 'I believe that ';
  return `${qualifier}${f.text.replace(/[.!?]+$/, '')}.${f.sourceName && ['told', 'heard'].includes(f.source) ? ` I heard it from ${f.sourceName}.` : ''}`;
}

export function buildContext(p: Person, listenerId?: string, preferredKeys: string[] = []) {
  const sorted = Object.values(p.knowledge).sort((a, b) => Number(preferredKeys.includes(b.key)) - Number(preferredKeys.includes(a.key)) || b.learnedAt - a.learnedAt || a.key.localeCompare(b.key));
  const included: ExpressibleKnowledge[] = [], excluded: { knowledgeId: string; reason: string }[] = [];
  for (const k of sorted) {
    const fact = expressibleFact(p, k);
    if (fact && included.length < 12) included.push(fact);
    else excluded.push({ knowledgeId: k.key, reason: fact ? 'bounded context limit' : 'no reviewed linguistic projection for this claim shape' });
  }
  const rel = listenerId ? p.relationships[listenerId] : undefined;
  return {
    context: {
      identity: { name: p.name, occupation: p.occupation },
      activity: p.mind.plan[0]?.type ?? 'idle', goal: p.mind.goal?.type ?? null,
      needs: { hunger: p.needs.hunger, thirst: p.needs.thirst, fatigue: p.physiology.fatigue },
      mood: { ...p.emotions },
      relationshipToListener: rel ? { trust: rel.trust, familiarity: rel.familiarity, affection: rel.affection } : null,
      knowledge: included,
      // No raw memory summaries: legacy summaries may resolve names through developer truth.
      recentMemories: p.memories.slice(-8).map(m => ({ type: m.type, tick: m.tick, source: m.source.type })),
      concerns: (p.mind.concerns ?? []).slice(0, 6).map(c => ({ kind: c.kind, intensity: c.intensity, basisKeys: c.basisKeys.filter(k => included.some(f => f.knowledgeId === k)) })),
    },
    excluded,
    policy: 'Only this mind; unsupported claim shapes omitted; no World, event payloads, other minds, tools, or developer data.',
  };
}
export type LanguageContext = ReturnType<typeof buildContext>['context'];
