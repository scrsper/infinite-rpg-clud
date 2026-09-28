# Inhabitable alpha — candidate manifest

The current candidate for the consolidated alpha brief. It is a **playable checkpoint**, not a
complete implementation and not an accepted alpha: coverage is incomplete
(`docs/SIMULATION_TO_PLAYER_COVERAGE.md`), and no human acceptance has taken place.

## Identity

| | |
|---|---|
| Branch | `claude/inhabitable-alpha` (pushed; no PR yet; nothing merged) |
| Milestone 1 packaged checkpoint | client `%USERPROFILE%\TornVeilAlpha\clients\client-4333a46` (Development, `dirty: false`, revision `4333a462c5c3`) with server release `0.2.0-inhabit.4+4333a462c5c3` |
| Later packages (evidence only) | `.debug/packages/client-02903b1` (faces), `.debug/packages/client-9502128` (conversation framing, frame timing), `%USERPROFILE%\TornVeilAlpha\clients\client-6468fc5` (twilight, naps, names) — all clean; `client-f5227fd` packaging |
| Dev server now | `0.2.0-inhabit.5+6468fc59b54e` (generator `playable-3`; switched with backup; the world's recorded `playable-2` fingerprint was accepted) |
| World | isolated dev world (`TORN_VEIL_ALPHA_HOME=%USERPROFILE%\TornVeilAlpha\dev-inhabit`, `--env dev`), seed 918271, generator `playable-2`, 127.0.0.1:7430, loopback only |
| Launch | start the dev service (`node <release>\ops.mjs start --env dev`), then run `<client>\Windows\TornVeilOnline.exe` with a dev profile from `ops account add … --env dev` |

Protected and untouched: the accepted package `client-450b7e5cbc80` and its shortcut, the live
world, and staging `0.1.0-alpha.30` (port 7410). The dev world has its own write authority; nothing
here writes to live or staging.

## Evidence (packaged, automated ordinary input)

| Run | Client | What happened |
|---|---|---|
| `journey-package-04` | 4333a46 | **Passed.** Sign-in → new life (Ivo Brannock) → talk → Trade → "Nothing today" → next person → buy bread (4s) → eat. Hunger 20%→0%, silver 20→16. |
| `journey-package-04-reconnect` | 4333a46 | **Passed.** Same person returned: 16 silver, hunger 0, empty hands. |
| `journey-package-05` | 02903b1 | **Failed** at world 15:45: the only seller in reach had ale; the route reached the tavern, bakery and well and found nobody new. |
| `journey-package-06` | 9502128 | **Failed** the same way at 18:00. Frame timing: p50 21.5 ms, **p95 30.6 ms**, p99 33.5 ms, 267 of 22,548 frames over 33.3 ms, max 3.6 s (screenshot frames included; this machine, Development build). |
| `journey-package-06-night` | 9502128 | **Passed** (observe only) at natural world 20:23 — no clock change. The frame was black but for one lit house (defect, below). The offline body had eaten and spent 9 silver while away. |
| `journey-package-07` | 6468fc5 | **Failed** at natural 02:53 (everyone asleep; a legitimate outcome at night). p95 33.7 ms — just over target, with the server slowed by a concurrent cook. |
| `journey-editor-night-hold-3` | editor, native | **Passed** (observe + 30 s hold) at 04:17–04:29: after exposure settles the night is readable; the camera no longer sits inside the player's own body. |
| `pair-package-A` + `-B` | f5227fd | **Passed.** Packaged two-client pair: mutual sight; B's sightings of A within 1.6 m of A's own path. |
| `journey-package-08` | 1aef56f | **Failed** at 07:30: the square's sellers had only ale; the probe spent its eight asks there. Sound played (3 loops, 90 footsteps). |
| `journey-package-09` | 729fb27 | **Passed** at 12:00 with sound: fresh arrival, route toward the tavern, bought bread 2s from Thora Stone (baker) and ate — hunger 20→0, silver 20→18; one coin and one eating cue; p95 31.2 ms. |
| `pair-A-oren` + `pair-B-sela` | editor, native | **Passed.** Two clients at once on the dev world: each saw the other's body; B's sightings of A lie on A's own path within 0.5–1.6 m. Dawn twilight frame at 04:58. |

Frame timing is measured with the probe's 60 FPS cap and offscreen rendering, screenshot frames
included; it is this machine's figure, not a hardware claim.

Frames reviewed by eye. Fixed from what they showed: green-grey faces (`02903b1`, confirmed in
05/06), a dialogue panel covering the person spoken to (`9502128`, confirmed in 06), a black dusk
(`9c61523`, packaged re-check pending). The failed journeys led to the nap fix below.

## Changes whose packaged verification is pending

- Newcomers could not buy tavern food 14:00–22:00: innkeepers, cooks and bakers napped from their
  afternoon break through the evening shift. A nap now ends when its sleeper is no longer tired and
  their scheduled duty begins (sim; unit test `nap-and-duty`).
- Generator revision `playable-3`: no generated person is named with a numeral; worlds recorded as
  `playable-1/2` (including dev, staging and live) keep their exact baseline (fingerprints pinned).
- Bald Updo wearers (local groom bindings generated) and a groom PSO ensure (`5fc7bcd`).
- Twilight and a reachable moonlight (`9c61523`; native frames confirm).
- Mechanisms in reach in the ordinary action panel; camera never inside a body; probe hold and
  shared-world record (`f5227fd`).

## Known defects and gaps (unresolved)

- Mechanisms do not arise in a week (they need a sustained shortfall; see coverage MECH-DORMANT);
  no ordinary player mechanism panel.
- Blocky pale footwear, some pieces floating detached from bodies (cause not found); sack props
  fail to compile; canonical `skinTone` not mapped to faces.
- Conversation framing crowds the partner under the panel when they stand very close.
- The dev world now holds a dozen offline probe characters (journey accounts a–l) who idle in the
  square — a testing artifact that inflates crowds there.
- The journey probe does not enter buildings, so "nobody new at the tavern" is partly a probe limit.
- Sound and a multi-seed review not yet done; the two-player check is native only (not packaged),
  and players have not yet contended for or traded the same goods.
- Players cannot start a mechanism (no player invention intent).
- Native journeys for haul, protection and butchery not yet run (unit/accel only).

## Next executable task

When `client-f5227fd` is packaged and the dev world reaches its natural evening (16:00–20:00), run
the packaged journey for tavern food and a dusk frame; then the packaged two-client pair.
