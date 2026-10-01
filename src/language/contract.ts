import type { ExpressibleKnowledge } from './context';
import { factSentence } from './context';
import { CONVERSATIONAL_INTENTS } from '../sim/mind/conversationalIntent';

export const INTENTS = CONVERSATIONAL_INTENTS;
export type Intent = { intent: typeof INTENTS[number]; topic: string; knowledgeId: string | null };
export function validateIntent(value: unknown, shareKeys: readonly string[]): Intent {
  const o = object(value, ['intent', 'topic', 'knowledgeId']);
  if (!INTENTS.includes(o.intent as Intent['intent']) || typeof o.topic !== 'string' || o.topic.length > 160 || !(o.knowledgeId === null || typeof o.knowledgeId === 'string')) throw new Error('Invalid intent fields');
  if (o.intent === 'offer_information' ? typeof o.knowledgeId !== 'string' || !shareKeys.includes(o.knowledgeId) : o.knowledgeId !== null) throw new Error('Unsupported knowledge reference');
  return o as Intent;
}
export interface DialogueOutput { speech: string; intent: 'inform' | 'acknowledge' | 'refuse'; topics: string[]; claims: { knowledgeId: string; confidence: number }[] }
export function responseChoices(line: string, facts: ExpressibleKnowledge[] = []): DialogueOutput[] {
  const base = facts.length ? facts.map(factSentence).join(' ') : line;
  const output: DialogueOutput = { speech: base, intent: facts.length ? 'inform' : 'acknowledge', topics: facts.map(f => f.knowledgeId), claims: facts.map(f => ({ knowledgeId: f.knowledgeId, confidence: f.confidence })) };
  return ['', 'Well, ', 'Let me think. '].map(prefix => ({ ...output, speech: prefix + base }));
}
/** Referential validity alone cannot validate arbitrary factual prose. Accept only complete
 * reviewed realizations of the canonical result; never display rejected raw model text as speech. */
export function validateDialogue(value: unknown, choices: DialogueOutput[]): DialogueOutput {
  const o = object(value, ['speech', 'intent', 'topics', 'claims']);
  if (typeof o.speech !== 'string' || o.speech.length > 1600 || !['inform', 'acknowledge', 'refuse'].includes(String(o.intent)) || !Array.isArray(o.topics) || !Array.isArray(o.claims)) throw new Error('Invalid speech schema');
  for (const claim of o.claims) object(claim, ['knowledgeId', 'confidence']);
  const match = choices.find(c => c.speech === o.speech && c.intent === o.intent && JSON.stringify(c.topics) === JSON.stringify(o.topics) && c.claims.length === o.claims!.length && c.claims.every((v, i) => v.knowledgeId === o.claims![i].knowledgeId && v.confidence === o.claims![i].confidence));
  if (!match) throw new Error('Ungrounded wording, uncertainty, or claim reference');
  return structuredClone(match);
}
function object(value: unknown, keys: string[]): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) throw new Error('Unexpected JSON fields');
  return value as Record<string, any>;
}
