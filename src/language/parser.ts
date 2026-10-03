import { PHRASES, WORD_ALIASES, ITEM_WORDS, TRADE_REQUESTS } from './phrases';
import type { ConversationalIntent } from '../sim/mind/conversationalIntent';

export interface Reference { id: string; kind: 'person' | 'place' | 'item' | 'topic'; name: string; aliases?: string[]; itemType?: string }
export interface ConversationContext { personId?: string; placeId?: string; itemId?: string; itemType?: string; subject?: string; knowledgeId?: string; previousIntent?: string }
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[’‘]/g, "'").replace(/\b(where|what|who|how|that|there)'s\b/g, '$1 is')
    .replace(/\bi'll\b/g, 'i will').replace(/\b(can't|cannot)\b/g, 'can not').replace(/\bdon't\b/g, 'do not')
    .replace(/\bwon't\b/g, 'will not').replace(/\bshan't\b/g, 'shall not').replace(/\b(\w+)n't\b/g, '$1 not').replace(/\bi'd\b/g, 'i would')
    .replace(/\bi'm\b/g, 'i am').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).map(w => Object.hasOwn(WORD_ALIASES, w) ? WORD_ALIASES[w] : w).join(' ');
}
const includes = (text: string, phrase: string) => (` ${text} `).includes(` ${phrase} `);
export function parseConversation(original: string, references: Reference[] = [], context: ConversationContext = {}) {
  const normalized = normalize(original), tokens = normalized.split(' ').filter(Boolean);
  const entities = references.filter(r => [r.name, ...(r.aliases ?? [])].some(a => includes(normalized, normalize(a))));
  const phrases: { intent: string; phrase: string; weight: number }[] = [];
  const candidates = PHRASES.map(([intent, weight, list], order) => {
    const hits = list.filter(p => includes(normalized, p));
    phrases.push(...hits.map(phrase => ({ intent, phrase, weight })));
    let score = hits.length ? weight + Math.min(2, hits.length - 1) : 0;
    const person = entities.some(e => e.kind === 'person') || context.personId && /\b(he|she|him|her|they|them)\b/.test(normalized);
    if (score && intent === 'ask_about_person_location') score += person ? 4 : entities.some(e => e.kind === 'place') ? -5 : 0;
    if (score && intent === 'ask_for_directions') score += entities.some(e => e.kind === 'place') ? 4 : -2;
    if (score && intent === 'ask_about_person') score += person ? 3 : 0;
    if (score && intent === 'ask_about_place') score += entities.some(e => e.kind === 'place') ? 4 : 0;
    return { intent, score, order };
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score || a.order - b.order);
  const people = entities.filter(e => e.kind === 'person'), places = entities.filter(e => e.kind === 'place'), items = entities.filter(e => e.kind === 'item');
  let intent: ConversationalIntent['intent'] = candidates[0]?.intent ?? 'unknown';
  let clarification: string | undefined;
  if (people.length > 1 && ['ask_about_person', 'ask_about_person_location', 'ask_about_relationship'].includes(intent)) clarification = 'Which person do you mean?';
  if (places.length > 1 && ['ask_about_place', 'ask_for_directions', 'ask_about_ownership'].includes(intent)) clarification = 'Which place do you mean?';
  if (items.length > 1 && new Set(items.map(e => normalize(e.name))).size > 1 && ['request_purchase', 'offer_sale', 'ask_price'].includes(intent)) clarification = 'Which item do you mean?';
  if (intent === 'ask_about_food' && /\b(want|need)\b/.test(normalized)) clarification = 'Are you looking to buy something, or asking where to find food?';
  const personId = people.length === 1 ? people[0].id : /\b(he|she|him|her|they|them)\b/.test(normalized) ? context.personId : undefined;
  if (/\b(he|she|him|her)\b/.test(normalized) && !personId) clarification = 'Who do you mean?';
  const followup = ['ask_when', 'ask_certainty', 'ask_provenance'].includes(intent);
  if (followup && !context.knowledgeId) clarification = 'Which account are you asking about?';
  const recognizedTypes = [...new Set(items.flatMap(e => e.itemType ? [e.itemType] : []))];
  const itemType = (recognizedTypes.length === 1 ? recognizedTypes[0] : undefined) ?? ITEM_WORDS.find(w => includes(normalized, w)) ?? (/\b(that|this|one|two|take)\b/.test(normalized) || intent === 'ask_price' ? context.itemType : undefined);
  const itemId = items.length === 1 ? items[0].id : /\b(that|this|one|two|take)\b/.test(normalized) ? context.itemId : undefined;
  const quantityWord = tokens.find(t => /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/.test(t));
  const numbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const quantity = quantityWord ? numbers[quantityWord] ?? Number(quantityWord) : 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) clarification = 'Please ask for between one and a thousand units.';
  if (['request_purchase', 'offer_sale', 'ask_price'].includes(intent) && !itemType && !itemId) clarification = 'Which item do you mean?';
  // Negation, hypothetical offers and mixed actions must never perform a transaction.
  if (['request_purchase', 'offer_sale'].includes(intent) && /\b(not|never|if|maybe|might|would)\b/.test(normalized)) clarification = 'Are you asking about a trade, or asking to make one now?';
  if ((intent === 'request_purchase' || intent === 'offer_sale') && (!TRADE_REQUESTS[intent].test(normalized) || /\b(from|sell me)\b/.test(normalized))) clarification = 'Are you asking to buy something from me, or sell something to me?';
  if (['request_purchase', 'offer_sale'].includes(intent) && (/\b(no|stop|cancel)\b/.test(normalized) || /\b(how|whether|explain|instead|hundred|thousand)\b/.test(normalized) || /(?:-\s*\d|\d[.,]\d)/.test(original))) clarification = 'Please clarify the item and a whole positive quantity before trading.';
  if (['request_purchase', 'offer_sale', 'ask_price'].includes(intent) && ITEM_WORDS.filter(w => includes(normalized, w)).length > 1) clarification = 'Which item do you mean?';
  if (phrases.some(p => p.intent === 'request_purchase') && phrases.some(p => p.intent === 'offer_sale')) clarification = 'Do you want to buy something or sell something?';
  if (clarification) intent = 'unknown';
  const semanticText = normalized.replace(/^please\s+/, '').replace(/\s+please$/, '');
  const topic = followup ? context.subject ?? '' : people[0]?.name ?? places[0]?.name ?? itemType ?? semanticText;
  const chosen: ConversationalIntent = { intent, topic: topic.slice(0, 160), knowledgeId: null, personId, placeId: places[0]?.id, itemId, itemType, quantity: quantityWord ? Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1000 ? quantity : 1 : undefined,
    referenceKnowledgeId: followup ? context.knowledgeId : undefined, clarification };
  return { original, normalized, tokens, phrases, entities, candidates, chosen, context: { ...context } };
}
