import { describe, it, expect } from 'vitest';
import { DIALOGUE_CORPUS, REFERENCES } from './fixtures/dialogueCorpus';
import { parseConversation, normalize } from '../src/language/parser';
describe('deterministic dialogue corpus', () => {
  it('covers at least 200 distinct natural, malformed and contextual inputs', () => {
    expect(new Set(DIALOGUE_CORPUS.map(c => c.text)).size).toBeGreaterThanOrEqual(200);
  });
  for (const c of DIALOGUE_CORPUS) it(c.text, () => {
    const r = parseConversation(c.text, REFERENCES, c.context);
    expect(r.chosen.intent).toBe(c.intent);
    if (c.personId) expect(r.chosen.personId).toBe(c.personId);
  });
  it('retains original text, normalizes contractions and common spelling, and extracts quantities', () => {
    expect(normalize(" WHERE'S   Edwin?!")).toBe('where is edwin');
    expect(parseConversation('buy two bred', REFERENCES).chosen).toMatchObject({ intent: 'request_purchase', quantity: 2, itemType: 'bread' });
    expect(parseConversation('buy 0 bread', REFERENCES).chosen.intent).toBe('unknown');
  });
});
