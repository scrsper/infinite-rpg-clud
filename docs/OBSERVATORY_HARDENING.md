> Historical milestone report. Its local-model integration and measurements are superseded by [deterministic dialogue](DETERMINISTIC_DIALOGUE.md); no model is used by current gameplay or Observatory.

# Observatory integrity investigation

The original RED investigation and bounded validation are complete. Overall integrity remains **AMBER**: the original findings are explained, confirmed simulation defects are repaired, and incomplete evidence and performance warnings remain visible. All runs use disposable development worlds. Live, staging, web gameplay presentation, Unreal, and model capabilities were not modified.

## Final handoff

Launch **`Torn Veil Observatory.cmd`** from `C:\Users\green\Desktop\projects\torn-veil-online`.
The delivered launcher was executed; its new server is at **http://127.0.0.1:7481** with the
reviewed day-30 world loaded **paused**. The older port-7480 process was preserved. A future
launch chooses the appropriate free port. In **30-day integrity investigation**, use
**Original RED evidence**, **Repaired run evidence**, **Inspect repaired saved world**, and
**Reproduce 30-day validation**. The reproduction is **ordinary / seed 918271 / 30 days**,
scenario version **2**, save schema **25**. Version 2 records terrain edits from initialization;
the preserved original scenario and receipts remain available separately.

| Original finding | Final classification, repair and evidence |
| --- | --- |
| Stuck behavior | **A — simulation defect.** Escape chose disconnected roof floors and retried failed destinations. Reachability and remembered failure now constrain ordinary planning. Exact Aldous receipts and failing-before regressions are preserved; no stuck-path groups occur in the accepted three-seed matrix. |
| Goal churn | **A — simulation defect.** Turning away from a threat erased the assessment of an unfinished escape; later review found the same proposal/attempt confusion in ordinary needs. Finite attempts retain their grounded assessment, with stronger needs and immediate danger still able to interrupt. Original actor timelines and focused regressions support the repair. Other rate leads remain class F. |
| Repeated events | **A — simulation defect.** Case identity was omitted, allowing handled investigation/confrontation plans to complete repeatedly. Case identity, actual action success and retry evidence now govern progress; additional reporting, delivery and hunting loops found during review were repaired at their shared layers. No configured hard loop or duplicate event-identity failures occur in the accepted matrix. |
| Slow step | **B — performance defect.** Measured compaction dominates the offending step. Scoped traversal/index reuse preserves exact outcomes in controlled comparisons, but the unchanged 100 ms maximum budget is still exceeded in some final trials. Remains AMBER. |
| Food pressure | **D — legitimate emergent hardship.** Both original and repaired edible-unit ledgers close with zero unexplained loss. Actual labor, processing, access, affordability and interruption evidence is detailed below. This does not certify every economic decision or a full calorie/mass balance. |
| Injuries | **D — implemented combat outcome.** All original five bodies have physical contact and action-parent receipts; care and HP recovery use ordinary mechanics. Independent reconstruction of every swept trajectory and regional-wound mending remain outside the verified scope. |

| Primary day-30 measure | Original | Repaired |
| --- | ---: | ---: |
| People alive | 33 | 33 |
| Edible stock, starting at 377 | 47 | 107 |
| Pressured households (hunger or thirst) | 14 | 14 |
| Bodies below maximum HP | 5 | 0 |
| Emitted events during the run | 783,572 | 482,373 |
| Instrumented step median / p95 / max, ms | 2.242 / 10.683 / 180.243 | 2.353 / 10.329 / 185.148 |

Different repaired histories and observer overhead make the last row descriptive, not a
controlled speedup claim. Controlled compaction-only comparisons and final quiet trials are
reported below. Hardship and event counts are outcomes, not integrity pass criteria.

Seeds **918271, 918272 and 918273** completed 30 days with retained day-1 and day-7 checkpoints,
**720 hourly samples each**, zero configured hard failures and balanced edible-unit ledgers.
The independent primary replay has **zero value or property-order differences** at days 1,
7 and 30. Saving at day 15 and continuing after reload has **zero canonical value differences**;
four optional concern-field order differences are preserved and individually reviewed as class C.
The source scope and every raw difference are retained, rather than normalized away.

| Requested status | Verdict | Evidence scope / remaining limit |
| --- | --- | --- |
| SIMULATION INTEGRITY | PARTIAL | All configured hard checks pass across the nine horizons; unclassified leads and coverage gaps remain. |
| DETERMINISM | VERIFIED | Independent same-input 30-day replay; all saved values and property order match at days 1, 7 and 30, excluding only envelope `savedAt`. |
| SAVE/LOAD | VERIFIED | New-save day-15 reload plus 15 days matches every canonical value; four nonsemantic field-order differences disclosed. Legacy missing metadata is best-effort. |
| ECONOMY CAUSALITY | PARTIAL | Exact edible-unit balances and workplace/household receipts; incomplete full-material and unavailable-offer accounting. |
| NPC DECISION-MAKING | PARTIAL | Confirmed shared-planning/retry defects repaired and regression-tested; remaining worst-window leads are class F. |
| KNOWLEDGE | PARTIAL | Focused provenance/acquisition checks and negative-evidence repairs; not an exhaustive audit of legacy epistemology. |
| SOCIAL CAUSALITY | PARTIAL | Stored causes and reporting/action receipts checked; interpretation of lawful violence remains imperfect. |
| EVENT HEALTH | PARTIAL | No duplicate identities or configured hard loops; activity-rate leads remain visible and historical compaction limits inspection. |
| PERFORMANCE | PARTIAL | Exact hotspot identified and scoped optimization equivalence verified; maximum-step budget not consistently met. |
| LOCAL LLM ISOLATION | VERIFIED | Real qwen3:8b, disabled and offline runs have identical mechanics; expression changes no saved field/event, and existing injection/privacy/fallback regressions pass. |

These verdicts apply to the recorded scenarios, inputs and source, not every possible world.
Normal regression coverage is **1,413 tests / 162 files** through the full invocation plus
the complete rerun of its sole failing file after an evidence-backed fixture correction.
Build, typecheck and browser hardening acceptance pass. Screenshots were visually inspected,
including the actual launcher server's paused world and expanded ledger.

Start with [final-verification.json](evidence/observatory-hardening/final-verification.json),
[validation-summary.json](evidence/observatory-hardening/validation-summary.json), and
[remaining-leads.json](evidence/observatory-hardening/remaining-leads.json). Full emission-time
receipts, checkpoints, profiles and failed/intermediate investigations remain under
`D:/TornVeilValidation/observatory-hardening-20260930`; browser subsets remain in
`.debug/observatory-hardening`. No food was injected, thresholds weakened, events suppressed,
or actor-specific recovery scripts added. Changes are committed locally; no push or merge.

## Preserved baseline

The authoritative checkout is `C:\Users\green\Desktop\projects\torn-veil-online`, remote `https://github.com/scrsper/torn-veil-online.git`, branch `codex/observatory-local-language`.

The initial HEAD was `9bb0b909a001888ed1ebc1164e1356789d3805b0`. The previously completed Observatory/local-language implementation and documentation were uncommitted. They were preserved in local commits `e59b7da` and `633a5d2`, respectively. Nothing was reset, discarded, merged, or pushed.

The complete initial dirty-file list, scenario hash and original-evidence hash are in `.debug/observatory-hardening/baseline/manifest.json`, also checked in as `docs/evidence/observatory-hardening/initial-state.json`. The original report is copied to `baseline/original-red.json` and the evidence directory, alongside preserved baseline copies of both detector implementations. Save schema is 25. The original ordinary scenario had no explicit version; its SHA-256 is `586072A2DC93985899A9F69C172AF23F8B7BD120C547EEB864DA5C39258B6B98`.

Exact initial conditions: `ordinary`, seed **918271**, 30 days, fixed **0.15 physical seconds** per step, 60:1 clock, 288,000 steps, world tick **8666400 → 11258400**. Rate detectors use a **10,800 world-second** window, at most 20 related event IDs, and hourly health samples. The performance budget is 100 ms per fixed step.

Unchanged rate triggers: **5** path failures per actor, **40** goal changes per actor, and **30** events with the same `(type, actor, target)` signature in that window, subject to the original detector's existing routine-event exclusions. Detector source copies are preserved with the baseline. New progress checks examine actual state/identity, rather than changing these thresholds.

The original report records 33 people alive before and after, food **377 → 47**, **14** households under pressure, and **5** bodies below maximum health. Pressure means any member's hunger **or thirst** exceeds 0.7. Food sums edible item units of different types; it is not a calorie measure. Retained event counts are not lifetime activity because the log is compacted.

Original final RED findings:

| Detector | Entity | Occurrences | First / last world tick |
| --- | --- | ---: | --- |
| Stuck path | p_11, Father Aldous | 12 | 11256105 / 11258382 |
| Goal churn | p_20, Jory Fletcher | 42 | 11250021 / 11258319 |
| Goal churn | p_5, Mara Bramble | 43 | 11250084 / 11258130 |
| Goal churn | p_18, Greta Hollis | 53 | 11250093 / 11258031 |
| Repeated `goal_completed` | p_14, Hale Dorn | 170 | 11251866 / 11258400 |
| Repeated `goal_completed` | p_13, Rowan Ashford | 75 | 11256582 / 11258400 |
| Slow step | final measured step | 130.46 ms | 11258400 |

