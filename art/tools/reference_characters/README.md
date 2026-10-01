# Reference character workbench

Status: reference-dependent modeling paused. Slot macros intentionally unset until local pixels are inspected. No reference-matched character exists in this directory.

Existing tested MPFB source: `C:\Users\green\Documents\Codex\2026-10-01\task\mpfb-workflow`. Preserve it unchanged. Its create_character.py resets the scene and uses a fixed adult-neutral preset/output path; never run in an unsaved interactive scene or treat it as the approved hero. Future slot generation must accept a preset and a fresh versioned output directory, serialize MPFB targets, retain editable .blend, and export a disposable helper-free mesh with four normalized skin influences.

Use installed Blender only; no downloads. Validate a candidate with Blender's bundled python.exe and `validate_glb.py ASSET.glb REPORT.json`. Report output belongs in a new versioned local output directory, never overwrite an approved output. This validator reads the actual current animator bone list. It checks names/skin/accessor structure, not weights, likeness or motion quality.

The browser CharacterRig applies model-space rotation deltas relative to captured rest transforms, accounting for bone roll. Core MPFB names must match animator.ts; fingers need an explicit semantic mapping if MPFB individual digits differ from the game's grouped fingers. Do not blindly rename individual digits to grouped fingers. Preserve rest transforms and skin bindings. Existing idle/walk/combat poses are procedural in src/web/actors/animator.ts and combatPose.ts, not a clip pack. Validate them in the actual browser before claiming retarget success. Mesh extras tv_part/tv_garment/tv_style and material slots are also integration contracts (build_kit.py).

Next: confirm three readable Downloads files, inspect front/side/back/face pixels, record deliberate seam/pose reconciliation, populate local paths and reviewed flag, then fit hero anatomy/face before hair and garment silhouette. Review clothed hero turnaround before decorative texture work. NPC slots reuse the approved foundation, not the rejected loft/remesh body. Existing thigh creases remain a visual blocker.

Provenance: MPFB installed official package metadata identifies GPL-3.0-or-later software; do not conflate that with every generated/reused asset's license. Verify bundled base-mesh/target license notices before distributable exports. Existing VRoid ZIPs are untouched and are not incorporated here. References are user-provided generated design targets; local viewing only. No simulation or Unreal changes.
