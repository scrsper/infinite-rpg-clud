import type { Person } from '../core/types';
import type { Simulation } from './agent';
import { conversationReachable } from './socialEvidence';
import { introduce } from './people';
import { describeClaim, MAX_TESTIMONY_HOPS } from './knowledge';
import { selectTopic } from './conversation';
import { DialogueSystem } from './dialogue';

export const CONVERSATIONAL_INTENTS = ['ask_about_person', 'ask_about_place', 'ask_about_event', 'ask_about_trade', 'ask_for_help', 'offer_information', 'request_item', 'threaten', 'apologize', 'greet', 'goodbye'] as const;
export interface ConversationalIntent { intent: typeof CONVERSATIONAL_INTENTS[number]; topic: string; knowledgeId: string | null }
export interface ConversationResult { accepted: boolean; reason: string; line: string; spokenKnowledgeIds: string[]; eventIds: string[] }

/** Text processors propose only this contract. Range, life, trust, actual knowledge and all
 * consequences remain here. No LLM wording is stored in knowledge, memories or speech. */
export function converse(sim: Simulation, speaker: Person, npc: Person, input: ConversationalIntent): ConversationResult {
  const w = sim.world, first = w.events.length;
  const result = (accepted: boolean, reason: string, line: string, spokenKnowledgeIds: string[] = []): ConversationResult => ({ accepted, reason, line, spokenKnowledgeIds, eventIds: w.events.slice(first).map(e => e.id) });
  if (!input || !CONVERSATIONAL_INTENTS.includes(input.intent) || typeof input.topic !== 'string' || input.topic.length > 160 || !(input.knowledgeId === null || typeof input.knowledgeId === 'string')) return result(false, 'invalid_intent', 'I cannot understand that request.');
  if (!conversationReachable(w, speaker, npc)) return result(false, 'not_reachable', 'We cannot speak here: the participants must be awake, alive and within speaking reach.');
  if (input.intent === 'goodbye') return result(true, 'goodbye', 'Farewell.');
  const relation = npc.relationships[speaker.id];
  if (npc.hostile || (relation?.trust ?? 0) < -.3) return result(false, 'unwilling', 'I do not wish to discuss that with you.');
  if (input.intent === 'greet' || input.intent === 'ask_about_person' && /^(you|yourself)[?.! ]*$|\b(who are you|your name|introduce yourself)\b/i.test(input.topic.trim())) {
    const accepted = introduce(w, npc, speaker);
    return result(accepted, 'introduction', `My name is ${npc.name}.`);
  }
  if (input.intent === 'offer_information') {
    const k = input.knowledgeId ? speaker.knowledge[input.knowledgeId] : undefined;
    if (!k || k.hops >= MAX_TESTIMONY_HOPS) return result(false, 'unsupported_information', 'You do not have a supported account to share.');
    const accepted = sim.tell(speaker, npc, k);
    return result(accepted, accepted ? 'testimony' : 'refused', accepted ? 'I have heard your account.' : 'We cannot exchange that account now.');
  }
  if (input.intent === 'ask_about_trade') {
    const offers = sim.tradeOffers(npc, speaker);
    return result(true, 'trade_inquiry', offers.length ? 'I have goods I can offer. Use the ordinary trade interaction to choose an item and price.' : 'I have nothing to offer you at present.');
  }
  if (input.intent === 'apologize') {
    // Availability and consequences are the existing menu mechanic; no invented relationship delta.
    if (!relation || relation.grudge <= .2 && relation.fear <= .3) return result(false, 'no_apology_available', 'There is nothing to settle through an apology now.');
    const option = new DialogueSystem(w, sim).start(npc, speaker).options.find(o => o.label === 'Apologize');
    if (!option) return result(false, 'no_apology_available', 'An apology is not possible now.');
    const state = option.next();
    return result(true, 'apology', state?.lines.join(' ') ?? 'Your apology has been heard.');
  }
  if (['request_item', 'threaten', 'ask_for_help'].includes(input.intent)) return result(false, 'requires_ordinary_action', 'That request needs an available ordinary interaction; words alone do not transfer items, accept work or initiate combat.');
  const words = input.topic.toLowerCase().match(/[a-z]{3,}/g)?.filter(s => !['did', 'you', 'the', 'that', 'what', 'who', 'about', 'where', 'any', 'know', 'happened', 'see', 'have', 'heard', 'tell', 'there', 'was', 'does', 'they', 'something', 'and', 'are', 'for', 'with', 'from', 'other', 'this', 'those', 'these', 'your', 'their', 'has', 'had', 'can', 'could', 'would', 'should', 'please', 'all', 'anything'].includes(s)) ?? [];
  const candidates = Object.values(npc.knowledge).filter(k => k.hops < MAX_TESTIMONY_HOPS).map(k => {
    const tokens = new Set((describeClaim(w, k, npc).toLowerCase() + ' ' + k.key.toLowerCase()).match(/[a-z]{3,}/g) ?? []);
    return { k, score: words.reduce((n, word) => n + Number(tokens.has(word) || ['stole', 'stolen', 'took', 'theft'].includes(word) && k.claim.type === 'theft'), 0) };
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score || b.k.learnedAt - a.k.learnedAt || a.k.key.localeCompare(b.k.key));
  const k = /^(news|what.*news|anything new)[?.! ]*$/i.test(input.topic.trim()) ? selectTopic(w, npc, speaker, { threshold: .12 })?.k : candidates[0]?.k;
  if (!k) return result(true, 'unknown', 'I do not know anything about that.');
  const accepted = sim.tell(npc, speaker, k);
  return result(accepted, accepted ? 'answered_from_belief' : 'refused', accepted ? 'I shared the account I hold.' : 'I cannot share that now.', accepted ? [k.key] : []);
}