These are the exact final RED records, not the first time each actor crossed a threshold.
The full hourly archive first flags Hale's completion signature at 8688000, Rowan's at
8760000, Mara's churn at 8803200, Jory's at 9048000, Greta's at 9195600, and Aldous's
path failures at 9224400. Respectively they recur in 53, 10, 148, 84, 104, and 65 hourly
samples. Earlier isolated evidence includes Aldous's unreachable roof at tick 8774859
(`e_31330`, destination height 22 from floor 14). The earliest repeatedly completed case
adoptions in the captured history begin with Hale's `e_3633` at 8676165 (case `ev:e_3429`,
12 completions) and Rowan's `e_20732` at 8753232 (case `ev:e_7837`, 2 completions).
The hourly finding selector exposes the complete worst window for each signature; first
sample time is explicitly sampling evidence, not an invented causal onset.

## Evidence capture

`scripts/observatory/audit.ts` uses the same scenario and stepping function. Its event listener archives emission-time receipts, decision/plan snapshots, material receipts, hourly health and state, timings, and compressed canonical saves at days 1, 7, 15, 29.875, and 30. It never supplies evidence or instructions to simulated minds. Later additions to an event's `perceivedBy` and `effects` are preserved in canonical saves; the receipt explicitly represents emission time.

The instrumented first 960 steps and an uninstrumented run both produced full canonical SHA-256 `4bdf6222df66dc8319ca56e2a554e7aec09cc5efca94d604fa4d30c6f754a33a`. Only the save envelope's wall-clock `savedAt` is excluded. Array order, execution phases, RNG state, and all other persisted fields are compared. The day-7 save also has zero differences on immediate restore; that does **not** establish long continuation equivalence.

The unchanged 30-day replay is recorded under `.debug/observatory-hardening/baseline/replay-918271`. `extract-audit.ts` builds evidence grouped by actor, signature, case, workplace, and household; `profile-summary.mjs` summarizes the V8 CPU profile. Instrumented timings include observer cost and must be distinguished from uninstrumented benchmarks.

The browser-required baseline evidence and final save remain at that path. During final
verification, eleven bulky raw/checkpoint files (237,148,705 bytes) were moved to
`D:/TornVeilValidation/observatory-hardening-20260930/baseline-bulk` to preserve system-drive
headroom. Every file's SHA-256 was checked before and after the move; none was discarded.
Exact old/new locations and hashes are in `docs/evidence/observatory-hardening/baseline-relocation.json`.

Four focused regression tests in `tests/observatory-root-causes.test.ts` fail on the preserved implementation: restarting a handled investigation or confrontation when another case shares its key; abandoning an unfinished escape when the threat is no longer perceived; and selecting a disconnected roof for escape. The failure log is `baseline/root-causes-before.log`.

## Reproduction completed before simulation edits

The 30-day replay exactly matches all original final detector records, including entity IDs, counts, first/last ticks, and related event IDs. All original outcome counts match. It archived **783,572 new events** before compaction. Final canonical digest: `e808d0e0ce8abce6a0bdbf627dbb425619607a8b62b8d92d5f42c7fe72d49fee`.

The edible-unit ledger closes exactly: **377 + 774 production − 981 consumption − 113 spoilage − 10 edible inputs transformed = 47**. Internal purchases, hauling, theft, and household deposits transfer existing stock and net to zero globally. There are no external imports/exports in this fixture. Grain and flour are separate stocks, not counted as edible meals. This accounting does not establish a calorie balance or an adequate economy.

The original rate thresholds are unchanged. Each original finding now has archived event IDs, times, occurrence counts, actor needs, candidate utilities/reasons, goal, plan, physical position, relevant evidence, and stored causal parents in `final.evidence.json` and the full receipts.

| Finding | Classification before repairs | Observed cause |
| --- | --- | --- |
| Stuck Father Aldous | A — genuine simulation defect | The same escape attempted every 99 world seconds. First two failures target (116.5,20,110.5); the next ten target (88.5,17,101.5), from ground height 14. The escape heuristic accepts a walkable roof/counter column without requiring an approachable floor. Failed plans rebuild the same destination. |
| Churn: Jory, Mara, Greta | A — genuine simulation defect | Fear of perceived Hale Dorn competes with meals, work, or worship. Turning to flee removes Hale from the facing cone, removes the candidate, and drops current utility to zero. The actor reverses; seeing Hale again restarts flight. The trace contains exact alternating positions, percept sets, and utilities, not merely similar utility scores. |
| Repeated completions: Hale, Rowan | A — genuine simulation defect | Investigation identity contains place/type but not the case. Other unresolved cases keep the same candidate key present after the old case is investigated; the old completed plan is rebuilt. The same error also reproduces for confrontations about different accusations against one person. |
| Slow final step | B — performance defect | Hourly event compaction dominates the actual offending step: a focused replay measured 136.89 ms of a 150.81 ms step in compaction, versus 5.04 ms perception, 1.23 ms thinking, and 7.28 ms strategic upkeep. Full-run sampling also identifies knowledge pruning as the largest individual cumulative cost. These are different performance questions. |
| Food pressure | D — emergent hardship, with contributing decision defects | Stocks decline through recorded production, consumption, transformations, and spoilage. No unexplained loss exists. Distribution/processing, fear-driven interruptions, and incomplete economic mechanisms require separate discussion; scarcity is not itself an invariant failure. |
| Five injured bodies | D — injury through implemented combat | All five have actual hit receipts with attacker/target body IDs, contact positions, distance/reach, action parents, and damage. Decision defects may contribute to the fights; injury and its physical causality are separate from those defects. |

Instrumented whole-run timings: median 2.242 ms, p95 10.683 ms, maximum 180.243 ms; event observation itself cost 9.212 seconds across the run. These are not the uninstrumented comparison. `baseline/step-before.json` contains three uninstrumented trials over the same final-three-hour checkpoint.

Additional save/load defect found in the baseline: restoring the day-29.875 checkpoint and continuing three hours reproduces the same world mechanics but yields **23 persisted differences**, all in `execution.lastTopic` (cached concern intensity and situation history). Those objects retain live references during continuous execution but become detached JSON copies on load. They were not normalized away. Full differences are preserved in `baseline/continuation-diff.json.gz`; the repair and completed long-horizon verification are recorded below.

## Repairs and their evidence

Goal identity now includes the underlying evidence key for investigations, reports, and confrontations. A new accusation at the same place or against the same person cannot restart an old handled case. Escape destinations must have a navigable path from the actor's actual height; the existing eight-direction search tries another destination when a roof is disconnected. An unfinished escape retains its last grounded utility when turning away removes the threat from view. This commitment ends with that finite plan (travel plus the existing 180-second hiding action); stronger competing goals still use the shared selection rules. No actor-specific recovery code, extra knowledge, food, or utility bonus was added.

Execution snapshots now record which cached conversation-topic fields actually alias canonical knowledge, concerns, and situations. Restoring reconnects only those links; detached older evidence stays detached. The optional `lastTopicLinks` field preserves schema-25 compatibility. Legacy snapshots lack identity metadata, so their restoration uses matching IDs and equal content as a best-effort inference; new-save continuation is tested independently below.

Reviewing every hourly alert exposed an additional class-A delivery loop in the first repaired run: Dunstan completed `provide` **515 times** in an early interval without transferring the carried bread. At tick 8727402 he was at (111.938,14,98.062), while Hale was roughly 84 metres away. `give` marked itself done even when out of reach; this falsely refreshed pursuit progress. Splitting the original bread stack also retargeted the action but left the goal/commitment pointing at the source stack. Receipts are preserved in `D:/TornVeilValidation/observatory-hardening-20260930/provide-before.json`; the first attempted repaired run remains under `repaired-918271`, not acceptance evidence.

Handoffs now fail when no physical transfer is possible. Failed pickups invalidate dependent steps; plan completion requires every step to succeed. A failed handoff records a local observation and abandonment reason, and an unsuccessful search refutes only the searched location belief. It neither discovers the recipient's remote position nor erases a newer location learned elsewhere. Known homes come from the actor's prior knowledge. A fresh sighting can enable another attempt without a new cooldown. The existing pursuit attempt/no-progress mechanism receives failures honestly. Split stack IDs update the action, goal and commitment together; successful delivery retires that finite errand. Five delivery tests cover these semantics, including conservation and newer evidence. The broader focused verification passes 78 tests across eight files.

The normal regression also exposed a class-E setup defect in the existing family trace (seed 606060): the selected spouse was sleeping, so the promised immediate report never arrived. Both `tell` return values were ignored. The spouse later heard different news, checked once, and found the injured person recovered; that coherent history did not satisfy the fixture's required multi-step example. The fixture now selects awake, available participants and asserts both canonical reports actually succeed. The original outcome assertions, seed, damage, observation duration, resources and autonomous decisions are unchanged. The focused family acceptance now passes; its before trace and after test log are in the external evidence directory.

Every-hour review of the next 30-day iteration (`repaired-final-918271`, preserved as intermediate evidence despite its old directory name) found further defects that a final snapshot missed:

