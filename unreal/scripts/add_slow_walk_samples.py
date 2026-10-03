"""Give BS_TV_Directional a slow-walk row, so an ordinary walker walks instead of shuffling.

People now walk errands at a human 1.1-1.6 m/s, but the blend space had only idle at 0 and the walk
loop (natively 206 cm/s) at 200, so 145 cm/s played a 70% walk / 30% idle mix: a half-stride
shuffle. This adds the same directional walk clips at 110 cm/s, time-scaled from their measured
root speed, so from 110 cm/s up the blend is walk-to-walk (same clip, same phase), not walk-to-idle.

Only the sample list is rebuilt, from the existing samples plus the new row; no clip is retargeted
or rewritten (create_directional_locomotion.py does that and would overwrite them). Local content.
"""
import json
import os

import unreal

ROOT = os.path.abspath(os.path.join(unreal.Paths.project_dir(), '../..'))
PATH = '/Game/Characters/TornVeilLocomotion/BS_TV_Directional'
SLOW_WALK = 110.0

with open(os.path.join(ROOT, 'docs/evidence/foundational-gameplay/retrofit/locomotion-assets.json')) as f:
    measured = {row['asset']: row['rootSpeedCmPerSecond'] for row in json.load(f)['clips']}

blend = unreal.load_asset(PATH)
samples, positions, rates = [], [], []
existing = [(s.get_editor_property('animation'), s.get_editor_property('sample_value')) for s in blend.get_editor_property('sample_data')]
for anim, value in existing:
    if abs(value.y - SLOW_WALK) < 1:
        continue  # re-running replaces the row rather than duplicating it
    speed = measured.get(anim.get_path_name(), 0)
    samples.append(anim); positions.append(unreal.Vector(value.x, value.y, 0))
    rates.append(value.y / speed if value.y > 0 and speed > 25 else 1.0)
added = 0
for anim, value in existing:
    if abs(value.y - 200) < 1 and 'Walk_Loop' in anim.get_name():
        speed = measured.get(anim.get_path_name(), 0)
        samples.append(anim); positions.append(unreal.Vector(value.x, SLOW_WALK, 0))
        rates.append(SLOW_WALK / speed if speed > 25 else 0.55)
        added += 1
assert unreal.TVLocomotionAuthoring.configure_samples(blend, samples, positions, rates)
unreal.EditorAssetLibrary.save_loaded_asset(blend)
print('TV_SLOW_WALK samples=%d added=%d' % (len(samples), added))
