# Combat Arena (action-combat feel lab)

`Play Torn Veil Combat Arena.cmd`, or `http://127.0.0.1:7505/?arena=1` from the Combat Gym server, or `npm run web:dev` then
`http://127.0.0.1:5180/?arena=1`. The Combat Gym panel also has an **Open Action Arena** button.

Built to reproduce the reference combat-gym clips (psergiomr on X, Sept–Oct 2026): top-down melee against crowds,
furniture and pottery that burst into physical debris, hit-stop, sparks, combo meter, companions, level-up rewards.

**It is not canonical Torn Veil simulation.** It runs entirely in the browser (`src/web/arena`), with no World, bridge,
gateway, save or Observatory. It exists to tune how striking and smashing *feel*. The canonical Combat Gym (`?gym=1`,
docs/COMBAT_GYM.md) remains the authority on canonical combat. Porting any of these rules into `src/sim` is a separate,
deliberate step.

## Play

WASD move, mouse aim. LMB attack (hold to chain). RMB hold: whirlwind (greatsword) / guard + LMB bash (battleaxe) /
aimed shot (crossbow). Space dodge (i-frames, costs energy). 1/2/3 weapons. E (hold) revives a downed companion.
C toggles companions, N spawns more enemies, R rebuilds the gym with a new seed, L shows state labels, P pauses, H help.
Gamepad: left stick move, right stick aim, X/RT attack, LT/Y secondary, A/B dodge, LB/RB weapons, Start pause.

Waves of raiders run in: knife raiders, lamellar soldiers who parry frontal light hits (heavy attacks break the guard),
crossbowmen (red aim line, then a bolt) and robed mystics (slow orb with splash). Melee attacks are telegraphed by a red
crescent. Violent kills throw bodies, the dead lie where they fall and later sink away, and strong knockback into
furniture breaks it. The combo multiplier (x1.0 + 0.1 per 10 hits, max x2) boosts damage and resets 3.5 s after the
last hit.

## Characters and animation

Every fighter is a **realistic MPFB human** (MakeHuman base mesh, `game_engine` rig with UE-mannequin bone names)
dressed in MakeHuman community clothing, hair and skins. The cast is hero, Brann, Wren, raider, raider_f, soldier,
knight, archer and mystic; see `web/public/arena/people/CREDITS.md` for the CC0/CC-BY credits.
`art/tools/arena/build_arena_people.py` builds them headlessly in Blender with MPFB 2 and the asset packs listed in
its header installed into MPFB's user data folder. It makes skin, clothes and eyes opaque (hair, brows and lashes are
alpha-tested at runtime) and downsizes textures to 1024. `render_people.py` renders turnarounds from the exported GLBs.

**Motion is real motion capture**: the user's Mixamo packs (Great Sword, Sword and Shield, Pro Longbow, Locomotion,
Female Locomotion; 161 clips). `art/tools/arena/build_mixamo_clips.py` packs the unzipped FBX folders into
`web/public/arena/mixamo_clips.glb`:

    blender -b --python art/tools/arena/build_mixamo_clips.py -- <repo>/web/public/arena/mixamo_clips.glb "<unzipped Great Sword Pack>" "<unzipped Sword and Shield Pack>" ...

That file is **gitignored**: Mixamo animations may ship inside the game but are not redistributed as raw files in
this public repository. Without it the arena falls back to the CC0 KayKit clips (`kaykitFallback` in assets.ts).
At load, only the clips the game uses (`usedClips()` in combat.ts) are retargeted onto the MPFB skeleton
(`src/web/arena/retarget.ts`, `MIXAMO` map) by these rules:

- Per frame, each mapped bone's model-space rotation change from rest goes onto the matching human bone.
- Target rests are first swung to the source rest direction.
- Hips travel is scaled by hip height, with net horizontal drift removed so clips stay in place.
- All finger joints are mapped, so the captured grip closes the hand.
- KayKit is still the source for the held whirlwind loop and the revive stand-up (the `KAYKIT` map).

Each weapon has a moveset of idle, walk, run, hit reactions, deaths, block and guard (`MOVESETS`). Attack windows come
from the measured hand-speed peak of each clip (`strikeWindow`; dump all of them with
`npx tsx scripts/web/arena-clipinfo.ts`).

Weapon grips come from the hand's own geometry (`handGrip`: haft from little-finger to index knuckle, edge along the
knuckles). The bow sits in the left hand. Two-bone arm IK (`ik.ts`) remains available but is off, since the mocap
already has both hands on two-handed hilts. Use `npx tsx scripts/web/arena-poses.ts` to capture close-up
pose sheets of any clip.

## Weapons and props

- Weapons are the user's **Torn Veil Arsenal** (23 static GLBs, meters, grip at origin) in `web/public/arena/arsenal`:
  - Hero: Oathbreaker greatsword, Widow Cleaver battleaxe, Raven Mechanism crossbow.
  - Foes: Serpent Tooth, Bell of Ruin, Raven Mechanism, Elderroot.
  - Companion Brann: Execution Standard halberd.
- Props are CC0 KayKit Dungeon Remastered, Voronoi-fractured in Blender by `art/tools/arena/build_arena_props.py`, plus
  lathe-turned pots.
- Rebuild the KayKit-derived files with `node scripts/web/arena/fetch-kaykit.mjs`, then
  `node scripts/web/arena/build-arena.mjs --props`.

## Verification

`npx tsx scripts/web/arena-play.ts --name run --seconds 60` (dev server running) drives real mouse and keyboard input
in visible Chrome, aiming with the page projector. It writes video, stills and `report.json` to `.debug/arena/<name>`.
Last runs (2026-10-03, RX 6650 XT, 1280x720 WebGL2, human fighters), each with zero page errors:

- 60 s: wave 4, 33 kills, level 3, max combo 31, median 87 fps.
- 45 s: wave 2, 18 kills, 13 smashed, median 98 fps.

This is automation evidence, not a human playtest.

## Known limits

- Grip roll and placement are tuned by eye (`GRIP_ALONG`/`GRIP_PALM`). The whirlwind loop and revive are still KayKit motion. The CC0 wardrobe is small, so several roles share the viking chainmail set.
- People GLBs are 6-12 MB each (79 MB total) at 1024 textures.
- Props are KayKit's stylised furniture, so they read chunkier than the realistic people.
- Shadows are soft blob decals. Babylon directional shadow maps rendered casters, but no floor received them in this
  scene, with Standard or PBR materials, plain or cascaded generators, or with depth clamp on or off.
- Active windows per clip are hand-tuned, not measured from the weapon path.
- Debris has floor contact only (no piece-to-piece collisions). Old resting pieces sink away past 1,400.
