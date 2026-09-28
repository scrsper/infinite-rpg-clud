"""Everyday motion for the villagers: real captured clips in place of the sine-wave activity loops.

The activity palette played procedural loops (create_activity_animations.py): the idle pose with a
few bones swung on a sine. They read as a person wobbling, not talking or working. The installed
packs already hold captured motion for most of what a villager does, on two rigs:

* Motifect (Emotes & Social, Locomotion): one Mixamo-named rig imported per clip. It reaches Manny
  through the existing RTG_TV_CombatRepair retargeter, which is reused and not modified.
* The Free Sample Animation Set: Epic's own mannequin, but its own skeleton asset, so it needs a
  bone-for-bone Manny-to-Manny retargeter (created here once).

Outputs are local derivatives of licensed packs (RT_ prefix under TornVeilActivities/Mocap); they
are rebuilt from the installed packs and never committed. The result file lists each clip with its
length and how far the pelvis travels over it, so in-place clips can be told from travelling ones.
"""
import json
import os

import unreal

OUT = '/Game/Characters/TornVeilActivities/Mocap'
tools = unreal.AssetToolsHelpers.get_asset_tools()
lib = unreal.EditorAssetLibrary
registry = unreal.AssetRegistryHelpers.get_asset_registry()
target = unreal.load_asset('/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple')

MOTIFECT_SOCIAL = ['talk_animate_hands', 'explain_wide_gesture', 'think_chin_stroke', 'laugh_body',
                   'shrug_i_dont_know', 'arms_crossed_defiant', 'shrink_away_scared', 'sit_and_wave_goodbye',
                   'hold_up_wait', 'bow_deep_respect']
MOTIFECT_LOCOMOTION = ['idle_relaxed_weight_shift', 'idle_looking_around', 'idle_neutral', 'run_panic', 'run_jog',
                       'crouch_idle', 'turn_left_90', 'turn_right_90', 'turn_180', 'stop_from_run']
FREE_SAMPLE = {
    'A_Mining_PickAxe_2H_01_Loop_01': 'ResourceGatheringSet/Mannequin/Mining/PickAxe/2H',
    'A_Pull_Rope_2H_01_Loop': 'PullSet/Mannequin/RootMotion/Rope/2H/01',
    'A_Lift_Light_PickUp_0cm_02_R': 'LiftSet/Mannequin/InPlace/Lightweight/02/R',
    'A_ItemPickup_fromIdle_RH_100cm': 'ItemPickupSet/Mannequin',
    'A_RunFwd_Loop': 'MaleLocomotionSet/Mannequin/RootMotion',
    'A_DBNO_02_Fwd_Loop': 'DBNOSet',
}
MANNY_CHAINS = [('Spine', 'spine_01', 'spine_05'), ('Head', 'neck_01', 'head'),
                ('LeftClavicle', 'clavicle_l', 'clavicle_l'), ('RightClavicle', 'clavicle_r', 'clavicle_r'),
                ('LeftArm', 'upperarm_l', 'hand_l'), ('RightArm', 'upperarm_r', 'hand_r'),
                ('LeftLeg', 'thigh_l', 'foot_l'), ('RightLeg', 'thigh_r', 'foot_r')]
for short in ('l', 'r'):
    side = 'left' if short == 'l' else 'right'
    for finger in ('thumb', 'index', 'middle', 'ring', 'pinky'):
        MANNY_CHAINS.append((side + finger, finger + '_01_' + short, finger + '_03_' + short))


def ik_rig(path, mesh, root, chains):
    folder, name = path.rsplit('/', 1)
    asset = unreal.load_asset(path) if lib.does_asset_exist(path) else tools.create_asset(
        name, folder, unreal.IKRigDefinition, unreal.IKRigDefinitionFactory())
    c = unreal.IKRigController.get_controller(asset)
    c.set_skeletal_mesh(mesh)
    c.set_retarget_root(root)
    for chain, start, end in chains:
        if str(c.get_retarget_chain_start_bone(chain)) == 'None':
            c.add_retarget_chain(chain, start, end, 'None')
    lib.save_loaded_asset(asset)
    return asset


def free_sample_retargeter(source_mesh):
    """Manny to Manny: identical bones, so every chain maps to itself and root motion is kept."""
    path = OUT + '/RTG_TV_FreeSampleManny'
    source_rig = ik_rig(OUT + '/IK_TV_FreeSampleManny', source_mesh, 'pelvis', MANNY_CHAINS)
    target_rig = unreal.load_asset('/Game/TornVeil/Combat/Repair/IK_TV_RepairManny')
    rtg = unreal.load_asset(path) if lib.does_asset_exist(path) else tools.create_asset(
        'RTG_TV_FreeSampleManny', OUT, unreal.IKRetargeter, unreal.IKRetargetFactory())
    c = unreal.IKRetargeterController.get_controller(rtg)
    c.set_ik_rig(unreal.RetargetSourceOrTarget.SOURCE, source_rig)
    c.set_ik_rig(unreal.RetargetSourceOrTarget.TARGET, target_rig)
    c.set_preview_mesh(unreal.RetargetSourceOrTarget.SOURCE, source_mesh)
    c.set_preview_mesh(unreal.RetargetSourceOrTarget.TARGET, target)
    c.remove_all_ops()
    c.add_default_ops()
    for chain, _, _ in MANNY_CHAINS:
        c.set_source_chain(chain, chain)
    lib.save_loaded_asset(rtg)
    return rtg


