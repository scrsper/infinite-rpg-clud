# Deterministic gameplay dialogue — Iteration 1

The gameplay and Observatory language service has no model client, inference transport,
model health check, queue, context prompt, token budget, timeout or response repair path.
The previous transport implementation is preserved in Git history. Historical Observatory
hardening receipts are explicitly marked as superseded for language integration.

## Architecture

`src/language/phrases.ts` holds weighted phrases and spelling aliases. `parser.ts` normalizes,
tokenizes, recognizes available references, scores candidates with declaration-order ties,
extracts bounded slots and produces a canonical intent. `service.ts` assembles conversational
references and dispatches `src/sim/mind/conversationalIntent.ts`. `realizer.ts` separates semantic
response planning from deterministic, seeded templates. Wording does not consume canonical RNG.

Recognition never grants NPC knowledge. Available references come from listener-held identities,
occupational testimony, known places, actual trade offers and carried items. Literal names the
listener has not learned can also be resolved against the addressee's identity evidence at
canonical dispatch; no canonical true-name registry is searched to answer questions.

The canonical dispatcher gates reach, wakefulness, life, willingness and actual testimony.
Person locations use held location evidence, never the person's current canonical coordinates.
Sources, confidence, hearsay and staleness survive realization. Place labels resolve only from
references actually present in an adjudicated claim. Supported occupation declarations travel
through ordinary knowledge and testimony, enabling legitimate occupational aliases later.

Context stores only subject/person/place/item, previous intent and the previously spoken
knowledge key. It is owned by the conversation channel and discarded on changed revisions or
release; Observatory resets/restores discard it. A new unsupported topic cannot inherit an old
account. **When?** means when the NPC learned the account, not a fabricated event timestamp.

Purchases and suggested purchase choices dispatch the same canonical conversation intent,
transaction and existing trade relationship adjustment. Quantity, reach, seller willingness,
stock, funds and ownership are revalidated. Sales use existing whole-carried-item/stack menu
mechanics; ambiguous selections and requests for multiple whole items ask for clarification.
Negated, hypothetical, fractional, negative and mixed-item transactions cannot execute.

Apology uses the existing apology mechanic. Thanks, compliments, insults, threats and agreement
use ordinary perceptible conversation events and speech. No new numerical relationship modifiers
or forced NPC goals are invented. Work and help offers expose existing canonical work mechanics;
accepting a specific commitment remains an explicit suggested choice.

Free-text entry and contextual options remain in the game. The authenticated browser gateway
admits `dialogue_text`; the server returns only player speech and result status, never parser
diagnostics or NPC private context. The model toggle has been removed. Observatory **Dialogue
parser debug** exposes normalization, phrase/entity evidence, scores, slots, context, canonical
result, semantic response and selected template.

## Verification

- 378 regression utterances cover all initial categories, spelling/punctuation variants, names,
  occupations, ambiguous/malformed requests and contextual follow-ups.
- Canonical acceptance compares surface variants and menu/text purchases by complete persisted
  world digest. It checks actual testimony, source follow-ups, stale/unknown knowledge, reach,
  canceled dispatch, conserved money/stock and save/reload of trade/social effects.
- An authenticated real-server test forbids inference HTTP networking and verifies introduction,
  clarification, private-data exclusion, closed-dialogue rejection and checkpointing.
- Real Chrome Observatory acceptance verifies uncertain dialogue, parser diagnostics, thought
  expression, replay, checkpoint restore, and both desktop widths. Screenshots were inspected.
- 1,000 warmed parser inputs: median **0.0217 ms**, p95 **0.0390 ms**, maximum **0.1496 ms** on this
  machine. This measures the parser with the regression reference set, not a whole simulation tick
  or all-world entity scan. Evidence: `.debug/observatory/dialogue-benchmark.json`.
- No model process or listener on model backend ports was present during verification. Tests
  forbid inference HTTP calls. No model package or GPU inference library is imported by dialogue.

- Final focused regression: **9 files, 417 tests passed**, including simulation-basics, parser,
  canonical dialogue, trade/menu equivalence, bridge, authenticated server and player channels.
- Broad regression: **165 of 167 files passed, 1,803 of 1,806 tests passed**. The three dialogue
  failures were resolved and all affected files passed in the final focused run. The broad run
  overlapped final parser refinements; unchanged passing suites were retained per repository
  testing policy. The complete broad suite was not repeated after those fixes.
- Typecheck, production build and production web build passed. Real Chrome production-game
  acceptance passed with model networking prohibited; free text, introduction, clarification
  and suggested choices were verified. Its isolated fixture arranges a reachable NPC without
  changing gameplay mechanics. Screenshot: `.debug/dialogue/gameplay-conversation.png`.

## Delivery status

| Area | Status | Scope |
| --- | --- | --- |
| QWEN removal | VERIFIED | No active gameplay or Observatory client/configuration. |
| Ollama dependency | VERIFIED | No running backend required; inference calls forbidden in acceptance. |
| Intent parser | VERIFIED | Weighted data, normalization, bounded intents; 378 utterance corpus. |
| Entity resolution | VERIFIED | Names, occupations, known places and actual goods; ambiguity clarifies. |
| Context follow-up | VERIFIED | Scoped context; pronouns and provenance; stale references discarded. |
| Knowledge grounding | VERIFIED | Canonical held evidence and reach/willingness gates. |
| Rumor / provenance | VERIFIED | Actual source, confidence, hearsay and learned time. |
| Trade | VERIFIED | Existing transactions; whole-stack sales; ambiguous commitments clarify. |
| Social speech acts | VERIFIED | Existing apology/trade effects and perceptible social speech. |
| Response naturalness | VERIFIED | Bounded seeded variants and existing personality/relationship style. |
| Unknown input | VERIFIED | Clarification without guessed commitments or world mutations. |
| Performance | VERIFIED | 1,000 measured inputs; zero inference workers/network requests. |
| Observatory debugging | VERIFIED | Parser evidence and semantic/template diagnostics in real Chrome. |
| Regression | VERIFIED | Broad run plus final affected-suite checks as detailed above. |

Reproduce:

```powershell
npx vitest run tests/dialogue-parser.test.ts tests/deterministic-dialogue.test.ts tests/dialogue-live.test.ts tests/player-language.test.ts tests/observatory-language.test.ts
npm run observatory:benchmark
node --import tsx scripts/observatory/browser.ts --visible
node --import tsx scripts/web/dialogue.ts
```

Optional machine cleanup, after verifying any other uses of the installed model:

```powershell
ollama rm qwen3:8b
```

No model or unrelated application was uninstalled. No isometric conversion is part of this task.
