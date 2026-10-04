"""Strip the TRELLIS motion review GLB (Motifect Combat + Locomotion clips, retargeted earlier onto a
UE-named rig) down to its armature and animations, for the arena's unarmed moveset.

    blender -b --python art/tools/arena/build_unarmed_clips.py -- <hero-motion-runtime.glb> <out.glb>

Source: art/source/reference-characters/hero-motion-v001/hero-motion-runtime.glb on the
codex/trellis-human-motion-set branch. Output is gitignored (third-party motion; not redistributed raw).
"""
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in list(bpy.data.objects):
    if o.type != 'ARMATURE': bpy.data.objects.remove(o, do_unlink=True)
rig.animation_data_create()
rig.animation_data.action = None
for tr in list(rig.animation_data.nla_tracks): rig.animation_data.nla_tracks.remove(tr)
n = 0
for act in bpy.data.actions:
    tr = rig.animation_data.nla_tracks.new(); tr.name = act.name
    tr.strips.new(act.name, int(act.frame_range[0]), act); n += 1
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_force_sampling=True, export_anim_single_armature=True, export_optimize_animation_size=True)
print(f'[unarmed] {n} clips -> {out} ({os.path.getsize(out) / 1e6:.1f} MB)')