def retarget(anims, source_mesh, rtg):
    data = [registry.get_asset_by_object_path(a.get_path_name()) for a in anims]
    out = unreal.IKRetargetBatchOperation.duplicate_and_retarget(
        data, source_mesh, target, rtg, prefix='RT_', target_path=OUT,
        include_referenced_assets=False, overwrite_existing_files=True)
    for a in out:
        assert lib.save_asset(str(a.package_name))
    return [str(a.package_name) for a in out]


def describe(package):
    anim = unreal.load_asset(package)
    length = anim.get_play_length()
    rows = {}
    for bone in ('root', 'pelvis'):
        a = unreal.AnimationLibrary.get_bone_pose_for_time(anim, bone, 0.0, False).translation
        b = unreal.AnimationLibrary.get_bone_pose_for_time(anim, bone, length, False).translation
        rows[bone] = [round(b.x - a.x, 1), round(b.y - a.y, 1), round(b.z - a.z, 1)]
    return {'asset': package, 'seconds': round(length, 3), 'travelCm': rows}


CALM_HEAD = ['RT_%s_Anim' % n for n in MOTIFECT_SOCIAL]
CALM_BONES = ('neck_01', 'neck_02', 'head')
CALM_SHARE = 0.3


def calm_head(package, idle):
    """Keep a gesture's arms and body, but let the head move only a third as much as captured.

    The social clips were performed broadly; on a person standing in the lane the captured head
    rolls read as a lolling, tilted head. The neck and head are rebuilt as the idle pose plus
    CALM_SHARE of the clip's own motion, frame by frame."""
    anim = unreal.load_asset(package)
    frames = unreal.AnimationLibrary.get_num_frames(anim)
    length = anim.get_play_length()
    idle_length = idle.get_play_length()
    controller = anim.controller
    for bone in CALM_BONES:
        positions, rotations, scales = [], [], []
        for i in range(frames + 1):
            t = min(length, length * i / max(1, frames))
            own = unreal.AnimationLibrary.get_bone_pose_for_time(anim, bone, t, False)
            base = unreal.AnimationLibrary.get_bone_pose_for_time(idle, bone, t % idle_length, False)
            r = unreal.MathLibrary.r_lerp(base.rotation.rotator(), own.rotation.rotator(), CALM_SHARE, True).quaternion()
            q = unreal.Quat()
            for axis in ('x', 'y', 'z', 'w'):
                q.set_editor_property(axis, getattr(r, axis))
            positions.append(own.translation); rotations.append(q); scales.append(own.scale3d)
        controller.set_bone_track_keys(bone, positions, rotations, scales, False)
    lib.save_loaded_asset(anim)


results = []
motifect_mesh = unreal.load_asset('/Game/Fab/Motifect_Combat_Motion_Pack/front_kick')
motifect_rtg = unreal.load_asset('/Game/TornVeil/Combat/Repair/RTG_TV_CombatRepair')
motifect = [unreal.load_asset('/Game/Fab/Motifect_Emotes___Social_Motion_Pack/%s_Anim' % n) for n in MOTIFECT_SOCIAL]
motifect += [unreal.load_asset('/Game/Fab/Motifect_Locomotion_Motion_Pack/%s_Anim' % n) for n in MOTIFECT_LOCOMOTION]
missing = [n for n, a in zip(MOTIFECT_SOCIAL + MOTIFECT_LOCOMOTION, motifect) if not a]
motifect = [a for a in motifect if a]
results += retarget(motifect, motifect_mesh, motifect_rtg)

free_mesh = unreal.load_asset('/Game/FreeSampleAnimationSet/Demo/Mannequins/Meshes/SKM_Manny')
free = []
for name, folder in FREE_SAMPLE.items():
    a = unreal.load_asset('/Game/FreeSampleAnimationSet/Animations/%s/%s' % (folder, name))
    (free if a else missing).append(a or name)
results += retarget(free, free_mesh, free_sample_retargeter(free_mesh))

idle_clip = unreal.load_asset('/Game/Characters/Mannequins/Anims/Unarmed/MM_Idle')
calmed = [p for p in results if p.rsplit('/', 1)[1] in CALM_HEAD]
for package in calmed:
    calm_head(package, idle_clip)

root = os.path.abspath(os.path.join(unreal.Paths.project_dir(), '../..'))
with open(os.path.join(root, '.debug/everyday-motion-retarget.json'), 'w') as f:
    json.dump({'clips': [describe(p) for p in results], 'missing': missing}, f, indent=2)
print('TV_EVERYDAY_MOTION', len(results), 'calmed', len(calmed), 'missing', missing)
