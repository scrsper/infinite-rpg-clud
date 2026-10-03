# Human checkpoint 1 — one conversation, a coherent village, readable movement

Course correction of 2026-09-28: human experience first. This checkpoint covers the four items
asked for before the next human review — (1) one polished NPC interaction, (2) a coherent
character lineup, (3) NPC movement, (4) player locomotion — and then STOPS for you to play it.
Combat, environment and every simulation-breadth item are deferred. Tests are not the acceptance
authority here: you are. Screenshots and videos are listed below; judge them and the game.

## How to play it

**Play:** `%USERPROFILE%\TornVeilAlpha\playtests\checkpoint-9a2aa61\Play.cmd`
(`C:\Users\green\TornVeilAlpha\playtests\checkpoint-9a2aa61\Play.cmd`)

- Client package: `C:\Users\green\TornVeilAlpha\clients\client-9a2aa61…` (Development, clean).
- Server: release `0.2.0-inhabit.11`, its own fresh world (seed 918271, generator `playable-3`),
  `C:\Users\green\TornVeilAlpha\checkpoint-human`, 127.0.0.1:7440. Nobody has played in it; no
  probe characters live there. `Play.cmd` starts it if needed and backs it up before each launch.
- Profile `human-inhabit8` (new man, "Aldric Vane"; the sign-in screen lets you begin the life).
- Untouched: the accepted package `client-450b7e5cbc80`, its shortcut and `Play Torn Veil.cmd`,
  staging 0.1.0-alpha.30 (7410), live alpha.12 (7400), and the older dev world (7430).
- The world runs at 6× real time. If you arrive at night the village is asleep; morning
  (06:00–11:00 world time) is the best time for the five-minute test.

## Five-minute test

1. **Look at yourself** (first 30 s). A grown man, fair skin, side-swept brown hair, a work kosode,
   hakama, sash, leg wraps and sandals. Nothing floating, no white slabs for feet, no mannequin.
2. **Walk / run / sprint** (1 min). Push the stick part way: a walk, from slow to brisk. Full stick
   or W: a steady run. Hold Shift (L3): sprint. **Caps Lock** toggles walking for keyboard.
   Crouch: Left Ctrl. Stop, turn, reverse. Watch the feet against the ground.
