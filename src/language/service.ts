import type { Person } from '../sim/core/types';
import type { Simulation } from '../sim/mind/agent';
import { converse } from '../sim/mind/conversationalIntent';
import { expressibleFact } from './context';
import { normalize, parseConversation, type ConversationContext, type Reference } from './parser';
import { responseChoices } from './contract';
import { planResponse, realizeResponse } from './realizer';

export class LanguageService {
  async thought(npc: Person, signal?: AbortSignal) {
    if (signal?.aborted) throw new Error('Cancelled');
    const line = npc.needs.thirst > .6 ? 'I need some water.' : npc.needs.hunger > .6 ? 'I need something to eat.' : npc.physiology.fatigue > .6 ? 'I feel tired.' : 'I am considering what to do next.';
    return { mode: 'Read-only deterministic self expression', generated: { output: responseChoices(line)[0], template: 'self-state' }, note: 'Disposable wording; no thought, memory or event is created.' };
  }
  async ask(sim: Simulation, player: Person, npc: Person, text: string, signal?: AbortSignal, beforeDispatch?: () => boolean, context: ConversationContext = {}) {
    if (typeof text !== 'string' || !text.trim() || text.length > 1000) throw new Error('Enter 1–1000 characters');
    const started = performance.now(), references: Reference[] = [];
    for (const k of Object.values(player.knowledge)) {
      const identity = k.claim.identity;
      if (identity?.subject && typeof identity.name === 'string') references.push({ id: identity.subject, kind: 'person', name: identity.name, aliases: [identity.name.split(' ')[0]] });
      if (k.kind === 'location' || k.kind === 'service') {
        const id = k.claim.placeId ?? (k.kind === 'service' ? k.claim.entityId : undefined), place = id ? sim.world.place(id) : undefined;
        if (place) references.push({ id: place.id, kind: 'place', name: place.name, aliases: [place.type] });
      }
      const social = k.claim.social;
      if (social?.family === 'occupation' && typeof social.subject === 'string' && typeof social.characteristic === 'string') references.push({ id: social.subject, kind: 'person', name: social.characteristic, aliases: social.characteristic === 'blacksmith' ? ['smith', 'the smith'] : [] });
      if (k.claim.occupation?.subject && typeof k.claim.occupation.role === 'string') references.push({ id: k.claim.occupation.subject, kind: 'person', name: k.claim.occupation.role, aliases: k.claim.occupation.role === 'smith' ? ['blacksmith'] : [] });
    }
    for (const o of sim.tradeOffers(npc, player)) references.push({ id: o.item.id, kind: 'item', name: o.item.name, aliases: [o.item.type], itemType: o.item.type });
    for (const id of player.inventory) { const item = sim.world.item(id); if (item) references.push({ id, kind: 'item', name: item.name, aliases: [item.type], itemType: item.type }); }
    const grouped = new Map<string, Reference>();
    for (const r of references) {
      const key = `${r.kind}:${r.id}`, prior = grouped.get(key);
      if (prior) prior.aliases = [...new Set([...(prior.aliases ?? []), r.name, ...(r.aliases ?? [])])];
      else grouped.set(key, { ...r, aliases: [...(r.aliases ?? [])] });
    }
    const unique = [...grouped.values()];
    const parsed = parseConversation(text, unique, context);
    if (parsed.chosen.intent === 'offer_information') {
      const matches = Object.values(player.knowledge).filter(k => {
        const fact = expressibleFact(player, k);
        return fact && (` ${parsed.normalized} `).includes(` ${normalize(fact.text)} `) || (` ${parsed.normalized} `).includes(` ${normalize(k.key)} `);
      });
      const contextual = /\bshare that\b/.test(parsed.normalized) && context.knowledgeId ? player.knowledge[context.knowledgeId] : undefined;
      parsed.chosen.knowledgeId = contextual?.key ?? (matches.length === 1 ? matches[0].key : null);
      if (matches.length > 1 && !contextual) { parsed.chosen.intent = 'unknown'; parsed.chosen.clarification = 'Which account do you want to share?'; }
    }
    if (signal?.aborted || beforeDispatch && !beforeDispatch()) throw new Error('Cancelled before canonical conversation');
    const canonical = converse(sim, player, npc, parsed.chosen);
    const facts = canonical.spokenKnowledgeIds.flatMap(key => {
      const k = npc.knowledge[key], f = k ? expressibleFact(npc, k) : null;
      // A held location/service claim supplies the reference. Never look up where the subject
      // actually is; this resolves only the established place's public label.
      const place = k?.claim.placeId ? sim.world.place(k.claim.placeId) : undefined;
      if (f && place) { f.placeName = place.name; if (k.kind === 'location') f.text = f.text.replace(/\([^)]+\)/, place.name); }
      return f ? [f] : [];
    });
    const semantic = planResponse(canonical, facts, canonical.spokenKnowledgeIds.map(key => npc.knowledge[key]).filter(Boolean));
    const realized = realizeResponse(semantic, npc, player.id, sim.world.seed, sim.world.now), output = responseChoices(realized.speech)[0];
    output.claims = facts.map(f => ({ knowledgeId: f.knowledgeId, confidence: f.confidence })); output.topics = facts.map(f => f.knowledgeId);
    const newPersonTopic = ['ask_about_person', 'ask_about_person_location', 'ask_about_relationship', 'ask_about_event', 'ask_about_rumor'].includes(parsed.chosen.intent);
    const changedItem = parsed.chosen.itemType && parsed.chosen.itemType !== context.itemType;
    const nextContext: ConversationContext = canonical.accepted && canonical.reason !== 'clarification' ? {
      personId: canonical.subjectId ?? parsed.chosen.personId ?? (newPersonTopic ? undefined : context.personId), placeId: parsed.chosen.placeId ?? context.placeId,
      itemId: canonical.reason === 'no_offer' ? undefined : parsed.chosen.itemId ?? (changedItem ? undefined : context.itemId), itemType: parsed.chosen.itemType ?? context.itemType,
      subject: parsed.chosen.topic, knowledgeId: canonical.spokenKnowledgeIds[0], previousIntent: parsed.chosen.intent,
    } : { previousIntent: parsed.chosen.intent };
    if (canonical.reason === 'provenance') { nextContext.knowledgeId = context.knowledgeId; nextContext.subject = context.subject; }
    return { playerText: text, parsed: { ...parsed, output: parsed.chosen }, canonical, semantic, nextContext,
      generated: { output, template: realized.template, fallback: false }, elapsedMs: performance.now() - started,
      note: 'Deterministic parsing and wording. Canonical mechanics alone decide knowledge and consequences.' };
  }
}
