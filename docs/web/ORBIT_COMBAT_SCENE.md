# Playable elevated camera and combat scene

## Launch

Double-click `Play Torn Veil Camera Combat.cmd` in the authoritative Desktop checkout. It reuses `.debug/orbit/bundle`, building it only if absent, then opens a real Chrome window against a **new disposable local world**. Close that Chrome window or press Ctrl+C in the launcher to stop the owned services and remove the owned temporary world. Relaunch for a fresh scene. No retained user world, save, profile or credential is opened. `scripts/web/Play-CameraCombat.ps1 -CheckOnly` verifies the local launcher prerequisites without starting anything. Fresh checkouts need the established dependencies and `npm run web:assets` output.

The scene starts on clear, reachable ground beside the nearest canonical tavern, with its real narrow doorway, furnished interior and tall exterior walls. One hostile person is placed on reachable open ground. Existing hostile persons are reused when available; this seed has none, so the launcher creates the existing Skarn cast with `makePerson`, `makeBody` and `seedStartingSkills`. This is disclosed scenario initialization, not a new simulation mechanic. Ordinary cognition, movement, attacks, damage, perception and consequences continue afterward. The scene is deliberately dangerous: Skarn is autonomous, can attack and can defeat the player. Civilians and the rest of the canonical procedural world remain active.

Use WASD/arrows to move relative to the camera, Shift to sprint, **middle-button drag** to orbit through 360 degrees and tilt, and wheel to zoom. F toggles lock-on; H/left click strikes, G makes a heavy strike, B/right click guards and Space dodges. E interacts; I/J open inventory/journal; Escape closes menus. The lock camera widens with separation and frames the player/target together. Gameplay tilt spans roughly 18–60 degrees and requested exploration zoom spans 4–14 metres; physical obstructions can pull the camera closer. Conversation retains the existing shoulder framing.

Settings → View → Elevated exploration also enables the camera in ordinary play. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/web/Play-Web.ps1 -View orbit` uses the established retained, isolated web-quality preview and a separate gateway on 7493. That command is **different from the disposable scene launcher**. Close another client using the same account before playing.

After later source edits, stop sessions serving this bundle before rebuilding:

```powershell
node node_modules/vite/bin/vite.js build --config vite.web.config.ts --outDir ../.debug/orbit/bundle
node --import tsx scripts/web/playable-scene.ts
```

## Presentation and boundaries

The view reuses the existing licensed clothed character kits, ground/structure materials, scanned textures, environment, atmosphere, shadows, grading and animations. The scene selects the existing late-afternoon lighting override (`hour=16`); canonical time and events continue normally. No new art service, purchase, upload, model installation or MPFB import was needed.

Occupied or view-blocking buildings use the existing material clip cutaway. It is a reversible upper-wall/roof cut, **not a new translucent fade system**. Secondary doors now derive their building association from existing indoor bounds when the primary entrance lookup does not match. Camera collision ignores only upper indoor geometry eligible for that same cutaway; canonical walls, doors and movement collision remain intact. Other geometry and vegetation retain existing camera obstruction behavior.

No source in `src/sim`, Unreal code/assets, retained saves or original VRoid ZIPs changed. There is no public hosting, merge, push or new PR. The new local branch starts at verified `8084a3bbef9b7ec70c7626c90300ec06e6c79cd8`.

## Evidence and practical limits

Real Chrome acceptance and scene evidence are in `docs/evidence/orbit-combat-scene`. The shared isometric harness accepts `TVO_CAMERA_VIEW=orbit`, `TVO_ISOMETRIC_BUNDLE=.debug/orbit/bundle`, and `TVO_ISOMETRIC_EVIDENCE_DIR=docs/evidence/orbit-combat-scene`. It verifies orbit/zoom, camera-relative walk/sprint, menus, grounded dialogue/trade, closed-door opening, actual keyboard interior entry/traversal/exit/reentry, unobscured player and locked target, canonical contact/damage, dodge, reversible cutaways and stable scene resources through repeated camera switches. It records a playthrough video as well as screenshots. Positioning for dialogue, the doorway start and the nearby upright combat actor remain disclosed disposable fixtures; these are automated input checks, not human or physical-controller acceptance.

`TVO_SCENE_VERIFY=1 node --import tsx scripts/web/playable-scene.ts` launches the actual scene, captures actor/region readiness, a screenshot and bounded rendering telemetry, then closes it. Initial placement uses canonical navigation and clear-body checks. Neither it nor screenshots replace the canonical hit assertion in browser acceptance.

The first orbit pass exposed fixed-isometric assumptions in movement assertions; they now measure displacement against the actual camera basis. The following pass exposed a genuinely unregistered secondary door and missed lock acquisition behind the camera. Both presentation defects were repaired without weakening damage or visibility assertions.

This is a bounded playable camera/combat slice, not finished Diablo IV-level art. Character silhouettes, furniture, repeated terrain and vegetation remain visibly prototype quality. The MPFB test rig was not used because its deformation/import quality is not established. Cutaway coverage is verified at one tavern; other layouts, vegetation occlusion, long sessions and physical gamepads remain unverified. The known multi-day construction-supply and bandit-hunger issues remain outside this task. Full simulation, Unreal and remote CI suites were not rerun for these presentation/scenario-only changes; final relevant web tests, typecheck and private build provide the scoped verification.