* **A — terminal attack re-selection.** The Traveler and Bors each completed attack 601 times in a three-hour window. A restored checkpoint captured the Traveler's same attack on Vex completing at 8878494, 8878512 and 8878530 with unchanged conflict `cf_111`, five blows, and Vex's defeat recorded at 8878476. Selection treated a recovered pose as a fresh threat while execution correctly stopped at the recorded defeat. Selection now respects the participant's recorded victory; fresh observed aggression still permits self-defense. The diagnostic tests the same downing record being completed repeatedly, not merely a high attack rate.
* **A — wariness erased ordinary candidates.** Maud switched water/shelter 110 times and Cedric haul/shelter 109 times in their worst three-hour windows. A familiar person's fear in the gap between threat detection (>0.25) and a fight/flight response (>0.35) removed water and labor candidates while offering no emergency response. Losing sight of that person reinstated the candidates. Ordinary wariness now remains an avoidance influence; it no longer suppresses those candidates as immediate danger. Rain, thirst, utility thresholds and resource amounts are unchanged.
* **A — failed reporting paths bypassed retry accounting.** Ione had 29 path failures and Greta 17 in their worst windows. Failure terminated the path and tell actions, but rebuilding the same goal never called `noteReportFailed`. Path failures now record the existing report attempt exactly once. Seeing the same distant unreachable guard does not erase backoff; a guard within speaking reach can reopen the report. Report travel uses witnessed/remembered positions or a known guardhouse, rather than following an unseen body's live coordinates. Shared escape planning uses the same knowledge-supported guard lookup.
* **E — fresh scenario omitted terrain recording.** The intermediate continuous day-30 save and day-15 reload/continuation differ in 274 terrain-edit entries and no other saved fields. Fresh Observatory worlds had `grid.recording=false`; loading correctly enabled it. Scenario version 2 enables recording immediately after generation, without altering the generated world, food, or decisions. This is corrected setup, not normalization of divergent saves. The prior comparison remains in `D:/TornVeilValidation/observatory-hardening-20260930/final/continuation-diff.json.gz`.

Three new progress tests fail before these decision repairs and pass afterward. A fourth asserts terrain recording and round-trip edits; another preserves reporting failure evidence and proves hidden guard movement cannot retarget a report. The original robbery recovery regression also depended on a healthy victim being caught within a fixed 90 seconds; reachable escape can prevent that premise. Its revised fixture begins with an injured resisting victim, requires a real canonical downing, then observes 90 seconds after that outcome. Theft and zero post-theft reattacks remain mandatory. No autonomous validation world receives that fixture adjustment.

Compaction uses one scoped reference-traversal set, removes only discarded IDs from the event index, and rebuilds effect links without repeatedly scanning a parent's growing effect list. No global mutable cache or retention-policy change was introduced. All twelve alternating isolated compaction trials produce the same final canonical hash `30a895f37fad4be110ba28fc024a92f116c0c26f494401e12d09053515113acb`. Baseline compaction times: 115.653, 118.908, 137.787, 111.855, 111.959, 112.537 ms. Revised: 114.991, 99.780, 103.472, 97.914, 100.992, 105.272 ms. The isolated improvement does **not** establish compliance with the 100 ms whole-step budget.

Three complete uninstrumented final-three-hour trials, before/after the compaction-only change, also match exactly: final hash `08f4742073ec16dec1f785994878d9b0e4fae9aa1af5080b91922eff57165130`. Per-trial median/p95/max (ms):

| Trial | Before | After |
| --- | --- | --- |
| 1 | 3.658 / 9.427 / 121.236 | 3.664 / 9.409 / 140.303 |
| 2 | 3.153 / 8.588 / 122.571 | 3.204 / 8.208 / 129.933 |
| 3 | 2.879 / 8.010 / 120.122 | 2.898 / 7.851 / 121.902 |

Whole-step maximums remain noisy and over budget. Performance is AMBER, not a claimed overall speedup. These equivalence artifacts predate the intentional decision changes; different histories after those repairs are expected.

The baseline's largest measured step (tick 11107200) took 180.243 ms with 1,598 entities, 53,671 retained events and 14,205 knowledge records; 161.711 ms was compaction. Across the complete run the existing measured buckets total 434.982 s perception, 404.777 s deliberation, 91.520 s actions, 43.257 s strategic upkeep, 37.446 s compaction, 9.133 s creatures/ecology and 2.556 s body physics. Strategic sub-buckets overlap that total: conflict 29.828 s, person upkeep 9.474 s, metabolism 2.347 s and weather 1.555 s. The navigator handled 166,893 calls in 16.261 s. Counts and per-step contributions are stored with the fifty slowest steps.

V8 statistical samples supplement these coarse buckets: `genealogyGoals` 7.070 s inclusive, `evolveRelationships` 0.965 s, `observeProduction` 3.642 s, `productionWorkGoals` 0.584 s, `generateLogisticsNeeds` 0.258 s and `pickHaulTask` 0.353 s. Inclusive CPU samples overlap and are not additive wall-time measurements. Snapshot stringification accounts for 2.352 s inclusive CPU samples; validation saves are written outside the measured simulation step. The full function table is `baseline/replay.cpuprofile.summary.json`. These measurements ruled out genealogy, logistics and persistence as the cause of the specific offending step; they do not imply those systems cost nothing.

## Original economy: production, labor, access

The final evidence and `final.analysis.json` retain each producer's output receipts, staff skills/physiology, final inputs, blocked batches, goal residence hours, household food beliefs, and last actual failed meal event. Goal residence is time assigned to a goal, **not** productive labor time.

| Producer | Recorded output in 30 days | Input / observed limitation |
| --- | --- | --- |
| Bramble's Bakery, Osric | 44 batches, 220 bread | 88 flour consumed; one flour-blocked batch |
| Bramble's Bakery, Mara | 39 batches, 195 bread | 78 flour consumed; final hunger/escape churn interrupts access and labor |
| Old mill, Hobb | 44 batches, 176 flour | 132 grain consumed; final mill stock still has 42 grain and 9 flour |
| Gilded Boar, Hilda/Bram/Ysolde | 5 batches, 15 stew | 10 meat consumed; 90 meat-blocked work events across the tavern staff |
| Gilded Boar, Hilda/Bram | 49 batches, 294 ale | 147 grain consumed; ale is included in the existing edible-unit category |
| Northern forest, Kestrel/Ysolde | 6 extractions, 14 meat | Finite game-node extraction; Kestrel spends 363.84 hours with attack selected |
| River woods, Old Wyn | 9 extractions, 36 herbs | Herbs are included in the existing edible-unit category |

The bakery ends with **24 flour physically on site** but no unheld bread stock there. Upstream supply is therefore not the complete explanation. Osric has work selected for 17.46 hours and flight for 111.45 hours; Mara 7.60 work hours and 124.42 flight hours. Hobb has 47.48 work hours and 91.57 flight hours. Food production is below consumption: 25.8 edible units/day produced versus 32.7 consumed, before spoilage and transformation inputs. This describes implemented units, not human nutritional adequacy.

There are 370 harvest receipts, 172 plant receipts, and 180 crop-maturation receipts. Weather drives soil moisture and growth in `world/metabolism.ts`; wheat's configured growth horizon is six weeks. The run's accumulated grain and remaining flour rule out a blanket claim that bad weather exhausted all agricultural inputs. The evidence does not assign every missed productive minute to weather, tool condition, machine condition, skill, fear, or fatigue; those counterfactual shares are **not represented**. Staff skills and physical state are archived, and successful batches provide actual input/output quantities. No missing tool/machine is invented as a cause.

Transport is active: 201 haul requests, 220 starts (including retries), 192 pickups, and 171 deliveries. Canonical delivered-unit tallies include 284 grain, 156 flour, 270 bread, and 24 meat. Forty-eight failed hauls break down as: 12 unfunded buyers, 19 workers not returning, 11 sources running dry, 5 empty sources at collection, and 1 carrier unable to finish. Cargo is dropped/transferred by existing mechanics, not injected or erased by the investigator. Food transfers do not change the global ledger.

Actual meal failures: **3,383 unavailable offers** and **745 unaffordable offers**. `unavailable` does not distinguish every reason a seller has no offer (empty stock, reserved stock, refusal, or no suitable seller). That gap stays explicit. Repeated failure produces provenance-bearing food-access knowledge and the existing retry interval; the investigation does not equate every repeated visit with a bug.

Each of the fourteen pressured households has no immediately accessible food at the final sampled position. The following records combine actual failure receipts with final goals; a final goal alone is not proof of the cause of every earlier missed meal.

