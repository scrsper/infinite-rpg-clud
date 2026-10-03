# Web client — evidence

What was actually run, what it showed, and what it does **not** show. Everything below was produced on
2026-09-29 against the isolated preview world (dev environment, seed 918271, ports 7460/7470, its own state,
accounts and backups) — never live, staging or the accepted package. Raw files are under `evidence/`.

**Labels used throughout.** *Automated* = a script drove real headed Chrome with ordinary trusted
keyboard/mouse events (Playwright), or unit/integration tests. *Injected* = a script-controlled stand-in for a
gamepad. **Neither is a human playtest, and nothing here is a physical-controller test.** No human has played
this client (`HUMAN_TEST_GUIDE.md`).

## 1. Automated tests

| Scope | Result |
|---|---|
| `tests/web-*.test.ts` (gateway 12, structures 4, browser boundary 7, client logic 12, quality governor 6, differential admission 4) | 45 / 45 pass |
| Full suite `npx vitest run` (Windows, low priority, 3 workers, while a browser soak ran; run mid-session, before the last ~15 commits) | 153 of 154 files, 1300 of 1301 tests passed; the one failure was a 5 s timeout under load (passes alone). **Not re-run on the final commit** (see below) |
| Typecheck `npx tsc --noEmit -p .` | clean |
| Baseline for comparison (`BASELINE.md`, at `9556da5`) | 151 files, 1280 / 1280 |

The one failure seen in the load-contended full run was `tests/animal-defense-retreat.test.ts` timing out at its
5 s limit while creating a world under CPU contention; it passes alone (4.5 s). Timeouts were not raised.

**Security and isolation** (`web-gateway.test.ts`): loopback-only bind and upstream allowlist; single-use launch
link (replay refused, bogus refused, expired refused); session cookie flags; socket refused with no session, foreign
origin, missing origin, wrong port, rebinding host; expired session cannot open a socket; no admin/debug route and no
credential in any response or stream; forbidden message types (including `debug_inspect`) dropped; oversized and
flooding browsers closed; server refusals relayed with their own code; a second browser takes over exactly like a
second native client; a browser asking for another account's character is refused and nothing of that character
reaches it; `web` refused when the environment has not opted in. Not covered: a hostile-client fuzz run and a
slow-reader backpressure test (the 2 MiB slow-browser cutoff is implemented, not tested).

## 2. Baseline vs new: differential admission

`tests/web-differential.test.ts` builds two isolated same-seed worlds. The same 18 scripted intents in the same
order run through the **native-style probe client** on one and through **a browser via the gateway** on the other:
six single-step moves, a sprint step, guard on/off, a sidestep, an attack with nobody there, an unknown command
type, a stale epoch, a foreign body id, talk to nobody, a dialogue option with no dialogue, a hush at a non-target,
and a save. Rejections are compared, not discarded.

Result: **identical admitted/rejected result for every command, in order** (11 `applied:accepted` and 1 `saved`;
3 commands `rejected` — invalid command, stale epoch, foreign body — and 3 intents refused — `interaction_unavailable`, `no_dialogue`, `unknown_technique` — with the same reasons on both), the same person created (name, sex, world population), and
the **same final position to three decimals** after the same admitted moves
(x 12035.763, y 24, z 20007.562 on both). Scope: fresh same-seed worlds and immediate canonical effect; a long
session, restart and save/reload cycle were not run through both transports.

`tests/web-structures.test.ts` shows the native region projection is **byte-identical** with and without the web
detail (the web `structures` field is additive and only sent to the `web` kind). `git diff c8eaba2..HEAD -- src/sim`
is empty (`CHANGE_LANES.md`).

## 3. Ordinary-input scenario (automated)

`scripts/web/scenario.ts`, real Chrome/WebGPU, production bundle, keyboard steering from the spawn area:

| Step | Result |
|---|---|
| Enter the world with the existing character | ok |
| Walk to a person; a talk prompt appears; E opens the conversation | ok (`scenario/03-conversation.png`) |
| Panel shows name, live portrait, transcript, options grouped into intentions | ok |
| Number key chooses an option and the reply is appended to the transcript | ok |
| Trade lists goods with price and stock; **a purchase asks for confirmation first** | ok (`06-confirm.png`) |
| Confirm: purse falls (16 → 14 silver), the bread is in Items | ok |
| Items → *Eat bread*: consumed, Energy rose to 100 % | ok (`07a-items-with-purchase.png`) |
| Abilities, Journal open with the person's real data | ok |
| Pause → *Save the world now* reports "The world is saved." | ok |
| Pause → *Reconnect*: **same person, same purse, same belongings** | ok |
| Console errors during the run | 0 |

