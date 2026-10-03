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

The bodies have no clips of their own, so the combat moveset comes from the CC0 KayKit Skeleton Warrior rig (51 clips:
2H/1H melee, block, dodge, hit, death, ranged, taunt). It is **retargeted at load** (`src/web/arena/retarget.ts`):

- Each frame, each mapped bone's model-space rotation change from rest is applied to the matching human bone.
- Each target bone is first swung to the source rest direction, which handles T-pose versus A-pose rests.
- spine_02 and the neck blend from their neighbours; the clavicles follow the chest.
- Hip travel is scaled by hip height.

Weapon grips are derived from the KayKit hand slots. After animation, two-bone arm IK (`ik.ts`) seats the off hand on
two-handed hafts, and the fingers get a closed grip. Use `npx tsx scripts/web/arena-poses.ts` to capture close-up
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

- Retargeted motion comes from a stylised rig: poses read as human but are broader than mocap; real sword mocap
  (Mixamo, downloaded by the user) would be the next quality step. Finger curl is constant, and the off-hand IK covers
  two-handed melee only, not the crossbow. The CC0 wardrobe is small, so several roles share the viking chainmail set.
- People GLBs are 6-12 MB each (79 MB total) at 1024 textures.
- Props are KayKit's stylised furniture, so they read chunkier than the realistic people.
- Shadows are soft blob decals. Babylon directional shadow maps rendered casters, but no floor received them in this
  scene, with Standard or PBR materials, plain or cascaded generators, or with depth clamp on or off.
- Active windows per clip are hand-tuned, not measured from the weapon path.
- Debris has floor contact only (no piece-to-piece collisions). Old resting pieces sink away past 1,400.