| Household | Concrete evidence |
| --- | --- |
| Ironhand house | Garrick is defending; Edda sleeps. 66 unavailable attempts and 1 unaffordable attempt across the two. Edda owns ale elsewhere; ownership does not confer remote access. |
| Bramble bakery | Osric sleeps, Mara is walking to eat, injured Tomas rests at home. 50 unavailable attempts across the three. Mara and Tomas own food elsewhere. Mara's final escape/meal oscillation is the confirmed decision defect. |
| Gilded Boar | 207 unavailable and 68 unaffordable attempts. Household wealth is zero; Hilda/Bram/Ysolde individually end below 3 silver. Recorded offers sometimes cost 3. |
| Crane house | Pressure is Petra's thirst (0.776), not a household-wide food shortage. Wendel has hunger 0.352, owns 15 bread units elsewhere, and is socializing; Petra sleeps. |
| Chapel | Sister Ione flees, Fenn sleeps; 443 unavailable and 128 unaffordable attempts. Household wealth zero; both individually below 1 silver at the endpoint. |
| Captain Ashford | Rowan has 90 silver but is caught in the completed investigation loop. Last unavailable attempt `e_782757`, tick 11255718; money alone cannot supply a meal. |
| Guardhouse | Hale has 25 silver but repeats the handled case; last unavailable meal `e_782072`, tick 11253684. Dunstan and Brigid are in custody with held-state needs; Hale causes the pressure flag. |
| Hollis farmhouse | 536 unavailable and 146 unaffordable attempts. Household wealth zero; final individual balances about 1.06, 0.66, 0.60. Greta's escape/meal churn is independently confirmed. |
| Fletcher house | 655 unavailable and 199 unaffordable attempts. Household wealth zero. Jory/Tilly flee; Nell prays. Jory's escape/work/meal churn is independently confirmed. |
| Cedric's house | 63 unavailable and 6 unaffordable attempts; Cedric has 3.90 silver and an active eat action at the endpoint. Pressure is an observation during an attempted meal, not proof of a stuck action. |
| Maud's house | 242 unavailable and 96 unaffordable attempts. Maud has zero wealth and flees; Godwin has 1 silver and is walking to eat. |
| Kestrel's hut | Kestrel defends; Father Aldous is stuck on an unreachable escape destination. 214 unavailable and 38 unaffordable attempts; household wealth zero. |
| Bors's house | Bors has 20 silver but is defending/chasing; 11 unavailable attempts. Lack of money is not his immediate blocker. |
| Bandit camp | Skarn flees and Vex seeks water. They have 199/287 silver, but 207 unavailable meal attempts. Their known/visited sources and hostility/access matter; global stock is not remotely available. |

The aggregate decline is class D (legitimate material depletion). The named planning defects are class A contributors, not evidence that the original economy was entirely healthy. Incomplete breakdown of unavailable offers and unrecorded productive opportunity costs remain class F evidence gaps. No prosperity target or resource rebalance was introduced.

## Original injuries and care

All five low-health bodies were struck through canonical combat. The final damaging hits are retained, with action parents, body IDs and contact facts:

| Body / person | Final HP | Last hit / tick | Attacker | Body-origin distance / path reach |
| --- | ---: | --- | --- | --- |
| b_3 Tomas | 15.184 / 80 | e_781159 / 11240499 | Vex | 1.512 / 2.1 |
| b_13 Rowan | 73.489 / 110 | e_778892 / 11219358 | Maud | 0.844 / 0.9 |
| b_14 Hale | 102.798 / 110 | e_761426 / 11184528 | Tomas | 0.275 / 2.1 |
| b_15 Dunstan | 6.760 / 110 | e_753744 / 11171640 | Rowan | 1.348 / 2.9 |
| b_16 Brigid | 1 / 110 | e_752804 / 11171118 | Rowan | 1.709 / 2.9 |

The receipt auditor finds no duplicate event IDs, mismatched contact body identities, or missing action parents among all recorded hits. A naive center-distance test flags 70 other hits, but is not a valid collision invariant: actual strikes use swept weapon spheres against anatomical hurt volumes, including both bodies' motion; receipt center distance is measured at a step boundary. Those 70 are retained as diagnostic observations, not silently erased or claimed impossible. Full independent trajectory replay is not established.

Knowledge is localized. Tomas alone witnessed his last hit; Rowan's was seen by Rowan, Garrick and Kestrel. Hale's was seen by Hale, Mara, Cedric and Bors and heard by Rowan. Brigid later knows Hale's incident through Mara's testimony (`e_767524`), not direct world access. `final.analysis.json` records the exact acquisition sources for all five injuries. Private combat intent is intentionally absent from ordinary witnessed claims; witnesses can misinterpret lawful violence. Inferring justified arrests from socially available context remains incomplete; copying private intent into their minds would violate the knowledge boundary.

There are **1,319 ordinary heal completions across 47 caregiver/recipient pairs**. For example Tomas received care from Osric, Edda, Garrick, Aldous, Ione, Mara and Old Wyn during the run. These are existing proximity-gated `use` actions, not an Observatory repair script. Completion counts are not units of recovered health. Natural HP recovery follows current nutrition/sleep-adjusted physiology; Dunstan and Brigid's active custody suppresses natural recovery under the existing held-state rule. Their release ticks are 11430867 and 11430345, both after the endpoint. Functional regional injuries retain the strongest wound and have no implemented mending model; the five-body metric counts low HP, not every regional injury. These limitations remain visible.

## Additional seed review and progress semantics

The intermediate `accepted-918271` and `accepted/repaired-918272` directories are diagnostic
runs, not the final accepted revision. Every hourly detector sample was reviewed, not just the
last three hours. Seed 918272 exposed three more class A defects:

- Maud's preferred refuge was unreachable (111 failures in the worst three-hour window,
  ticks 10574481–10585173). The earlier escape repair checked alternate directions but omitted
  the preferred guard/home destination. Both now use the ordinary navigator; a cornered person
  can wait at the current location but cannot pretend a route exists.
- Cedric reported 130 plant completions while 129 attempts lacked seed in a three-hour window.
  A failed sowing action was marked done and taught no actionable shortage. It now fails and
  uses the existing `short:<place>:grain` evidence. Another sowing candidate needs observed
  replenishment or the worker's own successful harvest. Distant crop visibility does not reveal
  a seed bin. Harvested plots awaiting their existing rest period are not reported as fallow.
- Tomas and Bram each switched goals 108 times in a three-hour window, alternating provision
  errands with ordinary activities. Care steps ended at the existing wound-severity threshold,
  but care satisfaction required 90% HP. The shared threshold now governs both; seeing recovery
  updates dated, provenance-bearing evidence for the body actually seen and resolves that concern.
  An unseen body does not supply this observation. Old injury evidence no longer revives the errand.

The original seed also showed unfinished escapes switching between similarly feared people
at the think cadence. The existing utility hysteresis now protects that finite escape across
target changes; observed danger within eight metres of its destination still permits immediate
replanning. This uses the existing refuge safety distance and commitment cost, not a new cooldown.

Rapid report-to-report changes were separately checked. For example Bors reported distinct
cases `ev:e_49083`, `ev:e_49427`, `ev:e_49661`, `ev:e_50693`, and `ev:e_50908` to Hale.
Those are finite processing of different evidence, class C for the rate detector's implication
of pathological churn. They remain visible, and no event was suppressed.

The edible-item ledger also encountered a class C unit mismatch in a wildlife test world:
wildlife's `food_consumed` describes kilograms from a resource node, whereas a person's meal
removes an edible Item unit. The ledger now requires that actual item receipt. This changes
diagnostics only and leaves every consumption event visible. Ordinary has no wildlife intake,
so its original 377→47 balance is unchanged.

Regression tests cover failed sowing and observed replenishment, remote knowledge exclusion,
harvested-plot state, disconnected preferred refuge, equal-threat commitment and unsafe-refuge
preemption, and recovery on a seen body alongside an unseen injured body. The focused checkpoint
passed 66 tests across five files. The later `validated*` and `revision-5` runs are also
intermediate evidence: the complete hourly review below found additional problems. Their
directory names are not acceptance claims.

The eight-day metabolism regression subsequently passed all 19 assertions/tests with its original
seed, resources, duration, and production/consumption bounds. An intermediate revision had only
nine sowings and failed the unchanged `>10` assertion; that failure remains recorded.

Another fixture waited for an entire ten-unit haul even though its assertions concern progress
across multiple trips. In seed 5502 the weak worker delivered 2, 2, 3, and 2 units at ticks
8671485, 8675697, 8681052, and 8688090, then defended against bandits. The loop mistakenly allowed
ten **physical** hours (25 world-days) to pass while waiting for the last unit. It now checks the
same commitment, claimant, multiple deliveries, and conservation assertions as soon as the
required progress is present, with a ten-world-hour bound. No worker decisions or resources were
changed. The focused test passes; `haul-repro.json` preserves the actual interrupted order.

Two other fixtures now state their intended premises explicitly: the reporting witness travels
to the guard's known public post (the old off-post placement required hidden live-location
access), and the critical-need comparison uses fear 0.4, above the existing fight/flight response
threshold. Fear 0.3 is ordinary wariness and is separately tested to preserve water candidates.
Both retain their original causal/knowledge and need-override assertions. No ordinary scenario
was changed to satisfy a test.

### Complete-window findings after the fourth revision

The fourth revision of seed 918272 had no hard-check failures across 720 hourly samples, but
its 26 goal-churn groups still contained genuine defects. Ysolde repeatedly abandoned haul 94
(utility 1) for socializing (0.531) when Skarn entered view; her flee proposal was only 0.410.
Cedric alternated critical water (1) with shelter (0.775), Godwin provisioning (0.67) with
socializing (0.45), and badly injured Skarn going home (0.994) with wandering (0.55). Threat
awareness gated new routine candidates; the chooser then treated the unfinished current
candidate as worth zero. Looking away restored it. This is class A, not detector sensitivity.
The shared chooser now preserves the last assessed utility for that finite attempt under the
existing hysteresis rule. Physical prerequisite failures still end attempts, and winning
emergencies can interrupt. No new utility bonus or cooldown was added.

Seed 918273 exposed the same loss of commitment between **destinations for the same need**:
Old Wyn changed eat destinations 109 times in three hours, between the river woods and home.
At ticks 9624018 / 9624117 / 9624216 the utilities were 0.584 / 0.586 / 0.588. Nearby stock
entered and left the physical availability query as he moved, so the previous destination's
proposal vanished. The same finite-attempt rule now covers these changes too. Actual arrival
still has to establish availability; it does not preserve a remotely known stock quantity.

