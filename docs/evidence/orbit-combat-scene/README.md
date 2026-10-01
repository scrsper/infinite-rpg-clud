# Elevated camera/combat scene evidence

Final real Chrome acceptance: **22/22 PASS**, no browser errors, no inference requests. Eight focused web files passed **58 tests**; the final conversation-return/shoulder-preservation changes then passed all six camera tests. Final typecheck and private 3,346-module production build passed. `verification.json` records source/artifact fingerprints, scope and unverified checks.

The actual human-playable launcher also passed actor/region readiness. The autonomous Skarn opponent issued canonical attacks; player health fell from 80 to about 63.38, with recorded attack contact/event IDs. Skarn uses the existing authored cast through canonical factories because this procedural world contains no pre-existing hostile person. No test applies damage.

- [Actual playable courtyard](06-playable-courtyard.png)
- [Interior entry](04-isometric-cutaway.png), [traversal](04b-interior-traversal.png), [exit](04c-interior-exit.png)
- [Interior combat](05-interior-combat.png)
- [Recorded automated playthrough](orbit-playthrough.webm)
- [Browser checks](browser-evidence.json), [playable scene state](playable-scene.json)
- [Launch and scope documentation](../../web/ORBIT_COMBAT_SCENE.md)

Screenshots were visually reviewed. The video records automated trusted input, including disclosed initial positioning for dialogue, doorway travel and the upright melee target. It is not human acceptance. The video export initially failed after browser closure; the final harness copies the completed recording and guarantees owned-service cleanup, verified with exit 0. The final artifact was refreshed by that corrected harness.

Scene resources stayed at 1,006 meshes / 135 materials through six projection round trips. FPS entries are bounded engine telemetry from one machine and recording session, not performance benchmarks. Prototype art remains apparent; this is not a claim of AAA visual fidelity. Roof/wall visibility uses reversible clipping, rather than translucent fading. Broader building layouts and vegetation occlusion remain unverified.