3. **Find someone and talk** (2 min). Walk toward a villager. Over their head you should see their
   name and `[E] Talk` (A on a pad) — or, instead of Talk, *why* not (asleep, fleeing from danger,
   won't speak with you, move closer). Press E: you stop and turn to them, they stop and turn to
   you, the camera frames them, they gesture as they talk. Ask "Who are you?" and "What's the
   news?", then Goodbye (or Esc): control returns at once and they go back to what they were doing.
4. **Watch the village** (1.5 min). People walk their errands (no routine running), stop at
   destinations and work; nobody's head lolls sideways.

Please note anything that looks wrong, with the world time if you can.

## Evidence

All in `.debug/human/checkpoint-1-evidence/` (machine-local; licensed content, not committed).
Recorded with ordinary input (keys, stick values, mouse) by the journey probe, in the separate
evidence world (7450) at natural world time: no clock was advanced for any of it.

| File | What it shows |
|---|---|
| `1-interaction-packaged.mp4` | Packaged client `717baa8`, world 11:30. Arrival, walking to Silas Alder, a village child ("Move closer", then `[E] Talk`), E, the conversation (Who are you?, What's the news?), close, control back. Recorded before the last two fixes: here the name plate floats well above his head, and he does not turn round while talking. |
| `1a-name-plate-frame.png`, `1b-conversation-frame.png` | Stills from it. |
| `1c-interaction-final-build.mp4`, `1d-final-build-plate-and-talk.png` | **The candidate client `9a2aa61`**, world 07:50: the plate now sits just over the head. Honest caveat: at that hour the square was full of my own probe characters squatting at their arrival point, and the person spoken to is one of them (Jory Wynn), not a villager. |
| `1e-plate-over-head-editor.png` | Editor build of the same code: plate over Silas Alder's head. |
| `2-village-life-packaged.mp4` | Packaged client, 2 min 56 s. A short walk past the square and the sawpit, then watching the gathering by the square: villagers standing, squatting and lying, coming and going. |
| `3-player-locomotion-packaged.mp4` | Packaged client, 65 s: idle, slow stick walk, stick walk, stop, walk (toggle), walk turning, run, run turning, sprint, stop, reverse, strafe, crouch, crouch walk. |
| `4a-lineup-before.png` / `4b-lineup-after.png` | The player and the nearest distinct people, lit the same way. Before (inhabit.6): bald player, clay cloth, white foot slabs, balloon hakama, tilted heads. After: the player (left) and six villagers. |
| `5a-activities-before.png` / `5b-activities-after.png` | One clone of the player per activity: idle, talk, trade, work, chop, carry, drink, eat, seated, asleep, travel, injured. |

The packaged runs report frame time p95 38–49 ms on this machine (Development build, recording on).

## What changed (branch `claude/inhabitable-alpha`, `27d865f..9a2aa61`)

**1. Talking to someone** (`d47d911`, `0c3e2a4`, `22bf89e`)
- The prompt is a name plate over the person: name, then `[E] Talk`; chosen locally each frame
  by distance, camera direction and visibility, as before.
- Someone who cannot talk shows the reason in place of the verb, and pressing E says it at once:
  asleep, fleeing from danger, won't speak with you, move closer. The server returns the same
  reasons (`talk_asleep`, `talk_fleeing`, `talk_refuses`, `talk_too_far`); nothing fails silently.
- While spoken to, the person stops (unless their errand is urgent: flight, an alarm, a report, a
  rescue), turns to the speaker and plays a talking gesture; the errand resumes afterwards.
- Someone busy in place (working, resting, eating) also turns to face you while you talk (`9556da5`).
- The name plate sits just above the drawn head and follows it as the camera turns (`c61814d`,
  `9a2aa61`); it had floated a building's height up, and lagged in hitches.
- The player turns to the partner; the camera swings far enough past a close partner (a child,
  someone at arm's length) that they are not hidden behind the player's own back (`e403bb3`).
- The "Confirmed" toast after every command and the "Input arrived too late" toast for dropped
  movement samples are gone. A homeless traveller no longer says "I live at someone".

**2. Characters** (`1a14d5c`, `0497b22`, `6f11313`, `b88de2d`, `c96c774`)
- Family chosen: City Sample Crowd heads, bodies and hair (the only realistic humans installed)
  with the generated Ashford wardrobe. City Sample's own clothes are modern office wear; Polytope
  is low-poly (a 596-triangle head); Quantum is modern military. Consistency over variety.
- Player default (canonical tokens only, never asset paths): grown man, fair skin, side-swept
  brown hair, blue eyes, average frame, above-average height, the working kosode and hakama.
- One family only (`4604751`): with every pack in the catalogue, 11 of 128 villagers resolved to a
  Polytope body with no head, clothes or shoes (a pale doll figure), and City Sample office clothes
  and Quantum kit were eligible too. The checkpoint worlds use a catalogue restricted to City
  Sample people in Ashford dress: all 128 resolve fully.
- Faces now match their described complexion (each City Sample face tagged from its colour atlas).
- Cloth: a woven fabric material instead of flat clay colour (it had also been failing to compile,
  which drew the engine's grid material on every garment).
- Feet: every footwear piece is also a knee-high leg wrap in the dusty hem colour (the body pack has
  no lower legs, which is what floated sandals under empty trouser legs); no white slabs.
- Hakama narrowed (was two barrels); collar band laid flat as a V (was a rope crossing in an X);
  sash snug (was a padded ring).

**3. People moving** (`0eee46a`, `7832915`)
- Errands are walked (2.05 m/s; elders 1.5); only urgency runs. The old 3.2 m/s "walk" was a jog.
- NPC bodies move continuously toward their canonical position instead of in stop-start steps.
- Activities use captured motion from the installed packs instead of sine-wave wobbles: talking
  gestures, a bargaining gesture for trade, a two-handed tool swing for chopping and field work, a
  pick-up for gathering and harvest, a flinch for someone cornered while fleeing.
- Tilted heads and leaning bodies: a travelling person is drawn by locomotion, not a frozen sprint
  frame; the talking clips keep their arm gestures but only a third of the head and part of the
  trunk motion (`7832915`, `ac33c9c`); and the worst case, people **sitting** on the ground or
  **asleep**, who were drawn standing and bent over by the old procedural loops, now squat on their
  haunches or lie on their back (`6a4f3fb`; nothing installed sits or lies, so the lying pose is
  built from the idle and verified by bone geometry).
- The person spoken to stops and faces you (above) and does not run off afterwards.

**4. Player locomotion** (`0eee46a`)
- Two gaits at the paces their captured cycles were recorded at, instead of a 3.4 m/s half-walk,
  half-run: stick part way = walk (slow to brisk), full = run (4.5 m/s), Shift = sprint (~7 m/s).
  Caps Lock toggles walking on a keyboard. Existing start/stop/pivot transition clips unchanged.

**Tools:** TV.RecordVideo (evidence video with the UI), TV.Lineup, journey probe walk / talk-only /
locomotion showcase modes (`93bd60a`, `2ce4d47`, `6208598`).

**One test change:** `capability-continuity` allows 1800 s instead of 900 s for a method to be
reproduced, because at walking pace the reader's thirst, hunger and a nap now come first
(measured 179 s → 1177 s). The favour trace's control group was the recipient's own kin; it is
now someone owed nothing at the time (`ea2c6a8`); its assertion is unchanged.

Tests: full suite 1278/1279 → the one failure (a seat-walk speed change) was reverted, and the
affected files re-run green; native TornVeil.Presentation 17/17.

## Known defects (not fixed in this checkpoint)

- Garments are still generated, low-detail shapes. They read as a costume, not tailored cloth;
  the next step would be sculpted garments or a licensed period wardrobe.
- First names are drawn from one unisex pool (a woman may be called Galen, a man Rhea), by design
  of the world generator, which this checkpoint does not change.
- No captured jog cycle is installed: between a brisk walk and the run the body blends the two
  cycles for the moment it accelerates. Strafing turns the body to face travel (no strafe cycle
  outside guard or lock-on).
- Eating, drinking and carrying still use the old procedural arm loops (no captured clips for them
  are installed). Seated people squat rather than sit (no sitting clip; no chairs or benches are
  used), and the lying pose is the idle turned onto its back: straight, arms at the sides.
- Homeless travellers (other players' people while they are away) rest and sleep in the open by the
  square, and villagers gather round them.
- Fenwick is small (about twenty people nearby); the square is quiet in the morning, busier at
  midday and the tavern in the evening.
- Every new male player starts from the same default face and hair (the look is chosen, not
  rolled); several players side by side look alike until a character creator exists.
- The evidence videos show my probe characters (homeless travellers) resting and sleeping by the
  square with villagers gathered round them; your world has no such characters.
- The older dev world (7430) is crowded with about twenty of my probe characters; it is not used
  for this checkpoint.
- Frame time in Development builds with recording on: p95 around 45–50 ms on this machine.
