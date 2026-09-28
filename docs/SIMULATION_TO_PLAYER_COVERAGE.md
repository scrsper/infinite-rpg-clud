# Simulation-to-player coverage

What the canonical simulation can do, and whether an ordinary player can do it, see it and live with
its consequences in the packaged game. Derived from the code: the agent's action handlers
(`src/sim/mind/agent.ts`), person intents (`src/sim/runtime/gameSim.ts`), hand interactions
(`src/sim/physical/hand.ts`), dialogue options (`src/sim/mind/dialogue.ts`), bridge messages
(`src/bridge/session.ts`) and their native consumers (`unreal/.../TVBridgeSubsystem`, `TVPlayerShell`,
`TVCommonUIWidgets`). Rows are added as they are found; a row never disappears because it is
inconvenient.

**Implementation status**: `canonical-only` (exists in the simulation, no ordinary player entry) ·
`partial` (reachable, but a stated part is missing) · `playable` (ordinary entry, feedback,
consequence, persistence) · `excluded` (with the reason).
**Evidence** is listed separately: `unit` (headless contract test) · `accel` (accelerated/instrumented
simulation) · `native` (automated native journey, ordinary input) · `package` (the same, in a packaged
build) · `human` (actual human play). "Compiled" is not evidence of anything.

Candidate identity for evidence below: branch `claude/inhabitable-alpha`; isolated dev world
`tvo-dev-39a6e14c…` (seed 918271, port 7430, `%USERPROFILE%\TornVeilAlpha\dev-inhabit`). Milestone 1
packaged checkpoint: client `client-4333a46` (Development, clean, revision `4333a462c5c3`) against server
release `0.2.0-inhabit.4+4333a462c5c3`; see `docs/CANDIDATE_MANIFEST.md`. Earlier rows cite
`client-84c1700` / `0.2.0-inhabit.1`. Full suite at `2d7f7f9`: 1265/1265.

## 1. Embodiment and travel

| ID | Capability | Canonical source | Player entry | Status | Evidence | Remaining |
|---|---|---|---|---|---|---|
| EMB-ENTRY | Sign in; create or continue a person | `live.ts` connect, `createCharacter` | Sign-in screen (begin a new life / continue) | playable | native (journey-editor-02/03); package (journey-package-04: sign-in → new life "Ivo Brannock") | human. Arrivals now spread on a golden-angle spiral clear of bodies (unit: arrival-spacing) |
| EMB-APPEAR | People look like who they are | canonical visual state (`TVHumanoidVisualState`) → CitySample crowd bodies | seen in world | partial | package frames (journey-package-04: green-grey; journey-package-05/06 at `02903b1`/`9502128`: varied natural skin) | fixed: crowd faces keep their authored skin (mirrored head instances). Everyone given the f_003 Updo was bald (no binding for that groom in this checkout; `repair_updo_bindings.py` run, local) and runtime grooms tripped a PSO ensure (`5fc7bcd`) — both need a packaged re-check. Footwear: villagers wear the Ashford set (waraji, geta, tabi boots; `M_TV_AshfordCloth` tinted with the canonical secondary garment colour, often pale — plausible tabi), but the pieces read as blocky, and a few render detached from any body, floating near people (cause not found). Sack props fail to compile (`M_TV_Local_Sack*`). Canonical `skinTone` not yet mapped to the face atlas |
| EMB-MOVE | Walk, sprint, turn, stop | `interactionMovement`, prediction | WASD/stick, Shift, mouse | playable | native (journey), prior packaged control probes | fixed: a reconnect indoors put the camera inside the player's own body (now hidden like any intruder; lying bodies tested by mesh bounds) — packaged re-check pending |
| EMB-CROUCH | Crouch | `posture.ts` | Ctrl / Abilities | playable | prior native | — |
| EMB-DOOR | Open/close doors | hand `open:/close:door` | Interact prompt | playable | prior tests | — |
| EMB-REST | Sleep where one stands / wake | `restOrWake` | Abilities (projected) | playable | unit (player-actions-projection) | offline body sleeps; bot/player must wake (Z) |
| EMB-JUMP | Jump / vault | — | — | excluded | not implemented canonically | would need a canonical mechanic, not a client move |
| EMB-TRAVEL | Regional travel between settlements | regional streaming, nav | walking | partial | accel (adventures travel 100s of m) | no map/route guidance; 6–24 km distances |

