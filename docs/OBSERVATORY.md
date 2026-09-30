# Torn Veil Observatory and local language

The original 30-day RED investigation and current validation evidence are documented in [OBSERVATORY_HARDENING.md](OBSERVATORY_HARDENING.md). The original verification below is preserved as baseline evidence. The integrity panel distinguishes confirmed invariant/loop failures (RED), incomplete evidence or performance warnings (AMBER), and passing configured checks (GREEN); hardship alone does not set health.

The Observatory runs a **disposable development world** in a separate loopback process. It never opens live, staging, alpha, browser, or Unreal saves. Closing its browser does not stop its server; worlds and checkpoints disappear when that server exits. `Play Torn Veil Web.cmd` and the Unreal fallback are unchanged.

## Start and inspect

1. Double-click **Torn Veil Observatory.cmd** in `C:\Users\green\Desktop\projects\torn-veil-online`. It uses loopback port 7480, or the next free port when preserving an older Observatory process. `-CheckOnly` checks the authoritative checkout and runtime without opening a world. No dependencies or models are installed automatically.
2. The world starts paused. Choose a person in the list or click a body on the overhead map. The inspector shows every present/withdrawn body, physiology, current goal/action/plan, recorded candidate utilities and reasons, motivations, relationships, economy and history. Use **+1 hour** to let an initial world form decisions.
3. **CANONICAL TRUTH** and **WHAT THIS PERSON BELIEVES** are separate panels. Expand Knowledge for confidence, source, hops, learned time and retained revision events. Follow acquisition/event links to the developer causal explorer. Beliefs can be wrong.
4. Pause/resume and 1×/6×/60× change the wall-clock pacing of the existing headless quantum: 0.15 physical seconds, 9 world seconds at the existing 60:1 clock. They do not increase the quantum or change NPC scheduling. Long runs use the same quantum, yield to requests, and can be stopped. This does not claim identical trajectories to the finer realtime bridge quantum.
5. Choose a scenario and seed in **Scenario lab**, then **Create isolated world**. This discards only the current in-memory Observatory world. All 15 scenarios disclose initial conditions. Theft/injury/testimony fixtures perform an initial ordinary action; subsequent outcomes are autonomous. The ordinary settlement is the authored Ashford regression world, not the large seven-settlement playable world.
6. Click **Run world without player** for 1, 7 or 30 days. The report compares actual before/after population, resources, relationships and retained event measures, and highlights stored causal impact. Interrupted runs are labeled partial. No narrative is generated.
7. **Save checkpoint / Restore checkpoint** uses the existing save serializer in memory only. **Check replay + save/load** creates independent disposable copies, checks 20-step replay and 20-step continuation with complete persisted-state hashes (excluding only the wall-clock `savedAt` envelope). This is bounded evidence, not a general proof of determinism.
8. In **30-day integrity investigation**, **Original RED evidence** opens the unchanged seed-918271 receipts. Click a named finding for decisions, failed actions and repeated cases. The hourly finding selector also opens earlier worst windows and downloads their complete receipts. **Repaired run evidence** shows the new ledger and profiles; **Inspect repaired saved world** opens its final state paused. **Reproduce 30-day validation** starts the same ordinary seed using the current simulation in a new disposable world. It can be stopped with the existing stop control.

## Local AI

The measured default is the **already installed `qwen3:8b`**, Q4_K_M, 8.2B parameters. No download was performed. In Language debug, use:

| Backend | Base URL | Model |
| --- | --- | --- |
| Ollama | `http://127.0.0.1:11434/v1` | `qwen3:8b` or an installed local model ID |
| LM Studio | `http://127.0.0.1:1234/v1` | ID exposed by its local server |

Start the chosen backend's local server, click **Detect local models**, enter its exact ID, and **Apply configuration**. Root URLs without `/v1` also work. Only literal loopback HTTP hosts are accepted; redirects and cloud model tags are rejected. The adapter uses streamed `/v1/chat/completions`, JSON output, token/time limits and no tools. Protocol references: [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility), [LM Studio structured output](https://lmstudio.ai/docs/developer/openai-compat/structured-output). Ollama's `reasoning_effort: none` disables optional thinking for this short text-processing task.

Configuration is session-local. Launcher defaults can be set with `TORN_VEIL_LLM_BASE_URL`, `TORN_VEIL_LLM_MODEL` and `TORN_VEIL_OBSERVATORY_PORT`. The UI exposes timeout and token limit; the shared client also supports temperature and concurrency (1 or 2). Default concurrency is 1, with at most 8 waiting requests. Each active request has a timeout, a 1 MiB streaming-wire bound and a 16 KiB content bound. Cancellation removes queued requests and aborts active transport. It does not undo an already accepted canonical action.

If the endpoint or model is missing, the app shows setup guidance and uses deterministic fallback. Unchecking **Enable language processor** tests this without stopping another application. No per-NPC/per-tick model calls occur.

