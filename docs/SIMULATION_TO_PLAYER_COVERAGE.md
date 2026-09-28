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

Candidate identity for evidence below: branch `claude/inhabitable-alpha`; server release
`0.2.0-inhabit.1+5dce62d73ca9` in the isolated dev world `tvo-dev-39a6e14c…` (seed 918271, port 7430);
Milestone 1 packaged client `client-84c1700` (Development, clean). Full suite at `2d7f7f9`: 1265/1265.

## 1. Embodiment and travel

| ID | Capability | Canonical source | Player entry | Status | Evidence | Remaining |
|---|---|---|---|---|---|---|
| EMB-ENTRY | Sign in; create or continue a person | `live.ts` connect, `createCharacter` | Sign-in screen (begin a new life / continue) | playable | native (journey-editor-02/03) | human; spawn spacing (arrivals 1 m apart) |
| EMB-MOVE | Walk, sprint, turn, stop | `interactionMovement`, prediction | WASD/stick, Shift, mouse | playable | native (journey), prior packaged control probes | camera sits low/close in conversation |
| EMB-CROUCH | Crouch | `posture.ts` | Ctrl / Abilities | playable | prior native | — |
| EMB-DOOR | Open/close doors | hand `open:/close:door` | Interact prompt | playable | prior tests | — |
| EMB-REST | Sleep where one stands / wake | `restOrWake` | Abilities (projected) | playable | unit (player-actions-projection) | offline body sleeps; bot/player must wake (Z) |
| EMB-JUMP | Jump / vault | — | — | excluded | not implemented canonically | would need a canonical mechanic, not a client move |
| EMB-TRAVEL | Regional travel between settlements | regional streaming, nav | walking | partial | accel (adventures travel 100s of m) | no map/route guidance; 6–24 km distances |

## 2. Survival and possessions

| ID | Capability | Canonical source | Player entry | Status | Evidence | Remaining |
|---|---|---|---|---|---|---|
| SURV-EAT | Eat carried food | hand `consume:`, `actionsForCarriedItem` | Inventory → "Eat …" (only food offers it) | playable | unit; native journey-editor-03 (hunger 21%→0%, silver 20→19) | package run in progress (journey-package-01 reached conversations; closing fix pending) |
| SURV-DRINK | Drink at water / carried ale | hand `drink:` | Interact prompt; inventory for ale | playable | prior tests | — |
| SURV-CARRY | Carry, weigh, drop items | inventory, `dropPositionAtHand` | Inventory → "Drop …" (refused with reason when no ground) | playable | unit | — |
| SURV-READ | Read a carried record | `read_record`, `canReadRecord` | Inventory → "Read …" (refused: unknown marks / damaged) | partial | unit (projection) | no record journey yet; write/copy not exposed |
| SURV-CONTAINER | Store/take from containers | `container_transfer` | Container panel | playable | prior native UI test | — |
| SURV-BUY | Buy from a person | dialogue Trade / Buy a meal | Talk → Trade → Buy | playable | native journey-editor-03 (bread, 1 s) | trade list shows fractional quantities (9.375 planks) and duplicate "Buy log" rows |
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
| MECH-ALL | Inspect, diagnose, test, reverse-engineer, dismantle, replace, connect, manufacture, reconstruct, ask | `gameSim` mechanism intents, `mechanismPanel` | Only inside the developer inspector (`bInspector && bMechanismsOpen`) | canonical-only | unit (mechanism tests) | no ordinary player panel: historical finding reproduced |
| MECH-DORMANT | Mechanisms arise in generated worlds | `invention.ts` (`inventionGoals`: needs a production shortfall at a usable place + a known component/method for that process + a reachable energy boundary); `settlementMechanics.ts` seeds only wind boundaries and primitive knowledge | — | canonical-only | accel: **0 assemblies and 0 components** after 7 world days on seeds 918271/918272/918273; 0 at start | the whole family is dormant in the worlds players enter; which invention precondition never holds is unresolved. A native panel alone would expose nothing. Needs investigation before UI work |
| BUILD | Construction labour | agent `build`, construction projects | — | canonical-only | accel (NPCs) | — |

## 5. Knowledge and society

| ID | Capability | Canonical source | Player entry | Status | Evidence | Remaining |
|---|---|---|---|---|---|---|
| SOC-TALK | Conversation, news, who are you, introductions | `dialogue.ts` | Talk prompt → dialogue panel | playable | native journey-editor-03 | several NPC names carry numeric suffixes ("Rhea Ives 2") |
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
| ENV-WILD | Species, sensing, defence, carcasses | `ecology/*`, wildlife projection | seen in world; danger cue | partial | accel; prior captures | boar/hare are primitive-shape bodies |
| ENV-TIME | Canonical time and weather | clock, weather | — | partial | — | lighting forced to fixed daylight (historical finding, not yet addressed) |

## 8. Continuity

| ID | Capability | Canonical source | Player entry | Status | Evidence | Remaining |
|---|---|---|---|---|---|---|
| CONT-RECONNECT | Quit and continue the same person | live server, checkpoints | Escape → Quit; relaunch | playable | prior drills; native reconnect run pending | — |
| CONT-SHARED | Two players, one world | live server | two clients | playable | prior pair (staging) | contention/trade between players not yet exercised |
| CONT-OFFLINE | The world continues without the player | scheduler | — | playable | prior soaks and 7-day continuations | — |