The third seed also had seven stuck groups (Vex, Brigid, Kestrel, Tomas, Bors, Garrick and
Dunstan), up to 111 failed routes per three hours. Their recorded positions cluster at the
raised ground near x=174, z=40, y=24; the well is x=94, z=96, y=14. They cannot walk the
requested route under the current navigator. Physical stranding and its movement origin need
separate interpretation; retrying the same failed route without using its evidence is class A.
A failed trip now creates dated self-knowledge of its origin, destination, reason and event.
Deliberation rechecks that attempted route through the existing navigator and excludes it
while it remains impossible from that origin. Moving or opening a route permits reconsideration.
If the ordinary idle trip to a public seat also failed, the same rest action can occur where
the body already stands. No actor is relocated and no destination is supplied by a recovery script.
Decision notes expose these rejected routes and their causal receipts. The regression tests
exercise both an unchanged enclosure and a subsequently opened exit.

The fourth revision's original seed had one strict save/load difference: `doors[21][1]`, voxel
1594895, changed from open to closed. It was present immediately after loading the day-15
checkpoint and remained at day 30; every other saved field matched. Reconstructing a completed
structure cleared its door after saved door states had been applied. Door restoration now
follows reconstruction. Immediate round-trip differences are zero, and a regression opens a
completed building's door before loading. That iteration still required a fresh continuation;
the completed final comparison is recorded below.

The new defeated-target detector itself had a class C false positive. In the fourth revision,
Bors completed an attack after Tomas's earlier recorded defeat at 9044400, then responded to
new aggression much later. For example Tomas struck Rowan at 9105582 (`e_141584`, canonical
action `action_993`); Bors saw him at 9105600 (`e_141710`), approached, stopped at 9105690
(`e_141761`), and reported that new case (`e_141764`). Three completions across separate
incidents do not prove the earlier 601-completion retry loop. The detector now includes the
distinct combat-action event actually observed at adoption. Reprocessing the same defeat with
the same evidence still fails; separate responses to fresh visible aggression remain visible.
No simulation combat event is filtered or suppressed.

The fifth revision revealed a second interruption issue in seed 918272: Bram alternated hauling
and fleeing every 99 world-seconds (for example 9260409–9260904). Hauling scored 0.92–0.96,
fleeing 0.74, with Hale 15.9 metres away. The categorical emergency override ignored those
scores, and ordinary work then interrupted the unfinished escape. Kestrel also alternated equal
attack targets at 10750809 / 10750908 / 10751007 before either approach could finish. Both are
class A. Distant fear now participates in the shared utility comparison; immediate proximity
uses the already existing eight-metre refuge safety boundary. An unfinished finite escape
retains ordinary commitment against resuming work, while severe physiological needs and new
emergencies may compete. Equal combat targets retain the same approach unless a new immediate
attacker or a stronger competing priority justifies interruption. Focused regressions cover
each side of those boundaries; 48 tests across seven files passed at this checkpoint.

The first seven days of revision 7 exposed a refuge-selection defect, not a reason to raise
the churn threshold. For example Wendel fled Dunstan at 8698863 toward Hale's remembered
position (130.076,14,88.924), then saw Hale at 8698962 and reversed toward Dunstan's previous
position (144.795,14,102.056). The actor's existing social evidence warned about both people,
but the refuge rule assumed any other watchman was safe. Similar actors alternated these
destinations up to 109 times per three hours. The planner now excludes feared watchmen using
the same existing fear/caution evidence and tests candidate refuge positions against perceived
or remembered dangers. Unknown people and unobserved live locations supply no new evidence.
The shared escape sampler still uses the ordinary navigator. A one-day seed-918272 reproduction
then had no hard failures and one remaining rate alert (44 mixed food/water/escape changes),
instead of the repeated reversals. The complete final run still requires review.

Positional action destinations are now copied when a plan is built. Moving-target actions
continue to use their explicit `targetEntity`. A hidden alias to a live `Body.pos` is neither
a durable destination nor something JSON save/load can preserve. The local-rest and escape
regressions verify that their targets do not alias the body position.

The boar-retreat regression also exposed an execution-condition issue: generating the whole
playable region took 6.43 seconds against that test's unchanged five-second limit during audit
load. The test only exercises one embodied boar's retreat→warn transition. It now uses the
ordinary BridgeSession world, which initializes the same wildlife mechanics, with the same
seed, warning-distance setup, and all original assertions. No timeout or assertion was relaxed.

Local hardening commits so far: `83ef63b` preserves the measured compaction improvement;
`5b21c5e` preserves simulation progress, continuity, diagnostics and focused regressions.
No push or merge occurred. Revisions 8 and 9 were interrupted after new concrete defects
appeared in their seven-day reviews; their partial receipts and process manifests remain.

Revision 8 exposed another class-A escape loop: Ione switched between Tomas and Kestrel every
99 world seconds at 8699169–8705406, walking between approximately (139.6,14,94.5) and
(146.4,14,93.5). Kestrel's threat assessment included observed faction opposition, while the
refuge's relationship-only filter did not. Turning away removed that percept and its danger
from the next plan. An unfinished escape now carries its observed danger positions in the
existing action parameters. New sightings update those positions; unseen live bodies do not.
That scratch context ends with the finite escape. The regression moves the unseen person and
checks that the planner still uses the recorded observation, then checks context retirement.
Ione no longer produces a churn group in the first seven days of revision 9.

Revision 9 exposed a class-A negative-location boundary defect. Wyn made 288 goal adoptions
in the worst window 8943762–8949009, repeatedly failing to give the same bread `i_420` to
Dunstan. His older searched center (95.591,14,118.556) was outside 3.5 metres of the believed
home (96,14,115). The new search at (96.495,14,115.458) covered that home, but was within
3.5 metres of the old search, so proximity deduplication discarded it. Each retry correctly
failed and incremented pursuit attempts, but reused the same unrefuted home until the slower
no-progress backstop acted. Distinct search centers are now retained; overlapping areas do
not imply identical coverage. The receipt source is still the actual failed handoff, with no
remote position learned. A focused boundary regression covers this exact geometry and checks
that identical observations remain deduplicated. The reproduction with before/after knowledge,
plans and pursuit attempts is `revision-9/handoff-retry-before.json` in the external archive.
Current focused verification: 46 tests across four files and TypeScript typecheck pass.

The later seed-918273 review in revision 10 found a different class-A failed-delivery cause.
Mara's worst window had 430 adoptions at ticks 9919290–9928812; purpose `pu_5232` eventually
recorded 1,157 attempts without progress. At (135.500,14,105.315) she repeatedly held ale
`i_1094` and attempted to hand it to absent Tomas. Her new negative `loc:p_3` observation was
evicted beneath hundreds of older relationship/crime episodes, leaving the prior home address
available again. The memory-pressure regression fails before the repair and passes after it.
Spatial evidence referenced by the current goal or an active/deferred purpose now receives the
existing practical retention tier. A scoped set is built once per prune; the 400+40 memory bound
is unchanged. Ending the purpose removes that special relevance, as the regression verifies.
This retains the actor's own evidence; it never learns a remote position. Negative-location
descriptions also state that the person was not found, instead of displaying nonexistent coordinates.

The Observatory now makes five autonomous failed handoffs within the existing three-hour window
RED when item holder, actor position, destination and recipient-location evidence are unchanged.
Actual transfers or changed spatial evidence reset that sequence. This check observes the emitted
failures; it does not filter events or feed information back to minds. Its regression reproduces
the broken selector forgetting its search repeatedly and confirms all five failures remain in
canonical history. Focused revision-11 checks pass 50 tests across five files, followed by 38 tests
covering the final detector addition. These are checkpoint checks, not full acceptance.

The revision-10 run also had exact same-seed day-1 and day-7 saved-state comparisons (zero
differences), but was interrupted after the later memory defect; its partial 30-day/reload runs
are not final determinism evidence. Revision 11 is the next complete matrix candidate, at local
simulation commit `5779893`. Full replay/continuation and the normal suite follow complete-window
review rather than claiming acceptance from an early checkpoint.

To preserve disk space, five older intermediate directories were moved from the C: scratch area
to `D:/TornVeilValidation/observatory-hardening-20260930/relocated-intermediates`. Its
`relocation-manifest.json` records all original/new paths and verified SHA-256 hashes for 103
files. The original baseline stays in place; no evidence was discarded.

## Local language isolation regression

An earlier check of the unchanged language implementation used a real
installed `qwen3:8b`, disabled mode, and an unreachable loopback endpoint. Each independent seed-918271
world ran 20 steps, requested one read-only expression, then ran another 100 steps. The real request
validated without fallback in 27.029 seconds on simulation revision c7b1997. All three final canonical hashes are
`330cf3dd79a5068057ebbab82cba46b75eb221ad8eb76f6b26ab2edfeecdb9b2`.
The expression itself changes no serialized field and adds zero events in every mode.
`tests/observatory-language.test.ts` also covers adversarial output, prompt injection, unavailable
models, ordinary conversation fallback, and truth/belief separation. Generated wording does not
automatically become memory. Evidence: `docs/evidence/observatory-hardening/language-isolation.json` (raw archive also on D:).
Earlier HTTP-500 and timeout attempts remain recorded; no backend/model capability was changed.