## 2. Survival and possessions

| ID | Capability | Canonical source | Player entry | Status | Evidence | Remaining |
|---|---|---|---|---|---|---|
| SURV-EAT | Eat carried food | hand `consume:`, `actionsForCarriedItem` | Inventory → "Eat …" (only food offers it) | playable | unit; native journey-editor-03 (hunger 21%→0%, silver 20→19); package journey-package-04 (bought bread 4s, ate: hunger 20→0, silver 20→16); native `journey-editor-tavern-6` at 11:00 (a newcomer walked into the Fenwick tavern, bought meat 5s, ate: hunger 20→0; coin and eating sounds each played once) | human. In the morning the square's sellers offer only ale — food is sold indoors, which the older probe never entered |
| SURV-DRINK | Drink at water / carried ale | hand `drink:` | Interact prompt; inventory for ale | playable | prior tests | — |
| SURV-CARRY | Carry, weigh, drop items | inventory, `dropPositionAtHand` | Inventory → "Drop …" (refused with reason when no ground) | playable | unit | — |
| SURV-READ | Read a carried record | `read_record`, `canReadRecord` | Inventory → "Read …" (refused: unknown marks / damaged) | partial | unit (projection) | no record journey yet; write/copy not exposed |
| SURV-CONTAINER | Store/take from containers | `container_transfer` | Container panel | playable | prior native UI test | — |
| SURV-BUY | Buy from a person | dialogue Trade / Buy a meal | Talk → Trade → Buy | playable | native journey-editor-03 (bread, 1 s); unit (trade-menu-rows); package journey-package-04 (declined one seller's goods, bought from the next) | fixed: offers grouped by good and price, whole units, seven per page with "More goods…". Found by journey-package-05/06 (failed at 16:00 and 18:00): innkeepers, cooks and bakers napped from their afternoon break straight through the evening shift (a sleep ended only when fully rested), so no tavern food could be bought 14:00–22:00 and the shifted cycle repeated daily. Fixed: a sleep lain down for outside one's own sleeping hours is marked a nap, and a nap ends (after at least an hour) once its sleeper is no longer more than mildly tired and a scheduled duty is due; night sleep, sleeps begun before the change, and anyone without a schedule (players) are unchanged. Unit `nap-and-duty` (fails on the old rule); accel trace: Fenwick's innkeeper and cook at the tavern at 18:00 on both days. Packaged evening re-check pending |
| SURV-BUYDISPLAY | Buy goods set out on a counter | hand `buy:` (seller present) | Interact prompt | partial | accel (knife) | regional world sets out only the tavern knife; food sits off-display |
| SURV-SELL / GIVE | Sell or give to a person | dialogue Sell / Give something | Talk → … | canonical-only in inventory | — | inventory hides Give (no direct intent); route through dialogue |
| SURV-THEFT | Take someone's goods | hand `steal:` | Interact prompt ("Take … anyway — this is theft") | playable | prior tests | — |
| SURV-INJURY | Injury, recovery, incapacitation, death | physiology, combat | HUD vitals; downed/death screens | partial | prior | injury detail not shown in inventory/journal |
| SURV-SLEEPACT | A sleeping body cannot act | `canAct` (fixed this slice) | — | playable | unit (sleep refusal) | — |

## 3. Livelihood and economy

| ID | Capability | Canonical source | Player entry | Status | Evidence | Remaining |
|---|---|---|---|---|---|---|
| ECON-HAUL | Paid carrying work | haul offers, `acceptHaulOffer` | Talk → Any work going? → Carry … | playable | accel | native journey pending |
| ECON-PROTECT | Protection requests (dangerous animal) | `social/protection.ts` | Talk → Any work going? → Deal with the … | playable | accel (hunt/hush adventures) | native journey pending |
| ECON-GATHER | Gather at a resource | hand `gather:` | Interact prompt | partial | prior | "Gather meat (abstract game resource)" label |
| ECON-BUTCHER | Butcher a carcass | hand `butcher:` → `butcher` action, `butcherWork` | Interact prompt; status line shows progress | playable | unit (butchery-work: progress, interruption keeps work, resume, contention refused, save mid-work); accel (protection loop) | native journey pending; a herd's blows interrupt it (correct) |
| ECON-PRODUCTION | Trade production, stand-in work, apprenticeship | `production`, `labor`, `livelihood` | — | canonical-only | accel (NPCs) | no player work-shift entry at a workplace |
| ECON-FARM | Plant / harvest | agent `plant`/`harvest` | — | canonical-only | accel (NPCs) | — |
| ECON-HOUSEHOLD | Household provisioning, purse | `manage_household`, `provision_home` | — | canonical-only | accel | player has no household |

## 4. Construction and mechanisms

| ID | Capability | Canonical source | Player entry | Status | Evidence | Remaining |
|---|---|---|---|---|---|---|
| MECH-ALL | Inspect, diagnose, test, reverse-engineer, dismantle, replace, connect, manufacture, reconstruct, ask | `gameSim` mechanism intents, `mechanismPanel` | Action panel: each canonical panel action on a mechanism in reach ("Mechanism 1 — Inspect"), same person intent as the inspector (`f5227fd`) | partial | unit (mechanism tests); native build + Presentation 16/16 | no mechanism exists in generated worlds to exercise it (see MECH-DORMANT), so no journey yet; a player cannot *start* a mechanism — invention has no player intent (one world, one mechanics gap) |
| MECH-DORMANT | Mechanisms arise in generated worlds | `invention.ts` (`inventionGoals`: needs a production shortfall at a usable place + a known component/method for that process + a reachable energy boundary); `settlementMechanics.ts` seeds only wind boundaries and primitive knowledge | — | canonical-only | accel: **0 assemblies and 0 components** after 7 world days on seeds 918271/918272/918273; 0 at start. Diagnosis (seed 918271, `.debug/inhabit/compose-trace.ts`, `compose-utility.ts`): `compose` reaches a person's top candidates only while a production shortfall is open (5 of 12,850 sampled decisions in 24 h, all millers in hour 1); even ranked first (0.338) it loses to the ongoing work goal under the 0.12 goal hysteresis, and ordinary milling closes the shortfall within the hour (observed 9→20 of 24). No `compose` goal was adopted in 36 h, so no mechanism event occurs | not a broken chain: invention needs a *sustained* shortfall these worlds rarely produce in a week. Deliberately not forced with a utility bonus (AGENTS §6). Player access (MECH-ALL) remains the gap |
| BUILD | Construction labour | agent `build`, construction projects | — | canonical-only | accel (NPCs) | — |

## 5. Knowledge and society

| ID | Capability | Canonical source | Player entry | Status | Evidence | Remaining |
|---|---|---|---|---|---|---|
| SOC-TALK | Conversation, news, who are you, introductions | `dialogue.ts` | Talk prompt → dialogue panel | playable | native journey-editor-03; package journey-package-04 (two conversations, Goodbye); package journey-package-06 (conversation framed: panel docked right, partner's face left of centre) | numeric suffixes fixed for new worlds by generator revision `playable-3` (naming revision 1); worlds recorded under `playable-1/2` keep their names exactly (fingerprints pinned) |
| SOC-ASK | Ask about someone / an item | dialogue | Talk → Ask about … | playable | prior | — |
| SOC-TELL | Tell someone something you know | dialogue `tell` | Talk → Tell them something… | playable | prior | — |
| SOC-TEACH | Be taught the hush (paid, with provenance) | `teach`, dialogue | Talk → Teach me the hush | playable | accel, unit | — |
| SOC-DEBT | Pay another's debt | dialogue | Talk → Pay …'s silver | playable | prior | — |
| SOC-JOURNAL | Journal of knowledge, relationships, progress | `playerJournal` | J | partial | prior | text wall; no navigation by topic |
| SOC-HUNTWITNESS | Witnessing a hunt is not witnessing a crime | `huntsWildGame`, `isCrime` | — | playable | unit (hunting-not-crime) | fixed: a hunter used to come to hate and attack a stranger for killing a boar |
| SOC-CUSTODY | Report, custody, surrender | agent `report`, `take_custody`, `yield` | yield via input | partial | accel | reporting a crime is NPC-only |

## 6. Combat and development

| ID | Capability | Canonical source | Player entry | Status | Evidence | Remaining |
|---|---|---|---|---|---|---|
| DEV-COMBAT | Strikes, guard/parry, dodge, lock | realtime commands | mouse/keys/pad | playable | prior packaged probes | — |
| DEV-HUSH | Hush a creature or person | `attemptHush` | Q / Abilities (only once taught) | playable | accel; unit (projection) | — |
| DEV-MEDITATE | Meditate on the veil | `meditate` | Abilities (only once taught) | playable | unit | — |
| DEV-TRAIN | Solo drills; sparring | `train`, dialogue spar | Abilities (refused with reason) / Talk → Spar | playable | unit, accel | — |
| DEV-IRON | Iron breakthrough | `assessAdvancement`, `advanceToIron` | Abilities (refused with the actual blockers) | playable | accel (12.1-day earned journey, prior); unit | — |

## 7. Wildlife and environment

| ID | Capability | Canonical source | Player entry | Status | Evidence | Remaining |
|---|---|---|---|---|---|---|
| ENV-SOUND | The world is heard | canonical clock and weather (as the sky), body movement, own vitals | ambience, footsteps, coin/eating cues (`1aef56f`) | partial | native test (mix follows noon/night/dusk/rain); editor run `journey-editor-sound`: 3 loops playing, day mix, 112 footsteps | synthesized placeholder sounds; no human listening yet; no voices, doors, combat or animal sounds; packaged sound run pending |
| ENV-WILD | Species, sensing, defence, carcasses | `ecology/*`, wildlife projection | seen in world; danger cue | partial | accel; prior captures | boar/hare are primitive-shape bodies |
| ENV-TIME | Canonical time and weather | clock, weather → region `worldTime`/`environment` | the sky itself | partial | native (TVPlayableLightingTests incl. twilight and reachable moonlight; 16/16); package night frame at natural 20:23 (`journey-package-06-night`: black — led to the twilight fix); native natural-hour frames after exposure settles: 04:29 night readable (`journey-editor-night-hold-3`), 04:58 dawn twilight (`pair-A-oren`) | canonical sky with twilight. Packaged dusk/night re-check on the next client pending. All frames at the world's own hour; the clock is never advanced |

## 8. Continuity

| ID | Capability | Canonical source | Player entry | Status | Evidence | Remaining |
|---|---|---|---|---|---|---|
| CONT-RECONNECT | Quit and continue the same person | live server, checkpoints | Escape → Quit; relaunch | playable | prior drills; package journey-package-04-reconnect (same person returned: 16 silver, hunger 0, empty hands) | human |
| CONT-SHARED | Two players, one world | live server | two clients | playable | prior pair (staging); native two-client run on the dev world (`.debug/inhabit/pair-A-oren`, `pair-B-sela`, editor-hosted): each client was shown the other's body; B's sightings of A lie on A's own recorded path (0.5 m and 1.6 m) after a constant one-region frame offset; B stood still and A saw it still and packaged (`pair-package-A`/`-B`, client-f5227fd): mutual sight; B's sightings of A within 1.6 m of A's own path, same frame; A walked 108 m and B saw 93 m of it | contention/trade between players not yet exercised; two game instances on one machine ran at p95 ≈ 56 ms each (shared GPU; not a single-player figure) |
| CONT-OFFLINE | The world continues without the player | scheduler | — | playable | prior soaks and 7-day continuations | — |
