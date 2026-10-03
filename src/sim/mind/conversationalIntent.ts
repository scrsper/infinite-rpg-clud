import type { Person } from '../core/types';
import type { Simulation } from './agent';
import { conversationBodies } from './socialEvidence';
import { introduce, knownName } from './people';
import { describeClaim, MAX_TESTIMONY_HOPS, learn } from './knowledge';
import { selectTopic } from './conversation';
import { DialogueSystem } from './dialogue';
import { adjustRel } from './relationships';
import { woundSeverity } from '../core/attributes';

export const CONVERSATIONAL_INTENTS = ['ask_about_person', 'ask_about_person_location', 'ask_about_relationship', 'ask_about_place', 'ask_for_directions', 'ask_about_event', 'ask_about_rumor', 'ask_about_work', 'ask_about_occupation', 'ask_about_item', 'ask_about_ownership', 'ask_about_availability', 'ask_about_trade', 'ask_price', 'request_purchase', 'offer_sale', 'ask_about_food', 'ask_about_resources', 'ask_for_help', 'offer_help', 'ask_about_health', 'ask_about_injury', 'ask_about_weather', 'ask_about_relationship_to_player', 'thank', 'compliment', 'insult', 'agree', 'disagree', 'yes', 'no', 'unknown', 'ask_provenance', 'ask_certainty', 'ask_when', 'ask_about_emotion', 'offer_information', 'request_item', 'threaten', 'apologize', 'greet', 'goodbye'] as const;
export interface ConversationalIntent { intent: typeof CONVERSATIONAL_INTENTS[number]; topic: string; knowledgeId: string | null; personId?: string; placeId?: string; itemId?: string; itemType?: string; quantity?: number; referenceKnowledgeId?: string; clarification?: string }
export interface ConversationResult { accepted: boolean; reason: string; line: string; spokenKnowledgeIds: string[]; eventIds: string[]; subjectId?: string }

/** Text processors propose only this contract. Range, life, trust, actual knowledge and all
 * consequences remain here. Disposable response wording is never canonical knowledge. */
