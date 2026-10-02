# Local reference character workflow

Checkpoint: three actual reference images inspected, MPFB-based construction drafts exported, neutral male/female foundations verified. Hero visual approval has NOT passed. No game asset was replaced.

References (extensionless PNG files): C:\Users\green\Downloads\mc-female-1 (2391226 bytes), npc-male-1 (2289080), npc-female-1 (2176213). Pixels match the three supplied sheets. Hero front/back A-pose governs authoring; profile relaxed pose is not a rest-pose target. Preserve front/back waist/split-panel construction when resolving side-view seam inconsistencies. Sheet heights are not physical metre measurements.

Presets: slots.json contains verified local paths and editable adult MPFB macro values. Values are initial anatomical foundations, not calibrated facial likeness. Macro age is a normalized adult MPFB parameter, not chronological age. All generated outputs require visual review.

Run installed Blender in disposable background scenes only:

    blender.exe -b --threads 2 --python-exit-code 1 --python art/tools/reference_characters/build_anatomy.py -- npc_male ABSOLUTE_NEW_OUTPUT_DIRECTORY
    blender.exe -b --threads 2 --python-exit-code 1 --python art/tools/reference_characters/build_anatomy.py -- npc_female ABSOLUTE_NEW_OUTPUT_DIRECTORY
    blender.exe -b --threads 2 --python-exit-code 1 --python art/tools/reference_characters/build_foundation.py -- hero ABSOLUTE_NEW_OUTPUT_DIRECTORY

Output directories must be new; the builders refuse overwrite. Existing MPFB workflow in Documents remains unchanged. build_anatomy.py extends that tested generator to named slots. It saves MPFB reconstruction JSON, editable blend, GLB, probe animation and deformation report. verify_anatomy_export.py -- OUTPUT_DIRECTORY reimports adult-neutral.glb, verifies skin and animation, and renders a neutral pose. validate_glb.py ASSET.glb REPORT.json runs with installed Blender's bundled Python and reads actual current animator bone requirements. contact_sheet.py -- HERO_OUTPUT_DIRECTORY makes an aspect-preserving reference/draft comparison from local files.

Current artifacts: art/source/reference-characters/hero-v006 (blend/glb/front/side/back/reference-and-draft.png); npc-male-foundation-v001 and npc-female-foundation-v001 (neutral foundations). Earlier hero-v001 through v005 remain local recovery drafts; v002 is incomplete after a studio setup failure. v004/v005 outer-wrap fitting failed visual review; latest editable file retains that mesh hidden and excludes it from export.

Hero visual status: real MPFB body topology and weights replaced reliance on the rejected procedural loft body. Separate thickened garment shell/panel meshes and curve hair studies exist. They are crude construction studies, NOT reference-matched high-detail assets. Face/eye fitting, scalp/hair silhouette, clean sewn boundaries, true boot forms and underlayer/coat clearances need substantial work. Do not approve or integrate this hero. Coat weights are temporary pelvis bindings. Hair curves have no animated head binding. No claim of idle/walk/dodge/attack compatibility or production garment QA. Do not add decorative floral textures until shape passes review.

Rig/export evidence: male and female each have 53 bones. Elbow/knee/shoulder probes passed; reimported animation moved 3790 male and 3799 female vertices. Shared MPFB GLB lacks fingers_01_l/r; explicit grouped-finger mapping remains necessary. Core limb names match the current animator. CharacterRig already converts model-space rotations using captured rest transforms, so differing bone roll is handled there. Rest pose, metre scale, orientation and the actual browser procedural idle/walk/combat still need engine review. Mesh extras and material slots need integration fitting; no canonical simulation changes are involved. Known MPFB thigh crease remains unresolved.

Provenance: installed Blender 5.2.1 LTS and official MPFB 2.0.17 only. MPFB software metadata states GPL-3.0-or-later. Bundled data/3dobjs/base.obj explicitly states CC0 September 2020, copyright Data Collection AB / Joel Palmius / Jonas Hauquier. Keep provenance separate for targets and any later extra assets; no downloaded skin/hair/clothing packs incorporated. New draft garment/hair geometry is locally authored. References are user-provided design targets. VRoid ZIPs are untouched and unused. No third-party uploads, downloads, installs, simulation edits or Unreal changes.