The final check on simulation `187a035` again validates real `qwen3:8b` without fallback,
plus disabled and refused-connection modes. Each produces the same final content hash
`4a84e419accfc2bea3b3fb8af4fb6ce82df97c4b5ab59f95b5da806718be2d88`, including the new
saved compaction cursor. Expression changes zero fields and emits zero events. See
`docs/evidence/observatory-hardening/language-isolation-current.json`. The 14 existing
language regressions also pass in the normal suite. No LLM feature or canonical capability
was added; this is a bounded 120-step isolation check, not a long model-load benchmark.

Revision 11 found a class-C detector error in seed 918272. Bors completed attack at
9182811 (`e_122402`) and again at 9182856 (`e_122439`) under the same adoption and old
defeat. Between them his ordinary action queue consumed defensive perception `e_122400`
and performed sidestep `action_680`; the perception names strike `e_122392` as its causal
parent. The second completion has a genuinely extended plan. The detector previously
looked only at evidence present when the goal was selected. It now includes completed
defensive steps whose perception belongs to that actor and target and has a real matching
combat-action parent. Reusing that same receipt again still fails the check. Both actual
completion events remain canonical. Nineteen focused progress regressions pass after this
observability-only correction; simulation source is unchanged from `5779893`.

Full revision-11 review exposed a further **A — irreversible diagonal route**. In seed 918273,
Vex entered (149,24), floor 23, at tick 9375267 from (148,23), floor 22. Both orthogonal
side cells had floor 21. The navigator admitted the diagonal because each side was within
one block of the source, but rejected the reverse because each side was two blocks below
that endpoint. Vex and later Skarn remained physically stranded there; newly seen moving
targets then caused 16 and 32 path failures in their worst windows. This is not classified
as legitimate waiting merely because the targets changed. The exact pre/post-step body,
plan, path, surrounding columns and causal event receipts are in
`revision-11/repaired-918273/blocked-origin-p32-step-trace.json` in the external archive.

The shared navigator now checks diagonal support against both endpoint heights, and ordinary
walking/crowd separation uses the same edge constraint. It does not move trapped actors,
create a recovery script, or alter terrain. The compact ridge regression fails before the
repair; it verifies rejection in both directions and then verifies a supported one-step
slope stays traversable in both directions. Forty-one navigation, movement and Observatory
regressions pass. Revision-11 final replays and its normal suite were interrupted when this
concrete defect was identified; their partial outputs are preserved and are not acceptance.

Revision 12 exposed a further **A — execution disagreed with fresh-aggression selection**.
In seed 918272 the Traveler selected attack at tick 9699060 (`e_194062`) after observing
Vex's new strike `e_193988`. Execution nevertheless treated Vex's older defeat at 9574410
as terminal and completed the same adoption at 9699069 (`e_194065`) and 9699087 (`e_194072`)
without a defensive step or new intervening evidence. The detector correctly retained this
finding in 74 hourly samples. Exact events are preserved in
`revision-12/repaired-918272/attack-completion-review.json` in the external archive.
The action now honors the same observed, currently attacking target exception as selection;
a presently downed, surrendered, subdued or detained target remains terminal. Unseen activity
cannot reopen the old defeat. The new regression fails before this fix, passes afterward,
and checks both limiting conditions. Sixty-four focused progress/conflict/action tests and
typecheck pass. Revision 12 was interrupted with a manifest; revision 13 reruns the matrix.

Revision 13 completed all three 30-day worlds with 2,160 hourly hard checks passing and
zero stuck-path alerts, but full-window review still found **A — absent report recipient
knowledge was not shared across cases**. Garrick (seed 918273) changed goals 222 times at
10323057–10333146 across 106 distinct keys. He reached (96.744,14,113.5), then selected
another case every 18 world seconds at the same location. His `loc:p_14` stayed at
(97.496,14,113.412), dated 10310592, with no guard percept. Hourly canonical states before,
during and after the window place the idle, 1-HP Hale at (104.311,14,130.742). Receipts
`e_307482`, `e_307486`, `e_307492`, `e_307496` capture the repeated stale premise.
`revision-13/repaired-918273/report-target-hourly.json` and `report-target-review.json`
preserve the target context. Changing case identity was not evidence that the guard returned.

A failed local report search now emits its own causal observation and reuses the existing
`locationNotFound` mechanism. A searched public post cannot reinstate the disproved location;
fresh perception or testimony can supply a new one normally. Unresolved failed reports give
that location evidence the existing practical retention tier across activity/case changes,
inside the unchanged 400+40 bound. Retiring those records removes its special relevance.
No new cooldown, hidden position, guard availability flag or recovery script is introduced.
The failing-before regression checks shared absence, causal parent, hidden movement exclusion,
new observation, retention under memory pressure and eventual ordinary forgetting. Forty-five
focused tests across four files plus typecheck pass. The diagnostic now flags five unchanged
failed listener searches in three hours across different case keys, without treating new
positive sightings as the same attempt. Revision 14 reruns the full matrix before acceptance.

Revision 14's new failed-report check caught **A — terminal plans reused stale parameters**
by day 7. Greta (seed 918273) failed the same report 22 times at 9044490–9044868:
`e_85055`, `e_85059`, `e_85062` and subsequent receipts retain target (100.563,14,112.485)
while her own newer location evidence places Rowan at (82.960,14,110.040), dated 9044472.
Candidate utility correctly falls to 0.570 with 11–15 attempts, but the selected goal keeps
its old 0.994 assessment and destination. The chooser's same-key branch rebuilt the old
terminal goal instead of the newly assessed candidate. A nearby different authority could
also reopen reporting while the old heading stayed preferred after that trip failed.
The exact decision/plan/location receipts are in
`revision-14/repaired-918273/report-retry-review.json`. The partial matrix is preserved
with `revision-14/interrupted.json`; it is not acceptance.

The shared chooser now rebuilds terminal plans from current candidate parameters. A failed
attempt is explicitly readopted with a fresh adoption receipt; unfinished attempts retain
ordinary commitment. Report heading preference applies only while its journey is unfinished.
This is not another cooldown or a position query outside knowledge. The regression fails
before the repair and passes afterward. Forty-six focused tests pass, followed by thirty
planning/progress tests. A worship fixture previously demanded object identity with mutable
`Body.pos`; it now requires the same coordinates, no invented place, and a detached position
snapshot, consistent with the established save/load repair.

A separate **C — historical diagnostic alias** was found: hourly results referenced mutable
loop-evidence arrays, so later findings/counts could appear inside an earlier saved sample.
The verdict at sampling time was unchanged, but its evidence payload was misleading. Diagnostic
checks now return detached snapshots. The failing-before regression preserves a four-attempt
PASS sample, emits a fifth failure, and verifies the old sample stays empty. Future snapshots
still show the actual failure. Existing raw event-time receipts remain authoritative for onset.
Revision 15 follows with these repairs; no thresholds or emitted world events were suppressed.

Revision 15's rate review found **A — visible did not mean able to hear**. Alwin (seed
918271) selected the same report to Dunstan 601 times over 9030000–9040800. Replaying
the unchanged day-1 checkpoint reproduced exact receipts `e_67606`, `e_67625`, `e_67634`,
`e_67637`, `e_67639` and `e_67643`. At each, Alwin stood at (94.5,14,121.5), and Dunstan
was **asleep**, health 110, at (94.506690,14,122.434010). The belief `ev:e_58047` had
one testimony hop; this was not exhausted hearsay. A nearby percept cleared backoff
every 18 world seconds while ordinary `conversationBodies` correctly returned no pair.
The later day-7 guard state was not used as proof of this earlier blocker. Exact replay
body/knowledge/report snapshots are in
`revision-15/repaired-918271/unresponsive-listener-exact.json` in the external archive.

Report reopening now requires the existing embodied conversation contract, gated by a
nearby visual percept. Selection also excludes that observed unavailable listener across
different incident keys. Unseen distant guards remain approachable using the speaker's
own location evidence; no remote body state is revealed. Failed conversations emit a
causal failed-report receipt rather than silently failing the action. Repeated sightings
of the same unresponsive body do not reset the diagnostic's blocker signature.

An independent focused regression also demonstrates **A — exhausted testimony offered
as an impossible report**: the chooser proposed a belief at `MAX_TESTIMONY_HOPS` even
though the ordinary `tell` mechanic rejected it. Report eligibility now uses that same
existing limit. This is a separately reproduced contract mismatch, not an explanation
invented for Alwin. Sleeping/downed eligibility and exhausted-testimony tests fail before
their repairs. Sixty-six focused progress, root-cause and interaction tests pass afterward,
along with typecheck. The older proximity fixture now physically places its guard at the
claimed two-metre distance rather than faking distance while leaving the body far away.
Revision 15 is preserved with an interruption manifest. Commit `e47bfb5` starts revision 16.

Revision 16 then found **A — changing cases after turning away bypassed listener failure**.
At seed 918272, Maud failed five reports to Rowan at ticks 9625467–9626079, including
`e_202010`, `e_202058`, `e_202112` and `e_202158`. The cases differ (`ev:e_173321`,
`ev:e_173435`, `ev:e_173776`, `ev:e_173858`), but the listener and destination do not.
She briefly selects socializing, turns away, loses the guard percept, and another case
immediately proposes the same failed conversation. Exact replay from day 7 reproduced
the event IDs and shows Rowan **downed at 1 HP**, at (95.667160,14,118.154264), under
a metre away. He was not sleeping; the original compact diagnostic combined both
unresponsive poses. See `report-cross-case-before.json` in checked evidence and
`revision-16/repaired-918272/cross-case-conversation-review.json` in the raw archive.

