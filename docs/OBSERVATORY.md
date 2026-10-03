# Torn Veil Observatory

The [development workbench](OBSERVATORY_WORKBENCH.md) adds rearrangeable panels and a playable Babylon viewport of this exact isolated world. Older running servers are preserved; launch a new workbench revision to use the viewport. Historical headless validation below retains its original scope.

The original 30-day RED investigation is complete within the documented scope; overall health remains **AMBER**. [OBSERVATORY_HARDENING.md](OBSERVATORY_HARDENING.md) contains the diagnoses, repairs, before/after metrics, three-seed matrix and explicit limits. The repaired primary ends with 33 living people, 107 edible units and 14 pressured households. Same-seed 30-day replay matches exactly; day-15 save/reload continuation matches all canonical values, with four disclosed nonsemantic concern-field order differences. Performance and remaining decision leads keep the verdict AMBER. The original verification below is preserved as baseline evidence.

The integrity panel distinguishes confirmed invariant/loop failures (RED), incomplete evidence or performance warnings (AMBER), and passing configured hard checks (GREEN); hardship alone does not set health. The delivered launcher has opened the reviewed day-30 world paused at `http://127.0.0.1:7481`, preserving an older server on 7480. Future launches choose the available port. Use **Inspect repaired saved world** to reopen that archive, or **Reproduce 30-day validation** for a fresh ordinary seed-918271 run.

The Observatory runs a **disposable development world** in a separate loopback process. It never opens live, staging, alpha, browser, or Unreal saves. Closing its browser does not stop its server; worlds and checkpoints disappear when that server exits. `Play Torn Veil Web.cmd` and the Unreal fallback are unchanged.

## Start and inspect

1. Double-click **Torn Veil Observatory.cmd** in `C:\Users\green\Desktop\projects\torn-veil-online`. It uses loopback port 7480, or the next free port when preserving an older Observatory process. `-CheckOnly` checks the authoritative checkout and runtime without opening a world. No dependencies or models are installed automatically.
2. The world starts paused. Choose a person in the list or click a body on the overhead map. The inspector shows every present/withdrawn body, physiology, current goal/action/plan, recorded candidate utilities and reasons, motivations, relationships, economy and history. Use **+1 hour** to let an initial world form decisions.
3. **CANONICAL TRUTH** and **WHAT THIS PERSON BELIEVES** are separate panels. Expand Knowledge for confidence, source, hops, learned time and retained revision events. Follow acquisition/event links to the developer causal explorer. Beliefs can be wrong.
4. Before opening a playable viewport, pause/resume and 1×/6×/60× change the wall-clock pacing of the existing headless quantum: 0.15 physical seconds, 9 world seconds at the existing 60:1 clock. They do not increase the quantum or change NPC scheduling. Long runs use the same quantum, yield to requests, and can be stopped. Opening the playable viewport opts this world into the finer gameplay scheduler; the footer labels that mode. The two modes do not claim identical trajectories.
5. Choose a scenario and seed in **Scenario lab**, then **Create isolated world**. This discards only the current in-memory Observatory world. All 15 scenarios disclose initial conditions. Theft/injury/testimony fixtures perform an initial ordinary action; subsequent outcomes are autonomous. The ordinary settlement is the authored Ashford regression world, not the large seven-settlement playable world.
6. Click **Run world without player** for 1, 7 or 30 days. The report compares actual before/after population, resources, relationships and retained event measures, and highlights stored causal impact. Interrupted runs are labeled partial. No narrative is generated.
7. **Save checkpoint / Restore checkpoint** uses the existing save serializer in memory only. **Check replay + save/load** creates independent disposable copies, checks 20-step replay and 20-step continuation with complete persisted-state hashes (excluding only the wall-clock `savedAt` envelope). This is bounded evidence, not a general proof of determinism.
8. In **30-day integrity investigation**, **Original RED evidence** opens the unchanged seed-918271 receipts. Click a named finding for decisions, failed actions and repeated cases. The hourly finding selector also opens earlier worst windows and downloads their complete receipts. **Repaired run evidence** shows the new ledger and profiles; **Inspect repaired saved world** opens its final state paused. **Reproduce 30-day validation** starts the same ordinary seed using the current simulation in a new disposable world. It can be stopped with the existing stop control.

## Deterministic dialogue

Gameplay and Observatory share one lightweight language service. No language model, endpoint, inference queue, token budget or background worker is needed. Type natural questions in **Dialogue parser debug** and select a nearby speaker. The panel shows original and normalized text, phrases, entity references, candidate scores, chosen intent/slots, small conversation context, canonical result, semantic response and selected template.

