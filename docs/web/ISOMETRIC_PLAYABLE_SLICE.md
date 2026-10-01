# Isometric playable slice

The Babylon.js client has an optional fixed orthographic isometric view over the same canonical world. Third-person remains the default. This is a 3D presentation slice, not a pre-rendered sprite pipeline or finished art milestone. Unreal and canonical mechanics remain authoritative as before.

## Launch

On Bernhaldt, double-click `Play Torn Veil Isometric.cmd` in the authoritative Desktop checkout. Alternatively:

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/web/Play-Web.ps1 -View isometric`

The default uses the existing isolated web-quality development save on world port 7490 and a separate gateway on 7492, with bundle `.debug/isometric/bundle`. It preserves the third-person bundle and gateway on 7491. Existing saves are retained; ordinary launch prepares/starts the isolated preview only when absent/offline. CheckOnly starts nothing and requires an already-running world. The verified CheckOnly run stopped because 7490 was offline, with bundle/models present and 7492 free. No persistent preview world was started during validation.

The launcher refuses to rebuild a bundle while its gateway port is listening. It does not restart or kill services. The same account follows the existing client takeover policy; close its other client before playing. Fresh checkouts need installed dependencies and generated GLBs: `npm run web:assets` uses the existing Blender tools and checked-in CC0 VRoid sources. Generated GLBs remain ignored. Duplicate original ZIP archives remain local and untouched.

Camera view can also be changed in settings or selected with `?view=isometric`. WASD/arrows are screen-relative, Shift runs, wheel zooms, the pointer aims, E or the nearby prompt interacts, F locks a target, H/left click strikes, G makes a heavy strike, B/right click guards, Space dodges, I/J open items/journal, and Escape interrupts a menu/conversation. The view stays fixed through conversation and combat. Current attacks use the existing high trajectory; an upright human is a valid jab target, while low wildlife may require an existing low attack not yet exposed by this client.

## Boundaries and visibility

Input sends canonical movement, interaction and combat commands. UI never applies damage or purchase outcomes. Canonical collision still decides entry. Per-building material clipping removes occupied or view-blocking roofs/upper walls and restores them on return to third-person; it does not change collision, place identity or simulation state. Building meshes own their cloned materials, while texture resources remain shared. NPC/player equivalent mechanics are unchanged.

## Validation

- Private production build passed (3,346 modules); the served third-person dist-web was not rebuilt.
- Final typecheck passed. Eight web files passed 54 tests (42 in seven files plus 12 gateway tests), including doorway clearance, camera reversal, unlocked pointer input, canonical prediction and gateway admission.
- Real Chrome acceptance uses a disposable temporary world and ephemeral gateway. It passed walking/running, repeated menus, grounded dialogue, trade confirmation/cancellation/purchase, repeated interrupted conversation, real keyboard doorway entry with occupied cutaway, real canonical melee contact and dodge commands, and reversible view switching. Final settled-frame report is kept beside screenshots.
- The doorway fixture originally started at the cell corner, intersecting the adjacent wall. Cell-center staging plus actual keyboard travel passes; a regression retains the corner-blocked/center-passes distinction. The original high-jab boar fixture was unsuitable: canonical quadruped hurt volumes are low. The corrected upright adult fixture records head contact and health loss from 80 to about 74.4; no hit assertion or simulation rule was weakened.
- Full normal local regression passed 168 files / 1,811 tests before the loader/visibility follow-ups. Those follow-ups have their own focused evidence below; exact-head CI is recorded separately in the PR verification record. Specialized multi-day soaks, Unreal checks and human/gamepad acceptance were not run for this presentation slice. Previous Observatory AMBER limits remain unchanged.

`node --import tsx scripts/web/isometric.ts` reproduces browser acceptance after building the private bundle. Movement/menu flows use ordinary input; dialogue/combat positions and the doorway starting position are disclosed test fixtures, not proof of unattended travel or human acceptance. No saved user world/profile is used. The script closes only its own browser/server/gateway and removes its own temporary root.

## Scope and remaining limits

The dedicated branch preserves inherited Observatory and deterministic dialogue work in its ancestry, checkpointed before this slice (21be4e2); CC0 source/material assets are preserved in af9eab8. The main-targeted draft therefore includes inherited simulation and web changes, not just this presentation patch. No merge or deployment is part of this task.

Asset provenance is in `art/reference/web-rebirth/generated-texture-provenance.json`: four authorized generated PNGs match their original outputs byte-for-byte; the environment HDR is a recorded Poly Haven CC0 download. Existing material-manifest and VRoid license records remain in place. The Scenario iso-cycles page informed directional presentation only; no Scenario assets were downloaded or redistributed.

Art remains a prototype: repeated ground materials and small actor silhouettes need polish. The observed doorway occlusion is addressed by the bounded follow-up below; other furniture/layouts are not exhaustively verified. Screenshots are bounded evidence of this slice, not a final visual-quality claim. The authorized bounded interior visibility improvement and its entry/traversal/exit/combat evidence are recorded below. The inherited portrait is also badly framed and needs a separate presentation repair. Exposing the already-supported low strike for low wildlife is a subsequent bounded control task.

Reviewed screenshot evidence: [conversation](../evidence/isometric-playable-slice/03-isometric-conversation.png), [cutaway](../evidence/isometric-playable-slice/04-isometric-cutaway.png), [action](../evidence/isometric-playable-slice/05-isometric-action.png), and [canonical browser report](../evidence/isometric-playable-slice/browser-evidence.json). These intentionally retain the observed visual defects.

## Checkpoint worker loader follow-up

The first exact-head CI run (36817546294, 3b8f02b) passed install/typecheck but failed the normal suite: 163 files / 1,774 tests passed, five files failed, seven tests failed and 30 were skipped. Each failure shared an unknown .ts checkpoint-worker entry error. Build/smoke were skipped. Local Node 22 passed 168 files / 1,811 tests, and disabling native TypeScript on Node 22 still loaded the original worker; that probe did not reproduce the Node 20-specific CI behavior.

The source worker now starts from checkpointWorkerLoader.mjs and imports checkpointWorker.ts through the installed tsx tsImport API. Compiled releases retain their existing checkpointWorker.mjs path. Capture, owned buffers, packing, rejection, worker lifetime and CURRENT promotion are unchanged. The five affected suites pass all 38 tests locally, with unchanged durability assertions; typecheck passes. CI now checks the six checkpoint-worker tests on actual Node 20 and 22 before the normal gate. Run 36821844547 at 302aa8c completed with both actual Node 20/22 worker checks passing. Its full Node 20 suite passed 1,805 tests but exceeded six unchanged wall-clock budgets across five other files; build/smoke were skipped. No new local runtime was installed.

## Interior visibility follow-up

The controlled actor was present with all 20 meshes enabled and in the camera frustum. The baseline head-ray diagnostic identified door-frame-12013-24-20047, and visual review showed that its upper frame hid the actor after roof/wall clipping. Frame and hinged leaf were absent from the region mesh list, so they never received the building cutaway.

Door parts now join the existing region mesh list and own cloned clip materials associated with the already-projected indoor place bounds. The same occupied/view-blocking rule clips upper door geometry and restores it in third-person. Canonical opening, movement, collision, perception, NPC visibility and simulation source are unchanged; there is no actor overlay or global furniture fade. Region cleanup uses the existing owned-material disposal path while retaining shared textures.

The focused regression verifies both registered parts, owned materials, elevated clipping, third-person restoration, unchanged opening data and an untouched shared material. Eight focused web files pass 55 tests; typecheck and the separate visibility-bundle production build pass. All 19 real Chrome acceptance checks pass with no browser errors or inference requests: ordinary keyboard entry/traversal/exit/reentry, interrupted menus, canonical automatic door operation, camera/cutaway reversal and actual interior melee head contact (health 80 to 75.00). Entry, traversal, exit and combat screenshots were visually reviewed; the controlled actor is visible in each. The doorway start, initial closed state and nearby adult target remain disclosed disposable fixtures.

The first expanded browser fixture incorrectly expected a closed door to remain blocked while moving. Existing applyInteractionMovement canonically opens nearby doors, matching ordinary NPC mechanics, so acceptance now verifies that supported operation. Loose waypoint tolerance also cut a corner on repeated entry; the harness now approaches cell centers more precisely. Interior combat target placement checks actual clear body space and line of passage instead of placing an adult into furniture. Contact/damage and traversal assertions remain required; no gameplay rule or assertion was weakened.

Reproduce after building into the separate private output:

`node node_modules/vite/bin/vite.js build --config vite.web.config.ts --outDir ../.debug/isometric/visibility-bundle`

Set TVO_ISOMETRIC_BUNDLE=.debug/isometric/visibility-bundle and TVO_ISOMETRIC_EVIDENCE_DIR=.debug/isometric/interior-visibility, then run the existing browser acceptance command. This avoids rebuilding the served third-person bundle or using a retained player save. Portrait repair, low-strike controls, new art tools, human/gamepad acceptance and broader simulation work remain outside this follow-up.

Reviewed follow-up evidence: [before](../evidence/isometric-interior-visibility/00-before-door-cutaway.png), [entry](../evidence/isometric-interior-visibility/04-isometric-cutaway.png), [traversal](../evidence/isometric-interior-visibility/04b-interior-traversal.png), [exit](../evidence/isometric-interior-visibility/04c-interior-exit.png), [combat](../evidence/isometric-interior-visibility/05-interior-combat.png), [browser report](../evidence/isometric-interior-visibility/browser-evidence.json) and [verification record](../evidence/isometric-interior-visibility/verification.json). This is bounded evidence from one tavern, not exhaustive visibility for every layout.

## PR execution follow-up

Run 36821844547 completed RED at 302aa8c after 3,480.03 seconds: 163 files passed, five files failed; 1,805 tests passed, six timed out. The original checkpoint-worker loading failures are absent; actual Node 20/22 worker checks and typecheck pass. Timeout-affected files were agency-worldlab, causal-pressure (two cases), embodied-economy, playable-vista and stress-benchmarks. These files passed in the prior Node 20 CI run, while this run's file durations were roughly 1.4–1.8 times longer. No value assertion failure was reported. The raw job log was unavailable while active; the completed workflow archive supplied the evidence.

All 68 tests in those five files pass on installed Node 22.23.2 with unchanged budgets. The full PR gate now uses Node 22, matching the documented Desktop toolchain/live runtime in LIVING_ALPHA_RELEASE.md. Actual Node 20/22 source-worker compatibility jobs remain. This changes execution environment only: no assertion, timeout, simulation rule, suite exclusion or worker count changed. New-head CI must be independently verified after push; local success is not substituted for it. The previous exact-head result is preserved in [previous-head-ci.json](../evidence/isometric-interior-visibility/previous-head-ci.json).