Listener availability is now derived across the speaker's existing report records using
the unchanged exponential backoff and four-failure rule. Switching cases or looking away
does not erase failed attempts; an actually available observed listener or a successful
delivery to that listener changes the evidence. Other authorities remain alternatives.
The existing records gain optional `lastFailedAt` and `listenerFailures` fields, because
case status and `lastAttemptAt` alone lose the failure's time when another guard hears the
case. This is retained self-experience inside report progress, not another availability
registry or a query into a distant guard's body. Schema 25 remains compatible; delivered
legacy records cannot reconstruct missing failure history and do not invent it.

The turning-away regression and a second regression for reopening/delivery to a different
watchman fail before their respective repairs. The final 69 focused tests pass and typecheck
passes. Tests include the backoff across distinct cases, another available guard, no hidden
reopening from unseen body changes, successful delivery, and save/reload of the failure.
Revision 16 is preserved with an interruption manifest. Commit `8262390` starts revision 17.

Revision 17 passed all day-15 hard checks, but rate review identified **A — proximity fear
categorically preempted critical physiology**. Osric (seed 918272) changed goals 55 times
at 9732207–9742728: 27 water adoptions, 27 flights from Dunstan, and one other flight.
None of the water attempts completed; only one of those 27 flights completed. For example
`e_228914` (9734808), `e_229016` (9735105) and `e_229137` (9735501) select fear utilities
0.868, 0.856 and 0.879, each followed by water at utility 1.0 and thirst 1.0 (`e_228968`,
`e_229033`, `e_229180`). The shared chooser retained the water attempt's assessed urgency,
but the categorical proximity-emergency exception bypassed it. These were unfinished
attempts oscillating at the cognition cadence, not completed escapes being repeated later.
The full candidate/position/plan window is preserved in
`revision-17/repaired-918272/critical-water-fear-review.json`.

An invested critical eating, drinking or sleeping attempt now competes with proximity fear
under the existing utility/hysteresis comparison. An observed immediate attack still
interrupts; a threatened escape destination still permits replanning. Severity comes from
the existing physiology bands, with no new timer, bonus, forced drink or named-person rule.
This follows Constitution §10's combined motivations rather than categorical priority based
only on a goal label. The focused regression fails before and passes afterward, including
the immediate-attack exception. Fifty-three progress, need, root-cause and robbery tests
plus typecheck pass. Twenty-one Observatory tests pass after exposing existing report records
in the developer inspector; event receipts also carry the selected case's report progress.
Revision 17 is preserved with an interruption manifest. Commits `eb08760` / `7c55be6` start
revision 18. Completed flight followed by a later risky errand remains a separate diagnostic
question; this repair does not declare all recurring fear behavior defective or resolved.

Revision 18's day-15 review retains a **D — bounded fear/access conflict** for Fenn
(`p_30`, seed 918271). His worst window has 81 changes at 9469281–9479937: 41
water adoptions, 40 flight adoptions and 19 completed escapes. Initial thirst is
0.4963; the Traveler is perceived 7.36 metres away. This differs from the repaired
critical-need override: Fenn eventually completes water at 9480387 (`e_164814`),
450 world seconds after the last flagged change, and the next decision records
thirst zero. His increasing bodily urgency competes with fear through ordinary
mechanics. The rate alert remains visible. This receipt establishes a bounded
conflict for this window, not the absence of every possible future decision defect.
Selected receipts are in `docs/evidence/observatory-hardening/bounded-water-fear.json`;
the full timeline is `revision-18/repaired-918271/fenn-water-window.json` in the
external evidence directory.

Revision 18 completed all three 30-day runs with 720 hourly samples each, zero
configured hard failures, zero repeated-path groups, and closed edible-unit ledgers.
It is nevertheless **intermediate evidence**, because reviewing the rate leads found
**A — unfinished ordinary attempts lost their assessment when the new proposal was
absent**. In seed 918273, Old Wyn (`p_27`) alternates `eat:pl_35` (utility 0.8,
food `i_89`) with `work:pl_25` (about 0.398) every 99 world seconds around 9980562.
Alwin (`p_17`) similarly alternates `harvest:pl_26` (about 0.471) with socializing
(0.2205) around 10674210. Their worst windows contain 18 unfinished meal adoptions
and 19 unfinished harvest adoptions, respectively. No corresponding completions
or path failures occur in those windows. Food-source bounds and evidence-dependent
proposal availability must not be confused with the failure of the invested trip.

The chooser now preserves the last assessment for **any unfinished finite attempt**
when a fresh candidate does not reassess it. This replaces the previous narrow
escape/threat/same-goal-type exception with the shared rule. Current candidate
utility still takes precedence; actions still enforce prerequisites, and failed or
completed plans lose this protection. A materially stronger need and immediate
danger still interrupt through existing rules. There is no new timer, utility
bonus, hidden source knowledge or per-occupation script. Both regression cases fail
before the repair; 55 focused tests across four files and typecheck pass afterward.
Selected original receipts are in `ordinary-attempt-before.json` in the checked-in
evidence directory. Revision 19 reruns the matrix on this changed implementation.

Revision 19 completed all three histories with closed edible ledgers and no configured hard
failure, but its final primary rate review caught **A — immediate loss of hunting evidence**.
Kestrel (`p_26`) adopted `work:pl_34` 354 times at 11170146–11176500, before changing
activity at 11176518. The same `node_18` is observed unavailable at `e_473954`, then
`e_473957`, `e_473967`, and each new attempt. His position remains approximately
(129.5998,15,40.0836); the job repeatedly rebuilds goto + gather without producing meat.
The existing hunting shift already honors a recent empty-ground observation for one
30-minute hunt interval. Unlike food-access, pantry and shortage evidence, however,
`game:<node>` did not receive practical-memory priority. Memory pressure can discard it
immediately, defeating the existing reconsideration rule. The later day-29.875 checkpoint
contains 435 knowledge records and no game observation; this is labeled a later sample,
not presented as a snapshot of the earlier failed action.

The regression reproduces that evidence loss, then verifies the repaired observation survives
bounded memory pressure, changes the candidate set, does not learn distant replenishment,
and can expire normally. The repair adds `game:` to the existing practical tier for that
already-used interval; no new cooldown, capacity increase, resource, availability registry
or recovery script is added. Seventy-four focused progress, economy and knowledge tests
plus typecheck pass. Selected receipts: `docs/evidence/observatory-hardening/hunt-memory-before.json`.
Revision 19 is preserved as intermediate evidence. Commit `f5eb319` starts revision 20.

## Continuous world results and remaining decision leads

The reviewed revision-20 matrix has **720 hourly samples per seed**, no configured hard
failures, no stuck-path groups, no duplicate event identities, no hit/contact identity
failures and no absent hit-action parents. It preserves every rate alert. The three
archives have 344, 325 and 313 warning groups respectively; these are signature groups,
not counts of confirmed defects. The failed-hunt retry group is gone.

| Seed | Days | Alive | Edible units | Pressured households | Low-HP bodies | Knowledge records | Emitted events |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 918271 | 1 | 33 | 322 | 3 | 5 | 8,186 | 18,450 |
| 918271 | 7 | 33 | 134 | 7 | 11 | 13,818 | 148,932 |
| 918271 | 30 | 33 | 107 | 14 | 0 | 13,959 | 482,373 |
| 918272 | 1 | 33 | 337 | 6 | 10 | 8,738 | 21,739 |
| 918272 | 7 | 33 | 121 | 5 | 9 | 13,894 | 119,558 |
| 918272 | 30 | 33 | 50 | 15 | 1 | 14,101 | 491,102 |
| 918273 | 1 | 33 | 325 | 5 | 2 | 7,726 | 13,203 |
| 918273 | 7 | 33 | 120 | 8 | 11 | 13,873 | 120,274 |
| 918273 | 30 | 33 | 72 | 13 | 8 | 14,016 | 483,432 |

These horizons are checkpoints along each continuous run, starting from the same ordinary
fixture for that seed. Low HP is separate from localized wounds; zero low-HP bodies does
not assert no fights or no wounds. All three edible-unit balances close:

- 918271: **377 + 1051 − 1129 − 170 − 22 = 107**.
- 918272: **377 + 929 − 1112 − 138 − 6 = 50**.
- 918273: **377 + 1005 − 1144 − 152 − 14 = 72**.

Terms remain initial + production − consumption − spoilage − edible transformation inputs.
Internal transfers net to zero. There is no injected food or guaranteed-prosperity target.
The source digests and complete production, trade, injury, conflict, knowledge, relationship,
labor and skill outcomes are retained per run, rather than merging distinct seeds' histories.

The remaining worst churn windows contain 16, 11 and 11 actors, with maximum counts 64,
49 and 48. Review distinguishes completed finite flights and distinct reported cases from
repeated failure. Subsequent completion receipts exist for most displaced ordinary needs;
some are hours later, so they demonstrate bounded progress rather than optimal choices.
For example, seed 918271 Alwin's hauling completes at 9565302 after his worst window ends
at 9562800. Seed 918272 Fenn's sleeping completes 105534 world seconds after his window.