## Free text and thoughts

For a reproducible first conversation, create **Rumor / testimony**, select **Edda Ironhand**, and speak as the nearby **Garrick Ironhand**. Ask “What did you hear about the old road?” The response preserves hearsay and uncertainty. Ask “Who are you?” to exercise ordinary introduction. Disable the model and repeat. **Express current thought** is a read-only expression of that person's current needs/goal, with no new memory or event.

**Speak as** borrows an existing nearby person for this isolated developer interaction; it does not spawn or teleport a privileged player. Dead, sleeping, distant, obstructed and unwilling partners are rejected by canonical conversation mechanics. The regular web game's menus remain intact; free text is currently exposed in the Observatory, not added to the web HUD or Unreal.

The parser receives player text, a small intent set, and a bounded set of that speaker's existing knowledge references. `offer_information` must reference one of those facts. Arbitrary new testimony, item transfers, threats and help requests that require a further ordinary action are refused rather than inventing a new mechanic. Questions use the NPC's own beliefs; `Simulation.tell` owns knowledge transfer, provenance, trust effects and social consequences. Greeting uses ordinary introduction; apology uses the existing dialogue option.

The response model receives a detached allowlist from **one mind**, plus the adjudicated reply choices. It never receives World, other minds, canonical event payloads, developer names for unknown people, filesystem access or tools. Raw legacy memory prose is omitted because it may have been formatted using developer names. Unsupported knowledge shapes are omitted and listed in the developer exclusion panel; this is intentionally incomplete linguistic coverage.

The present expression contract is deliberately constrained: the model selects among reviewed, grounded natural-language realizations, including tone variants. **Arbitrary paraphrases are rejected**, even when they cite valid knowledge IDs. Checking a claim ID alone cannot establish that every clause of generated prose is supported. Speech, topics, intent, reference IDs and confidence all validate against the supplied choices. Malformed output gets exactly one repair, then fallback. No generated wording is saved into World or used to replace canonical memory. Debug panels display raw rejected output as escaped text, separately from accepted speech.

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

Measured on this machine with Ollama and the installed Qwen 3 8B, while regression tests also ran: three parse-plus-response samples took **1.83 s, 7.82 s and 3.26 s**, all accepted without fallback. They covered introduction, uncertain hearsay and an unsupported/injection question, which correctly returned that the person did not know. Response-stage first-content latency was **0.070 s, 3.528 s and 0.494 s**; full response stages were **0.657 s, 5.696 s and 1.190 s**. Three simultaneous NPC thought requests used one active slot and two queued slots, finished in **7.08 s**, and waited **0, 3,253 and 3,934 ms** before transport. All three validated. These are small samples, not percentile guarantees. A real-browser request with colder context took **22.12 s**; loading and machine contention matter.

Ollama reported **6,261,959,556 bytes** allocated for the model, all on GPU, with a 16,384-token backend context. The model runner working set was about **6.67 GB**. The latest benchmark's Node process used **81.8 MB RSS**, separate from that backend; system free RAM was **4.44 GB**. The system CPU busy fraction during the benchmark was **32.7%**, including other active applications. GPU adapter usage likewise includes other applications; the backend allocation is the useful model-specific number. LM Studio's actual model execution has not been benchmarked in this task.

| Requested area | Status | Evidence / remaining limit |
| --- | --- | --- |
| Simulation observability | VERIFIED | Browser selection, detached inspectors, stepping, source drill-downs; coverage limits above |
| Causal explanation | PARTIAL | Stored graph and real acquisition/adoption links verified; missing causes remain unknown |
| Economy observation | PARTIAL | Live stock, households, derived vacant posts, retained economic events; no full material audit |
| Knowledge observation | VERIFIED | Explicit belief/truth separation, confidence/source/hops, privacy and opposing-belief tests |
| Scenario lab | VERIFIED | 15 reproducible setups; browser creation/advance/restore; long-run findings reported separately |
| Determinism | PARTIAL | Independent seeded setup and bounded full-state replay/continuation; not a universal proof |
| Local LLM | VERIFIED | Real local Ollama 8B responses; LM Studio execution unverified |
| Free-text dialogue | PARTIAL | Grounded questions, existing testimony and introduction; limited intent/claim coverage; Observatory only |
| Performance | PARTIAL | TTFT, latency, model allocation, working set, CPU and queue samples; no sustained concurrent-NPC load claim |
| Security | VERIFIED | Loopback/token/origin/size limits, strict schema/wording, no tools, injection and unknown-mind tests |
| Fallback mode | VERIFIED | Disabled/offline/malformed responses; real browser conversation and canonical-state equivalence tests |

No acceptance label in this table certifies the simulation as a whole. See the final handoff for the exact regression and long-run results from this development session.
