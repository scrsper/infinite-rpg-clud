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

WASD move, mouse aim. LMB attack (hold to chain). RMB hold: whirlwind (greatsword) / shield guard + LMB bash (axe) /
aimed shot (crossbow). Space dodge (i-frames, costs energy). 1/2/3 weapons. E (hold) revives a downed companion.
C toggles companions, N spawns more enemies, R rebuilds the gym with a new seed, L shows state labels, P pauses, H help.
Gamepad: left stick move, right stick aim, X/RT attack, LT/Y secondary, A/B dodge, LB/RB weapons, Start pause.

Waves of KayKit skeletons rise from the floor: minions (blades), shield warriors (block frontal light hits; heavy
attacks break guard), crossbow rogues (red aim line, then a bolt), mages (slow orb with splash). Melee attacks are
telegraphed by a red crescent. Kills burst skeletons into their baked body parts. Strong knockback into furniture
breaks it. The combo multiplier (x1.0 + 0.1 per 10 hits, max x2) boosts damage and resets 3.5 s after the last hit.

## Assets

CC0 KayKit packs by Kay Lousberg (www.kaylousberg.com): Character Pack Adventurers, Character Pack Skeletons and Dungeon Remastered.
They are rigged with about 100 baked clips each (2H/1H melee, block, dodge, hit, death, ranged, spawn). Rebuild:

    node scripts/web/arena/fetch-kaykit.mjs          # sources -> art/source/kaykit (ignored)
    node scripts/web/arena/build-arena.mjs --props   # characters pruned to used clips; Blender props + weapons

`art/tools/arena/build_arena_props.py` (Blender 5.2, headless) Voronoi-fractures every breakable prop into chunks,
using bisect cells with an inner-wood/clay material on cut faces. It lathe-turns the terracotta pots the dungeon pack
lacks and exports `props.glb` / `weapons.glb`. Outputs in `web/public/arena` are committed.

## Verification

`npx tsx scripts/web/arena-play.ts --name run --seconds 60` (dev server running) drives real mouse and keyboard input
in visible Chrome, aiming with the page projector. It writes video, stills and `report.json` to `.debug/arena/<name>`.
Last run (2026-10-03, RX 6650 XT, 1280x720 WebGL2): 4 waves, 48 kills, 10 props smashed, level 3, max combo 37,
576 debris pieces live, median 135 fps (p10 96), zero page errors. This is automation evidence, not a human playtest.

## Known limits

- Shadows are soft blob decals. Babylon directional shadow maps rendered casters, but no floor received them in this
  scene, with Standard or PBR materials, plain or cascaded generators, or with depth clamp on or off. Investigate
  before re-enabling.
- The Knight hero and skeletons are KayKit's stylised chibi characters, not the Torn Veil human kits. Retargeting
  these clips onto the 49-bone kit rig, which has no clips of its own, is the path to the game's own people.
- Active windows per clip are hand-tuned, not measured from the weapon path.
- Debris has floor contact only (no piece-to-piece collisions). Old resting pieces sink away past 1,400.