Tilly Fletcher's primary worst window contains 30 meal adoptions and 30 flights, 29 of
which complete. No later completed meal was found before day 30. Her final pantry evidence
is empty, personal wealth is zero, and actual failure `e_481731` at 11255133 records an
unaffordable four-silver meal. These explain sampled material barriers but do not prove
every intervening choice is appropriate. This unresolved decision-quality lead remains
**F — insufficient evidence**, AMBER, rather than being labeled an infinite loop or declared
healthy. `docs/evidence/observatory-hardening/remaining-leads.json` records all these windows
and subsequent-progress checks; complete event-time receipts remain in each run archive.

## Exact continuation verification

The normal suite identified four **E — integration observation-window failures** in the
existing seed-17 living-universe fixture. At its old 2400-physical-second endpoint (1.667
world days), ordinary mechanical output is 5.886, seven flour units have been delivered,
one person holds the discovered method and no bread has yet been baked. A receipt trace
shows the baker using ordinary meals, sleep, conversation, substitute mill work and hauling;
this is not zero progress or a missing production transformation. Actual first bread occurs
at physical time 6259 (`e_9935`, Wren Alder, world tick 9041940). At five world days the
normal/control/manual/plank variants bake 20/10/40/20 units; mechanical output remains zero
in the calm and skilled-manual controls, while normal and plank variants teach their methods.

Only this fixture's observation horizon and corresponding wall-time test limits change.
Every existing output, comparative-control, material/energy conservation, provenance,
teaching isolation, deterministic replay and continuation assertion is retained. The original
seed, generated resources, people, autonomous decisions and wind controls remain unchanged.
The Observatory's 1/7/30-day horizons do not change. Before/after timing receipts are checked
in as `docs/evidence/observatory-hardening/living-fixture-timing.json`; full trace and failure
logs remain under `revision-21`. This is not a runtime adjustment to make the economy succeed.

Revision 20 completed all three continuous 30-day worlds with zero configured hard failures,
but the uninstrumented final-three-hour checkpoint trial exposed **A — lost compaction
cadence on reload**. All three restored trials agreed with one another, yet differed from
continuous execution. Strict comparison found 870,975 differences, dominated by event-array
index shifts, plus one historical-significance total (+0.12). The persisted people, bodies,
inventories, knowledge, goals and economy did not differ in this short comparison.
`World.lastCompactionEventCount` was a private, unsaved batching cursor: reload reset it to
zero and could compact history earlier. A focused regression shows event `e_152` incorrectly
retiring immediately after reload while continuous execution retains it. This matters because
effect backlinks contribute to historical significance; it is not normalized away.

New schema-25 saves now retain that existing count. Legacy saves without it retain their
previous cold-start behavior; an exact missing boundary cannot be reconstructed. No continuous
step, threshold, retention rule or NPC decision changes. Eighteen focused persistence,
continuation and root-cause tests plus typecheck pass. The pre-fix short continuation, strict
diff and benchmark remain under `revision-20`; long continuation must use newly captured saves.
The three-seed continuous outcome/decision evidence remains valid for this persistence-only
repair. A fresh primary run verifies that assertion at days 1, 7, 15 and 30: each strict
cross-revision comparison reports only the added cursor, with every previously saved value
and property order equal. Complete decision-window reviews are also identical.

The final saved-state comparator also audits object property enumeration order. Earlier
content fingerprints sort object keys, which alone cannot certify future iteration behavior
of knowledge tables. A synthetic two-key reversal passed the old comparator and fails the
strengthened one; identical input still passes. Final comparisons report value and order
differences separately, and count either as a divergence. Only envelope `savedAt` is omitted.
This verification change does not alter simulation behavior. The fingerprint source comment
changed after revision 20 started; that edit changed neither its algorithm nor simulation
source. The later compaction-cadence persistence repair is recorded separately above.

With that repair, continuous day 30 and day-15-save/reload-plus-15-days have **zero value
differences** across all persisted fields, including execution, RNG streams, ownership,
inventory, bodies, knowledge, relationships, economy, terrain, clocks and event history.
Both content digests are `461b057fa012be7574cd973a1a4b91366e2b7618cd269eba2e9e0c1f6b7698f4`.
The raw strict comparison still reports **four property-order differences**, all reviewed
as **C — false positives for simulation-state divergence**:

| Person | Concern | Difference |
| --- | --- | --- |
| Wendel Crane, p_9 | cn_1051 | `situationId` property moves after the other fields |
| Wendel Crane, p_9 | cn_2099 | same |
| Dunstan Mole, p_15 | cn_2324 | same |
| Fenn Muddle, p_30 | cn_1502 | same |

`formConcerns` initially creates this optional named field with `undefined`. JSON omits it;
a later evidence-backed assignment appends it to the restored object's properties. Values,
concern-array order and every other key order match. Decisions read concern fields by name;
the generic reference collector uses membership, not record-field order. New execution saves
use explicit topic links rather than the legacy JSON-equality fallback. Thus these four
fixed-record layout differences do not change the represented state or behavior. This is
not a byte-identical serialization claim. The raw diff is preserved unmodified, and its
SHA-256-bound review lists all four exact rows. The summary refuses a review whose rows or
hash differ; other ordering differences are not automatically excused.

The independent fresh revision-21 repeat also completed. Strict comparisons at days **1, 7
and 30** report **zero value differences and zero property-order differences**. Day-30
content hash is again `461b057fa012be7574cd973a1a4b91366e2b7618cd269eba2e9e0c1f6b7698f4`.
The raw comparisons are `revision-21/repeat-day-{1,7,30}-diff.json.gz`; both runs retain source
digest `79e3b3695df4606ad9bc01c303f0e9511b89263c747522ed16e368550dd793fb`.
The matrix's other two seeds use revision 20; the only subsequent simulation change persists
the compaction cursor. The primary's strict cross-revision checks and identical complete
decision review establish unchanged continuous behavior. Each run keeps its own source hash.

Browser hardening acceptance passes with no browser errors. It expands an actual original
decision receipt, downloads complete evidence, opens hourly findings, checks nine original
diagnoses and nine horizon rows, displays the raw continuation differences and exact-row
review, loads the repaired world paused, and starts/cancels the reproduction action.
Screenshot evidence and `browser-evidence.json` are in `.debug/observatory-hardening/browser`.
The delivered launcher was then executed separately, preserving the older server; its new
port-7481 world was loaded from the reviewed archive and visually inspected paused at tick
11258400. `revision-21/handoff.json` records that final local state.

## Limits that remain AMBER

Final uninstrumented benchmark: three independent restores of revision-21 day 29.875,
each advanced 1200 fixed steps to day 30 without event listeners or an in-step profiler.
Every final content hash equals the continuous primary. The host had no other owned
validation jobs running during these trials; unrelated applications may still contribute.

| Trial | Median ms | p95 ms | Maximum ms |
| --- | ---: | ---: | ---: |
| 1 | 3.310 | 12.315 | 115.766 |
| 2 | 2.861 | 12.253 | 103.353 |
| 3 | 2.718 | 11.624 | 99.181 |

The original uninstrumented before/compaction-only after trials above provide the controlled
semantics-preserving comparison. These final trials use the repaired world's different
history and are not substituted for that experiment. The full instrumented primary is
median **2.353**, p95 **10.329**, max **185.148 ms**, versus the original instrumented
**2.242 / 10.683 / 180.243 ms**. Those shared-host whole-run figures include differing
histories and diagnostic overhead; they do not establish an overall speedup. The unchanged
100 ms maximum-step objective remains unverified. Evidence: `step-benchmark-current.json`.

Normal regression coverage totals **1,413 tests across 162 files**. The complete invocation
finished with 1,409 passes and four failures confined to the old living-universe cutoff.
After the documented test-only horizon correction, all 11 tests in that file pass (161.80 s).
No runtime source changed afterward; the other 161 passing files remain valid. This is full
coverage through the full invocation plus its focused rerun, not a claim that the first
invocation exited successfully. Production build and the final diagnostic-script typecheck
pass. The original failing logs remain preserved alongside the rerun.

- Activity-rate alerts retain their original thresholds. Distinct reports, timed hiding,
  ordinary observations and repeated care can cross them. Complete worst-window receipts
  are available, but passing the concrete progress checks is not proof that every future
  goal sequence is sound. An unclassified rate lead is class F, not automatically a bug
  or automatically a legitimate outcome.
- The edible-item ledger accounts for represented stock units. Full material/mass/calorie
  conservation across every transformation and complete reasons for unavailable seller
  offers are not represented. Household pressure includes thirst.
- Provenance shape, stored causal references, focused acquisition regressions and the
  repaired reporting paths are checked. That is not an audit of every legacy premise or
  every interpretation of social evidence. In particular, observers' inference about
  lawful violence remains imperfect; private combat intent is not copied into their minds.
- Combat receipt identity and action-parent checks do not independently reconstruct every
  swept trajectory. Existing regional wounds have no mending mechanism; HP recovery and
  ordinary care are separate mechanics. Neither low HP nor a lingering wound is itself RED.
- The unchanged performance budget is 100 ms per step. Scoped compaction improvements
  preserve behavior, but the measured maxima can still exceed that budget on this shared
  host. Performance is not certified by a good median.
- Exact replay/continuation results apply to the recorded source, scenario, seed and inputs.
  New schema-25 saves carry actual reference metadata; legacy saves without it retain the
  documented best-effort restoration, not a retroactive exact-continuation guarantee.
