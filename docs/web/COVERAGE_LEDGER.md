# Coverage ledger — every player-facing system, through the web client

Row IDs are the ones in `docs/SIMULATION_TO_PLAYER_COVERAGE.md` (the canonical matrix), so the two
documents line up. For each system: **canonical source → command → permitted observation → web UI →
animation / audio → persistence consequence → evidence.** The client adds no system of its own: everything
below is a presentation of what the server already projects, and every action is one of the existing
intentions. Statuses use the mandate's words:

- **VERIFIED** — exercised in a real browser session with ordinary input (automated, not a human), with the result observed.
- **IMPLEMENTED BUT UNVERIFIED** — the UI exists and is wired to the server's projection, but it was not driven end to end.
- **PARTIAL** — works in part; the gap is named.
- **BLOCKED / EXCLUDED** — cannot exist client-side; the reason is named.

"Evidence" points at `EVIDENCE.md` sections. Nothing here is a human verdict.

## 1. Embodiment and travel

| ID | Source → command | Observation → web UI | Animation / audio | Persistence | Status | Evidence / gap |
|---|---|---|---|---|---|---|
| EMB-ENTRY | sign-in, create/continue → gateway `character=auto|new|<id>` | Title (Play / Continue), character screen (name, sex), loading progress | — / UI ticks | character persists on the server | VERIFIED (automated) for continue; PARTIAL for create | Continue exercised in every run; a *new* character by name was created and played (`name=` path); the character-limit refusal screen was seen; the title and character screens are captured by the UI check. The character-creation form itself was not driven by typing |
| EMB-APPEAR | canonical appearance tokens → cosmetic realisation | People drawn from their own tokens on shared kits (skin, hair, garments, footwear, accessories) | rig, faces (blink, mouth) | none (cosmetic) | PARTIAL | Lineup and villagers captured; art quality is prototype-level (`KNOWN_DEFECTS.md` A1–A3) |
| EMB-MOVE | `move` commands + shared prediction kernel | Third-person camera, smoothing offset, HUD | distance-driven gait, layering, footsteps | server position | VERIFIED (automated) | prediction corrections stayed at 0–0.07 m, RTT ≈ 1–6 ms over the soak; `PERFORMANCE.md`, `EVIDENCE.md` |
| EMB-CROUCH | crouch flag on `move` | C / Ctrl and Abilities row | crouch pose | server posture | IMPLEMENTED BUT UNVERIFIED | |
| EMB-DOOR | hand `open:/close:door` via `interact` | Interact prompt on the door | door swings from projected state | server door state | IMPLEMENTED BUT UNVERIFIED | doors are drawn from the projection, never decorative |
| EMB-REST | projected rest/wake action | Abilities row, refusal reasons shown | lie pose | server | IMPLEMENTED BUT UNVERIFIED | |
| EMB-JUMP | — | — | — | — | EXCLUDED | not a canonical mechanic; Lane B not started (`EXTENSIONS.md`) |
| EMB-TRAVEL | walking across streamed regions | Region streaming with floating origin; no map | — | server position | PARTIAL | > 1.5 km walked in the soak with 9 resident regions at a time and flat memory; no map or route guidance |

## 2. Survival and possessions

| ID | Source → command | Observation → web UI | Animation / audio | Persistence | Status | Evidence / gap |
|---|---|---|---|---|---|---|
| SURV-EAT / DRINK | hand `consume:` / `drink:` via `interact` | Items tab: only offered rows, refusal reasons | eat/drink poses | hunger, purse | VERIFIED (eat); drink IMPLEMENTED BUT UNVERIFIED | bought bread, Items → *Eat bread*: consumed and Energy rose to 100 % (`EVIDENCE.md` §3) |
| SURV-CARRY | inventory, drop | Items tab (load, fatigue, rows); carried item shown in hand pose (light: one hand; heavy: two) | carry poses | server | VERIFIED (carry, list, drop) | grain carried across save and reconnect; *Drop grain* was executed (incidentally, by the injected-pad check) and the row disappeared |
| SURV-READ | `read_record` | Items row when allowed | — | knowledge | IMPLEMENTED BUT UNVERIFIED | |
| SURV-CONTAINER | `container_transfer` | Items tab container panel, store/take | — | container contents | IMPLEMENTED BUT UNVERIFIED | |
| SURV-BUY / SELL / GIVE | dialogue options (revision-fenced) | Trade group with price and stock columns, confirmation dialog before anything that spends silver; a stale offer is refused | coin cue | purse, stock | VERIFIED (buy); SELL and GIVE IMPLEMENTED BUT UNVERIFIED | purchase asked for confirmation, purse 16 → 14, item arrived, persisted through save and reconnect. Found and fixed: rows worded "(4s each, 9 to be had)" were not recognised (no price, no confirmation) |
| SURV-BUYDISPLAY, SURV-THEFT | hand `buy:` / `steal:` | Interact prompt ("… anyway — this is theft") | — | ownership, reputation | IMPLEMENTED BUT UNVERIFIED | |
| SURV-INJURY | physiology, combat | HUD health/effort/needs; hit reaction; downed/dead screen; Journal → Injuries | hit recoil, limp, collapse; hurt cue | injuries, death (permanent) | PARTIAL | HUD, death screen and animation states exist; not driven through a real injury/recovery arc |
| SURV-SLEEPACT | `canAct` | refusal wording from result codes | — | — | IMPLEMENTED BUT UNVERIFIED | |

## 3. Livelihood and economy

