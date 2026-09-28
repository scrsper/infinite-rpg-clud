# Inhabitable alpha — candidate manifest

The current candidate for the consolidated alpha brief. It is a **playable checkpoint**, not a
complete implementation and not an accepted alpha: coverage is incomplete
(`docs/SIMULATION_TO_PLAYER_COVERAGE.md`), and no human acceptance has taken place.

## Identity

| | |
|---|---|
| Branch | `claude/inhabitable-alpha` (pushed; no PR yet; nothing merged) |
| Packaged client | `%USERPROFILE%\TornVeilAlpha\clients\client-4333a46` — Development, `dirty: false`, revision `4333a462c5c3`, built 2026-09-28T03:38Z |
| Server release | `0.2.0-inhabit.4+4333a462c5c3` (`%USERPROFILE%\TornVeilAlpha\releases\…`) |
| World | isolated dev world (`TORN_VEIL_ALPHA_HOME=%USERPROFILE%\TornVeilAlpha\dev-inhabit`, `--env dev`), seed 918271, 127.0.0.1:7430, loopback only |
| Launch | start the dev service (`node <release>\ops.mjs start --env dev`), then run `client-4333a46\Windows\TornVeilOnline.exe` with a dev profile from `ops account add … --env dev` |

Protected and untouched: the accepted package `client-450b7e5cbc80` and its shortcut, the live
world, and staging `0.1.0-alpha.30` (port 7410). The dev world has its own write authority; nothing
here writes to live or staging.

## Evidence (packaged)

| Run | What happened | Labels |
|---|---|---|
| `.debug/inhabit/journey-package-04` | Sign-in → begin a new life (Ivo Brannock) → walk to the nearest person → talk → Trade → "Nothing today" → next person → Trade → buy bread (4s) → Goodbye → inventory → Eat. Hunger 20%→0%, silver 20→16. 32.9 s. | package, automated ordinary input |
| `.debug/inhabit/journey-package-04-reconnect` | Relaunch, continue the same person: 16 silver, hunger 0, empty hands, thirst 21%. | package, automated |

Frames reviewed by eye: entered, trade menu (grouped goods), ate (inventory). Props textured; UI
legible. Defect seen: villagers' faces green-grey — cause found (the cookable head copy lost the
vendor instances' static switches that select the skin atlas) and fixed at `02903b1`; packaged
re-check pending.

Non-package evidence: full suite 1265/1265 at `2d7f7f9`; later sim changes (trade rows, arrival
spacing) pass their own tests; native lighting tests 16/16.

## Known defects and gaps (unresolved)

- Mechanisms dormant in generated worlds (0 assemblies after 7 days, 3 seeds); no ordinary player
  mechanism panel.
- Numeric NPC name suffixes ("Rhea Ives 2"); conversation camera low and close.
- No packaged night frame yet; sound, p95 frame time, multi-seed review and a two-player
  shared-world check not yet done for this candidate.
- Native journeys for haul, protection and butchery not yet run (unit/accel only).
- Canonical `skinTone` not mapped to the face atlas.

## Next executable task

Package `02903b1`, re-run the packaged journey and review faces; then isolate the invention stall
after `compose` (`.debug/inhabit/compose-trace.ts`).