export function converse(sim: Simulation, speaker: Person, npc: Person, input: ConversationalIntent): ConversationResult {
  const w = sim.world, first = w.events.length;
  const result = (accepted: boolean, reason: string, line: string, spokenKnowledgeIds: string[] = []): ConversationResult => ({ accepted, reason, line, spokenKnowledgeIds, eventIds: w.events.slice(first).map(e => e.id), subjectId: input?.personId });
  if (!input || !CONVERSATIONAL_INTENTS.includes(input.intent) || typeof input.topic !== 'string' || input.topic.length > 160 || !(input.knowledgeId === null || typeof input.knowledgeId === 'string')) return result(false, 'invalid_intent', 'I cannot understand that request.');
  if (['personId', 'placeId', 'itemId', 'itemType', 'referenceKnowledgeId', 'clarification'].some(key => { const value = input[key as keyof ConversationalIntent]; return value !== undefined && (typeof value !== 'string' || value.length > 240); })) return result(false, 'invalid_intent', 'I cannot understand that request.');
  const bodies = conversationBodies(w, speaker, npc);
  if (!bodies) return result(false, 'not_reachable', 'We cannot speak here: the participants must be awake, alive and within speaking reach.');
  if (input.quantity !== undefined && (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000)) return result(false, 'invalid_quantity', 'How many units do you mean?');
  if (input.intent === 'unknown') return result(true, 'clarification', input.clarification ?? "I don't quite understand what you're asking.");
  if (input.intent === 'goodbye') return result(true, 'goodbye', 'Farewell.');
  const relation = npc.relationships[speaker.id];
  if (input.intent !== 'ask_about_relationship_to_player' && (npc.hostile || (relation?.trust ?? 0) < -.3)) return result(false, 'unwilling', 'I do not wish to discuss that with you.');
  if (!input.personId && ['ask_about_person', 'ask_about_person_location', 'ask_about_relationship'].includes(input.intent)) {
    // A literal name can be asked without already possessing its identity record. Resolve
    // only the addressee's identity evidence, never World.persons() or canonical true names.
    const names = Object.values(npc.knowledge).filter(k => k.claim.identity?.name).filter(k => {
      const name = String(k.claim.identity.name).toLowerCase();
      return (` ${input.topic.toLowerCase()} `).includes(` ${name} `) || (` ${input.topic.toLowerCase()} `).includes(` ${name.split(' ')[0]} `);
    });
    if (names.length > 1) return result(true, 'clarification', 'Which person do you mean?');
    if (names.length === 1) input = { ...input, personId: names[0].claim.identity.subject };
  }
  const menu = new DialogueSystem(w, sim);
  const ordinary = menu.respond(npc, speaker, input.intent);
  if (ordinary) return result(true, input.intent, ordinary.lines.join(' '));
  if (['thank', 'compliment', 'insult', 'threaten', 'agree', 'disagree', 'yes', 'no'].includes(input.intent)) {
    const lines: Record<string, string> = { thank: 'You are welcome.', compliment: 'That is kind of you.', insult: 'There is no need for that.', threaten: 'Keep your threats to yourself.', agree: 'Very well.', disagree: 'We see it differently.', yes: 'All right.', no: 'Very well.' };
    // Record actual speech with ordinary perceptibility. No invented relationship delta.
    const speech: Record<string, string> = { thank: 'Thank you.', compliment: 'You are kind.', insult: 'You fool.', threaten: 'I will hurt you.', agree: 'I agree.', disagree: 'I disagree.', yes: 'Yes.', no: 'No.' };
    sim.say(speaker, speech[input.intent]);
    w.emit('conversation', { actor: speaker.id, target: npc.id, pos: { ...bodies.speaker.pos }, visibility: 5, loudness: 4, significance: .1,
      data: { speechAct: input.intent, text: speech[input.intent], speakerBodyId: bodies.speaker.id, listenerBodyId: bodies.listener.id }, summary: speech[input.intent] });
    return result(true, 'social_speech', lines[input.intent]);
  }
  if (input.intent === 'ask_about_occupation' && !input.personId) {
    // Self declaration is ordinary provenance-bearing testimony, so the listener can later
    // use the occupational reference. This is a claim, not a second canonical job registry.
    const key = `occupation:${npc.id}`;
    let k = npc.knowledge[key];
    if (k?.claim.occupation?.role !== npc.occupation) k = learn(w, npc, { key, kind: 'fact', claim: { occupation: { subject: npc.id, role: npc.occupation }, text: `I work as a ${npc.occupation}` }, confidence: 1, source: { type: 'self' } }, true)!;
    const accepted = !!k && sim.tell(npc, speaker, k);
    return result(accepted, 'self_occupation', accepted ? `I work as a ${npc.occupation}.` : 'I cannot discuss my work now.', accepted ? [key] : []);
  }
  if (['ask_about_health', 'ask_about_injury'].includes(input.intent) && !input.personId) {
    const injured = npc.bodies.some(id => { const body = w.body(id); return !!body && !body.dead && body.present && woundSeverity(body) > 0; });
    return result(true, 'self_health', injured ? 'I have wounds that need tending.' : npc.physiology.fatigue > .6 ? 'I am tired.' : 'I can still get about.');
  }
  if (['ask_provenance', 'ask_certainty', 'ask_when'].includes(input.intent)) {
    const k = input.referenceKnowledgeId ? npc.knowledge[input.referenceKnowledgeId] : undefined;
    if (!k || k.hops >= MAX_TESTIMONY_HOPS) return result(true, 'unknown', 'I do not have that account to explain.');
    const line = input.intent === 'ask_when' ? `I learned that ${Math.max(0, Math.floor((w.now - k.learnedAt) / 60))} world minutes ago.`
      : input.intent === 'ask_certainty' ? k.source.type === 'witnessed' && k.hops === 0 ? `I witnessed it, but this is still my account.` : 'I did not see it myself. I cannot be certain.'
      : k.source.from ? `${knownName(npc, k.source.from)} told me.` : k.source.type === 'witnessed' ? 'I saw it myself.' : `My account comes from ${k.source.type} evidence.`;
    return result(true, 'provenance', line);
  }
  if (['ask_about_availability', 'ask_price', 'request_purchase'].includes(input.intent)) {
    const offers = sim.tradeOffers(npc, speaker).filter(o => input.itemId ? o.item.id === input.itemId : input.itemType ? o.item.type === input.itemType : false);
    const offer = offers.sort((a, b) => a.item.id.localeCompare(b.item.id))[0];
    if (!offer) return result(true, 'no_offer', 'I have none of that to offer you.');
    if (input.intent !== 'request_purchase') return result(true, 'trade_quote', `${offer.item.type}: ${offer.unitPrice} silver each; ${offer.available} units available. ${input.quantity ?? 1} would cost ${offer.unitPrice * (input.quantity ?? 1)} silver.`);
    if (offer.item.quantity <= 1) {
      if ((input.quantity ?? 1) !== 1) return result(true, 'clarification', 'There is only one of that item.');
      const ev = sim.buyItem(speaker, npc, offer.item);
      if (ev) adjustRel(w, npc, speaker.id, { affection: .05, trust: .05 }, 'traded', ev.id);
      return result(!!ev, ev ? 'purchase' : 'purchase_refused', ev ? `You bought ${offer.item.name} for ${offer.unitPrice} silver.` : 'I cannot complete that purchase.');
    }
    const bought = sim.buyUnits(speaker, npc, offer.item, input.quantity ?? 1);
    if (bought.units) adjustRel(w, npc, speaker.id, { affection: .05, trust: .05 }, 'traded', bought.event?.id);
    return result(bought.units > 0, bought.units > 0 ? 'purchase' : 'purchase_refused', bought.units > 0 ? `You bought ${bought.units} ${offer.item.type} for ${bought.paid} silver.` : 'I cannot complete that purchase.');
  }
  if (input.intent === 'offer_sale') {
    if ((input.quantity ?? 1) !== 1) return result(true, 'clarification', 'I can buy a whole carried item or stack. Use the trade choices to select it.');
    const trade = menu.respond(npc, speaker, 'trade_menu');
    const options = trade?.options.filter(o => o.label.startsWith('Sell ') && (input.itemType ? o.label.toLowerCase().includes(input.itemType) : input.itemId ? o.label.includes(w.item(input.itemId)?.name ?? '\u0000') : false)) ?? [];
    if (input.quantity !== undefined && speaker.inventory.some(id => { const it = w.item(id); return !!it && (input.itemId ? it.id === input.itemId : it.type === input.itemType) && it.quantity > 1; })) return result(true, 'clarification', 'I buy carried stacks as a whole. Choose the stack in the trade choices if that is what you mean.');
    if (options.length !== 1) return result(true, 'clarification', options.length ? 'Which of those items do you want to sell?' : 'I cannot buy that from you.');
    const state = options[0].next(), sold = w.events.slice(first).some(e => e.type === 'trade');
    return result(sold, sold ? 'sale' : 'sale_refused', state?.lines.join(' ') ?? 'I cannot complete that sale.');
  }
  if (input.personId && ['ask_about_person', 'ask_about_relationship', 'ask_about_person_location'].includes(input.intent)) {
    if (input.personId === npc.id) return result(true, 'self_identity', input.intent === 'ask_about_person_location' ? 'I am right here.' : `I am ${npc.name}.`);
    const identity = npc.knowledge[`identity:${input.personId}`];
    if (!identity) return result(true, 'unknown_person', 'I do not know anyone by that name.');
    if (input.intent === 'ask_about_person') { const accepted = sim.tell(npc, speaker, identity); return result(accepted, 'person_identity', `I know them as ${knownName(npc, input.personId)}.`, accepted ? [identity.key] : []); }
    if (input.intent === 'ask_about_relationship') {
      const r = npc.relationships[input.personId];
      return result(true, 'relationship', !r ? 'I hardly know them.' : r.trust > .3 ? 'I trust them.' : r.trust < -.3 ? 'I do not trust them.' : 'I have no strong opinion of them.');
    }
  }
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
    return result(true, 'trade_inquiry', offers.length ? 'I have goods to offer. Have a look at the trade choices.' : 'I have nothing to offer you at present.');
  }
  if (input.intent === 'apologize') {
    // Availability and consequences are the existing menu mechanic; no invented relationship delta.
    if (!relation || relation.grudge <= .2 && relation.fear <= .3) return result(false, 'no_apology_available', 'There is nothing to settle through an apology now.');
    const state = menu.respond(npc, speaker, 'apology_action');
    return result(true, 'apology', state?.lines.join(' ') ?? 'Your apology has been heard.');
  }
  if (input.intent === 'ask_for_help') return result(true, 'clarification', 'What sort of help do you need? You can ask me about work, goods, or someone you are looking for.');
  if (input.intent === 'request_item') return result(false, 'requires_ordinary_action', 'Which item do you need? We can discuss a trade.');
  if (input.intent === 'ask_about_event' && /^(news|what.*news|anything new)[?.! ]*$/i.test(input.topic.trim())) {
    const state = menu.respond(npc, speaker, 'news');
    const keys = w.events.slice(first).filter(e => e.type === 'told' && e.actor === npc.id && e.target === speaker.id).flatMap(e => typeof e.data.key === 'string' ? [e.data.key] : []);
    return result(true, 'news', state?.lines.join(' ') ?? 'I have no news to share.', keys);
  }
  const words = input.topic.toLowerCase().match(/[a-z]{3,}/g)?.filter(s => !['did', 'you', 'the', 'that', 'what', 'who', 'about', 'where', 'any', 'know', 'happened', 'see', 'have', 'heard', 'tell', 'there', 'was', 'does', 'they', 'something', 'and', 'are', 'for', 'with', 'from', 'other', 'this', 'those', 'these', 'your', 'their', 'has', 'had', 'can', 'could', 'would', 'should', 'please', 'all', 'anything'].includes(s)) ?? [];
  const candidates = Object.values(npc.knowledge).filter(k => k.hops < MAX_TESTIMONY_HOPS &&
    (!['ask_about_health', 'ask_about_injury'].includes(input.intent) || k.kind === 'state' && k.claim.entityId === input.personId) &&
    (input.intent !== 'ask_about_occupation' || k.claim.occupation?.subject === input.personId) &&
    (input.intent !== 'ask_for_directions' || ['location', 'service'].includes(k.kind)) &&
    (!['ask_about_event', 'ask_about_rumor'].includes(input.intent) || k.kind === 'event' || k.claim.type === 'rumor') &&
    (input.intent !== 'ask_about_person_location' || k.kind === 'location' && !!input.personId && k.claim.entityId === input.personId) &&
    (input.intent !== 'ask_about_ownership' || k.kind === 'ownership') &&
    (!input.placeId || k.claim.placeId === input.placeId || k.claim.entityId === input.placeId || k.claim.itemId === input.placeId) &&
    (!input.itemId || k.claim.entityId === input.itemId || k.claim.itemId === input.itemId)).map(k => {
    const tokens = new Set((describeClaim(w, k, npc).toLowerCase() + ' ' + k.key.toLowerCase()).match(/[a-z]{3,}/g) ?? []);
    return { k, score: input.intent === 'ask_about_person_location' || input.placeId || input.itemId || input.personId && ['ask_about_health', 'ask_about_injury', 'ask_about_occupation'].includes(input.intent) ? 10 : words.reduce((n, word) => n + Number(tokens.has(word) || ['stole', 'stolen', 'took', 'theft'].includes(word) && k.claim.type === 'theft'), 0) };
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score || b.k.learnedAt - a.k.learnedAt || a.k.key.localeCompare(b.k.key));
  const k = /^(news|what.*news|anything new)[?.! ]*$/i.test(input.topic.trim()) ? selectTopic(w, npc, speaker, { threshold: .12 })?.k : candidates[0]?.k;
  if (!k) return result(true, 'unknown', 'I do not know anything about that.');
  const accepted = sim.tell(npc, speaker, k);
  const identity = input.personId ? npc.knowledge[`identity:${input.personId}`] : undefined;
  const named = accepted && identity && !speaker.knowledge[identity.key] && sim.tell(npc, speaker, identity);
  return result(accepted, accepted ? 'answered_from_belief' : 'refused', accepted ? 'I shared the account I hold.' : 'I cannot share that now.', accepted ? [k.key, ...(named && identity ? [identity.key] : [])] : []);
}