The full pass above was recorded at commit `63d9edb` (morning in the world's clock, villagers in the square). Three
later re-runs after further changes (affordability marking in trade, bounded cloth-print cache, static cache policy)
did **not** reach a conversation: it was afternoon and stormy in the preview world, nobody was outdoors, and the
account's character limit (3) prevented starting a fresh character beside the village. The steps that do not need a
person (menus, save, reconnect, purse/belongings unchanged) passed in those runs. So the talk → trade → eat path is
verified on `63d9edb`, and only unit-tested (price parsing, cost reading, confirmation rules) on the commits after it.

This run found and fixed two real defects that unit tests could not: carried items showed the word "undefined"
(the client read `label`, the server sends `name`; the row types are now taken from the server's own definitions so a
renamed field fails compilation), and trade rows worded "(4s each, 9 to be had)" were not recognised, so they showed no
price and **skipped the confirmation** (fixed and unit-tested for every wording the dialogue system uses).

Also observed on the way: creating a fourth character on the preview account is refused with a clear
"Character limit (3) reached" screen and a way back (`evidence/scenario/character-limit.png`).

## 4. Long ordinary-input session (automated soak)

`scripts/web/journey.ts` walks, sprints, turns, converses when standing next to someone, opens menus and strikes,
guards and dodges, seeded and unscripted-looking but not a person. Two runs (see `PERFORMANCE.md` for the numbers):

- **45.1 min** on an earlier build: no disconnect, ~7 km of travel, flat heap, one materials/textures step-up
  that led to the leak fix. The walker steered by mouse, which turned out not to steer at all (synthetic pointer
  deltas are relative), so it wandered instead of visiting villages: **it never reached a conversation** (talk = 0).
- **40.1 min** on a later build with keyboard steering: 59 legs between settlements, 63 walks, 36 sprints, 22 menu
  openings, 53 strikes, 14 guards, 17 dodges, 91 interact attempts, **1 conversation**, no disconnect, 0 console errors,
  0 snapped prediction corrections, worst frame 87 ms. It exposed a texture/heap leak (cloth prints cached without release;
  see `PERFORMANCE.md`). The fix was made afterwards and has **not** been re-soaked.

What this does not exercise: a full first-hour arc (find work, train, fight something, recover, return), nor
danger (no boar encounter was scripted), nor a night session. The mandate's 45–60 minute *ordinary session with
persisted consequences* is therefore only partly met: the stability part is; the meaningful-play part rests on the
scenario above and on the human test.

## 5. Gamepad (injected — not a physical controller)

`scripts/web/pad.ts` replaces `navigator.getGamepads()` with a script-controlled standard-mapping pad. 17 / 17
checks passed: prompts switch to controller glyphs; left stick walks (5.9 m in 2 s); right stick turns the camera;
drift inside the dead zone does nothing; X = light strike, Y = heavy strike; LB holds/drops the guard; B with the
stick sideways sends a directional dodge; D-pad opens Items; RB/LB switch tabs; B closes menus; Menu opens the
pause menu; View opens the Journal; unplugging the pad while the stick is held stops movement and reverts prompts
to the keyboard. This proves the code path. It says nothing about a real pad's mapping, dead zones, vibration,
comfort, or any browser's own quirks. Physical-controller acceptance is **pending**.

## 6. UI legibility at 720p / 1080p / 1440p (automated measurement)

`scripts/web/uicheck.ts` measures the rendered size of every visible text node on the title, HUD, Items, Abilities,
Journal, pause and settings screens, and checks for overflow or off-screen boxes.

| Size | Root text | Smallest text (HUD labels, key caps) | Body text | Overflow / off-screen |
|---|---|---|---|---|
| 1280×720 | 17 px | 14.2 px | ≥ 17 px | none |
| 1920×1080 | 17 px | 14.2 px | ≥ 17 px | none |
| 2560×1440 | 22.7 px | 18.9 px | ≥ 22 px | none |

The first measurement found HUD meter labels at 11.6–12.2 px; the text floor was raised (nothing under 14.4 px at the
base size, body 17 px) and 720p no longer scales below 17 px. Whether the layout *reads* well is a human judgement.
Contrast, subtitles, large text, reduced motion and colour-vision settings exist but were not each verified.

## 7. Launcher

`Play Torn Veil Web.cmd` / `scripts/web/Play-Web.ps1`, run for real:

- Preflight against the preview world: Node, tsx, client bundle + models, profile, world `/health`, world config
  `webGateway`, gateway port. Passes; `-CheckOnly` starts nothing.
- Negative cases exercised: a profile pointing at a dead port → "No world service is answering… this launcher
  never starts a world"; a profile pointing at `10.0.0.5` → refused (loopback only); a missing profile; a port
  already used by another process; a bundle missing its models (caught the first stale build); a stale bundle warning.
- Start path: starts the gateway (recognised by its state file, since `tsx` runs it in a child process), mints a
  single-use launch link, reuses a running gateway on a second run.
- Not exercised: opening the default browser via the launch link from the `.cmd` (a human step), and pointing it at the
  live or staging worlds (deliberately not enabled).

## 8. Visual evidence (real runtime images)

`evidence/art/` holds screenshots taken from the running client, at the commit noted in each file's name in
`evidence/README.md`. They are evidence of *what rendered*, not of quality: settlement and square in daylight,
conversation and trade UI, inventory/abilities/journal, hero turnarounds, villager lineup, poses, wildlife, the four
labelled concept previews, night with lantern light and rain, WebGL 2 fallback, and 720p/1080p/1440p UI. Concept art
is never presented as gameplay. A comparison against the two reference sheets is a human call; my own assessment is
in `STYLE.md` and `KNOWN_DEFECTS.md` (art is prototype-level, not reference-level).

Side-by-side with the Unreal client was **not** produced: no native client was run in this session. A recorded
observer-filtered stream (`?replay=`) is supported by the web client for comparisons without a second controller.

## 9. Not run, and why

| Not done | Reason |
|---|---|
| Human playtest, physical-controller test | No human/device in this session — pending |
| Unreal retention checks | No Unreal Editor or packaged native journey was run; only that no Unreal file changed and the Unreal launcher is untouched |
| Native vs web side-by-side screenshots | No native run |
| Lane B (vault/dive) | Not started (`EXTENSIONS.md`) |
| Restart / disaster / update drills through the gateway | Out of scope for this slice; the world service is unchanged |
| Hostile-client fuzz, slow-reader backpressure test | Implemented limits, not exercised beyond the gateway tests above |
| Other GPUs / browsers | One machine, Chrome only (WebGL 2 fallback tested in the same Chrome) |
