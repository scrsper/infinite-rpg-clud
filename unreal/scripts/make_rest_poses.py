"""A lying pose for sleepers, built from the idle.

No installed pack has a lying or sleeping clip (the downed clip keeps the pelvis at 85-93 cm), so
people asleep in bed or on the ground were drawn standing, bent over by the old procedural rest
loop. A_TV_lie is MM_Idle with its root turned onto its back and lifted a hand's breadth: the
idle's breathing and relaxed limbs are kept, the whole body lies along the ground behind where it
stood. The result is verified here by composing the bone chain: the head must end up behind the
feet at about lying height, face up; the script refuses to save a pose that does not.

Local generated asset (inherits the template licence); rebuilt, never committed.
"""
import json
import os

import unreal

lib = unreal.EditorAssetLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
SOURCE = '/Game/Characters/Mannequins/Anims/Unarmed/MM_Idle'
PATH = '/Game/Characters/TornVeilActivities/A_TV_lie'
CHAIN = ['root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'spine_04', 'spine_05', 'neck_01', 'neck_02', 'head']
LIFT_CM = 14.0


def head_in_component(anim, t):
    xf = unreal.Transform()
    for bone in CHAIN:
        local = unreal.AnimationLibrary.get_bone_pose_for_time(anim, bone, t, False)
        xf = unreal.MathLibrary.compose_transforms(local, xf)
    return xf.translation


def build(roll):
    if lib.does_asset_exist(PATH):
        lib.delete_asset(PATH)
    anim = tools.duplicate_asset('A_TV_lie', PATH.rsplit('/', 1)[0], unreal.load_asset(SOURCE))
    frames = unreal.AnimationLibrary.get_num_frames(anim)
    turn = unreal.Rotator(roll=roll, pitch=0.0, yaw=0.0).quaternion()
    positions, rotations, scales = [], [], []
    length = anim.get_play_length()
    for i in range(frames + 1):
        t = min(length, length * i / max(1, frames))
        own = unreal.AnimationLibrary.get_bone_pose_for_time(anim, 'root', t, False)
        q = turn * own.rotation
        r = unreal.Quat()
        for axis in ('x', 'y', 'z', 'w'):
            r.set_editor_property(axis, getattr(q, axis))
        positions.append(unreal.Vector(own.translation.x, own.translation.y, own.translation.z + LIFT_CM))
        rotations.append(r)
        scales.append(own.scale3d)
    anim.controller.set_bone_track_keys('root', positions, rotations, scales, False)
    return anim


report = {}
standing = head_in_component(unreal.load_asset(SOURCE), 0.0)
report['standingHead'] = [round(standing.x, 1), round(standing.y, 1), round(standing.z, 1)]
chosen = None
for roll in (90.0, -90.0):
    anim = build(roll)
    head = head_in_component(anim, 0.0)
    report['roll%+d' % roll] = [round(head.x, 1), round(head.y, 1), round(head.z, 1)]
    # Lying: the head is low (under 45 cm) and has moved away from above the feet, toward where
    # the back was (-Y is behind a Manny standing in its reference facing).
    if head.z < 45.0 and head.y < -100.0:
        chosen = roll
        break
if chosen is None:
    lib.delete_asset(PATH)
    raise RuntimeError('no roll laid the body on its back: %s' % report)
lib.save_loaded_asset(unreal.load_asset(PATH))
report['chosenRoll'] = chosen
root = os.path.abspath(os.path.join(unreal.Paths.project_dir(), '../..'))
with open(os.path.join(root, '.debug/rest-poses.json'), 'w') as f:
    json.dump(report, f, indent=1)
print('TV_REST_POSES', json.dumps(report))
