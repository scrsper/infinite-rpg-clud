"""Pack Mixamo FBX animation packs (downloaded by the user, "Without Skin") into one GLB of actions.

    blender -b --python art/tools/arena/build_mixamo_clips.py -- <out.glb> <pack_dir> [<pack_dir> ...]

Each pack_dir holds the unzipped FBX files of one pack. Clip names become "<pack>/<file stem>",
e.g. "great_sword/great sword slash (2)". The first armature imported is kept as the rig; every
other file contributes only its action, pushed to its own NLA track so the glTF exporter writes
one animation per clip. Mixamo motion is used under Adobe's Mixamo terms (royalty-free in games);
the FBX sources are not committed.
"""
import bpy, sys, os, json

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, PACKS = argv[0], argv[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
rig = None
clips = []
for pack in PACKS:
    tag = os.path.basename(pack.rstrip('/\\')).lower().replace(' pack', '').replace(' ', '_')
    for f in sorted(os.listdir(pack)):
        if not f.lower().endswith('.fbx'): continue
        before = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=os.path.join(pack, f), automatic_bone_orientation=False, ignore_leaf_bones=True)
        new = [o for o in bpy.data.objects if o not in before]
        arm = next((o for o in new if o.type == 'ARMATURE'), None)
        act = arm.animation_data.action if arm and arm.animation_data else None
        if rig is None and arm is not None:
            rig = arm; rig.name = 'MixamoRig'
            for o in new:
                if o is not rig: bpy.data.objects.remove(o, do_unlink=True)
            new = []
        if act is None or f.lower().startswith('warrok'):
            for o in new: bpy.data.objects.remove(o, do_unlink=True)
            continue
        name = f'{tag}/{os.path.splitext(f)[0]}'
        act.name = name; act.use_fake_user = True
        fr = act.frame_range
        clips.append({'name': name, 'frames': [fr[0], fr[1]]})
        for o in new: bpy.data.objects.remove(o, do_unlink=True)

rig.animation_data_create()
rig.animation_data.action = None
for c in clips:
    act = bpy.data.actions[c['name']]
    tr = rig.animation_data.nla_tracks.new(); tr.name = c['name']
    st = tr.strips.new(c['name'], int(act.frame_range[0]), act)
    tr.mute = False
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_force_sampling=True, export_frame_step=1, export_anim_single_armature=True, export_optimize_animation_size=True)
json.dump(clips, open(os.path.splitext(OUT)[0] + '.json', 'w'), indent=1)
print(f'[mixamo] {len(clips)} clips -> {OUT} ({os.path.getsize(OUT) / 1e6:.1f} MB)')