| ID | Source → command | Observation → web UI | Animation / audio | Persistence | Status | Evidence / gap |
|---|---|---|---|---|---|---|
| ECON-HAUL / PROTECT | dialogue "Any work going?" options | "Work & favours" group | — | commitments in Journal | IMPLEMENTED BUT UNVERIFIED | |
| ECON-GATHER / BUTCHER | hand `gather:` / `butcher:` | Interact prompt; progress from projection | work poses (gather, tend) | resource, carcass | IMPLEMENTED BUT UNVERIFIED | |
| ECON-PRODUCTION / FARM / HOUSEHOLD / BUILD | agent-only in the simulation | NPC work is shown as it happens (work poses from projected activity); no player entry exists | work poses | — | EXCLUDED (no player entry upstream) | matches the canonical matrix ("canonical-only") |

## 4. Construction and mechanisms

| ID | Source → command | Observation → web UI | Status | Evidence / gap |
|---|---|---|---|---|
| MECH-ALL / DORMANT | mechanism panel intents | Mechanism actions arrive as generic interaction rows | PARTIAL | no mechanism arises in generated worlds (upstream MECH-DORMANT), so nothing to exercise |

## 5. Knowledge and society

| ID | Source → command | Observation → web UI | Animation / audio | Persistence | Status | Evidence / gap |
|---|---|---|---|---|---|---|
| SOC-TALK / ASK / TELL / TEACH / DEBT | `talk`, `dialogue_option`, `dialogue_close` | Conversation panel: live portrait, transcript, options grouped into intentions, number keys, Esc | gesture/talk poses, voice babble | knowledge, debts | VERIFIED (talk, news, leave); ASK, TELL, TEACH, DEBT IMPLEMENTED BUT UNVERIFIED | talk prompt → panel → news reply in the transcript (`scenario/03-conversation.png`); the portrait rendered in one run and stayed blank for the first moments in another (see `KNOWN_DEFECTS.md` A7) |
| SOC-JOURNAL | `playerJournal` projection | Journal tab (condition, foundations, commitments, obligations, injuries, skills, veil, breakthrough) | — | server | VERIFIED (opens with the person's real values) | text-heavy; no topic navigation |
| SOC-HUNTWITNESS / CUSTODY | server rules | seen through consequences only | — | — | EXCLUDED (server-side) | |

## 6. Combat and development

| ID | Source → command | Observation → web UI | Animation / audio | Persistence | Status | Evidence / gap |
|---|---|---|---|---|---|---|
| DEV-COMBAT | `attack` light/heavy, `guard` held, `defend` sidestep/backstep/duck, focus, lock | Reticle, lock camera, target plate, effort/health | anticipation from the action's own timing, chained jab→cross / kick→kick, guard and dodge poses; swing/hit/guard sounds; camera kick; contact sparks | server outcome | PARTIAL | Inputs reach the server and are accepted; poses seen; rejected inputs cancel anticipation. Timed parry, multi-opponent, doorway and lock-release cases not evaluated; hit sparks only tested by construction |
| DEV-HUSH | `hush` | Q, or Abilities once taught | — | strain | IMPLEMENTED BUT UNVERIFIED | |
| DEV-MEDITATE / TRAIN / IRON | `person_action`, practice modes | Abilities tab, Practice mode buttons, Journal breakthrough | — | skills, veil | IMPLEMENTED BUT UNVERIFIED | |

## 7. Environment

| ID | Source → command | Observation → web UI | Animation / audio | Persistence | Status | Evidence / gap |
|---|---|---|---|---|---|---|
| ENV-SOUND | clock, weather, movement | — | synthesised ambience by hour/weather/indoors, footsteps by surface, combat layers | — | PARTIAL | runs without error; quality of the sound is a human judgement |
| ENV-WILD | wildlife projection | Roe deer, woodland boar, field hare with their own models and gait | quadruped gait, idle | server | VERIFIED (visual, automated) | showroom and in-world captures; encounters with a live boar were not scripted |
| ENV-TIME | region `worldTime`, `environment` | Sky, sun/moon, fog and weather from projected time; HUD clock and daypart | rain particles | server | PARTIAL | day, dusk and rain seen; night and storm not captured in-world |

## 8. Continuity

| ID | Source → command | Observation → web UI | Persistence | Status | Evidence / gap |
|---|---|---|---|---|---|
| CONT-RECONNECT | reconnect, `character=<id>` | Pause → Reconnect; automatic re-connect with back-off; "Signed in elsewhere" screen with an explicit take-back | same person, purse and belongings | VERIFIED (automated: same person, purse and belongings after Reconnect) | takeover parity with a native client is a unit test (`web-gateway.test.ts`); quitting and relaunching the browser was not run |
| CONT-SHARED | multiple bodies in snapshots | other people drawn, named plates | server | IMPLEMENTED BUT UNVERIFIED | two browsers cannot share one account (takeover, by design); a second account was not driven |
| CONT-OFFLINE | scheduler | world continues while the page is closed | server | VERIFIED (by design) | the client is not part of the simulation; differential test shows identical admission with or without it |

## Shell systems (not in the canonical matrix)

| System | Status | Evidence / gap |
|---|---|---|
| Launcher, preflight, gateway | VERIFIED | negative cases run (`EVIDENCE.md`) |
| Settings, rebinding, accessibility | PARTIAL | persisted and sanitised (unit-tested); reduced motion, large text, high contrast, colour assist, subtitles exist; UI legibility measured at 720p/1080p/1440p; rebinding and every setting were not each exercised by a human |
| Keyboard/mouse navigation of menus | VERIFIED (automated) | scenario opens Items/Abilities/Journal/Pause with keys |
| Gamepad | IMPLEMENTED BUT UNVERIFIED on hardware | injected-pad check only, clearly labelled (`EVIDENCE.md`); **no physical controller test** |
| Save / checkpoint | VERIFIED (automated) | Pause → *Save the world now* returns "The world is saved." |