Recognition uses available conversational references; it does not grant knowledge. Responses use the NPC's own evidence, sources and uncertainty. Follow-ups such as **When?**, **Who told you?** and **Are you sure?** refer to the previously shared account. A new unsupported topic clears that account. World reset and restore clear disposable context. Thought expression is a deterministic read-only view of self state.

Free text and suggested purchases dispatch the same validated conversation transaction. Money, stock and ownership remain canonical. Ambiguous, negated and hypothetical transactions ask for clarification. Apologies reuse the existing social mechanic; other supported speech acts record ordinary perceptible conversation without inventing relationship modifiers.

Run `npm run observatory:benchmark` for 1,000 parser samples, and `npm run observatory:check` for canonical and network-isolation acceptance. The 378-input corpus is in `tests/fixtures/dialogueCorpus.ts`. Detailed current evidence: [Deterministic dialogue](DETERMINISTIC_DIALOGUE.md).

## Observation limits

- The map is a developer overhead projection of real positions and place bounds. It does not replace either renderer.
- Causal edges come only from retained `event.causes`; siblings remain siblings. Goal adoption and knowledge acquisition links lead to those records. Missing ancestry is **CAUSE UNKNOWN / NOT REPRESENTED**. Graphs are capped at 100 nodes and disclose truncation.
- Dashboard cards expose source people/items/nodes/events. Current resource quantities are derived from live state. Production, consumption, trade, births/deaths and other event metrics explicitly cover the **retained event log**, including authored prehistory. Event compaction can reduce counts; a negative retained-count delta is not negative production. Reports also show existing canonical tallies and physical quantities by type.
- WorldLab integrity checks and anomaly detectors are reused. Full material balance, continuous movement validity, complete historical provenance and dedicated conversation-cycle checking remain unverified. The health panel is normally amber unless all configured checks pass; any configured failure makes it red. A green display would still mean only the configured checks passed.
- The Observatory does not fix systemic problems merely because it can now expose them. Sampled failure observations are retained in the run report; they do not affect cognition or world truth.
- Ordinary scenario setup is reproducible. A successful 30-day run establishes that it completed, not that every inhabitant or economic outcome is healthy.

## Preserved verification before simulation hardening

The full normal regression suite passed **1,361 tests across 159 files** in 1,808.38 seconds. The focused acceptance suite passes **35 tests**; its 14 language tests also passed after the final wording correction. Production build/typecheck passed. The delivered `.cmd` launcher was executed successfully and refreshed to the final code. Real headed Chrome acceptance passed at 1600×1000 and 1100×800 with no browser errors, including stored goal adoption, causal sources, real local-model dialogue, read-only thought expression, offline uncertainty, time advance and checkpoint restore. Screenshots were visually inspected.

The ordinary scenario (seed 918271) completed **30 days without a player in 1,021.2 seconds**. Population stayed 33; edible stock fell from 377 to 47 item units; households above the configured hunger/thirst threshold rose from 0 to 14; injured manifestations rose from 0 to 5. Final health was **RED**, not a passing simulation verdict:

- Father Aldous: 12 stuck-actor observations in the detector's retained three-hour window.
- Jory Fletcher, Mara Bramble and Greta Hollis: 42, 43 and 53 goal changes in that window.
- Hale Dorn and Rowan Ashford: 170 and 75 repeated `goal_completed` events.
- Last measured step: 130.46 ms against the configured 100 ms budget, under concurrent machine load.

These are diagnostic findings requiring investigation, not fabricated explanations or proven root causes. The retained log contained 56,351 events; its production/trade/consumption counts are **not** 30-day totals because of compaction. The existing authored four historical deaths are also not deaths caused by this run. Evidence: `.debug/observatory/world-ordinary-30d.json`.

A separate one-day run completed in 14.48 seconds and verified the newer per-resource before/after fields and retained hourly health observations. It also ended RED from repeated events. The 30-day evidence predates those report-only additions; its simulation execution remains valid, but it does not contain that newer hourly history or per-type resource comparison. The 7-day control uses the same runner but was not separately soaked in this session.

Commands:

```powershell
npm run observatory:check
node --import tsx scripts/observatory/browser.ts
npm run observatory:benchmark
node --import tsx scripts/observatory/worldrun.ts 1 ordinary
node --import tsx scripts/observatory/worldrun.ts 7 ordinary
node --import tsx scripts/observatory/worldrun.ts 30 ordinary
```

The browser harness starts its own ephemeral loopback server/world and closes only that server and its own Chrome instance. It verifies real browser interactions at 1600×1000 and 1100×800. Evidence is under `.debug/observatory/`: screenshots, `browser-evidence.json`, `language-benchmark.json`, `model-resources.json`, and bounded-run reports. These are disposable evidence files, not simulation saves.

Historical local-model performance and transport behavior are superseded by deterministic dialogue. Older acceptance receipts remain in Git history and the explicitly historical hardening report.
