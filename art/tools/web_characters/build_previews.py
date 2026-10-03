"""Build the concept-art preview creatures:  blender -b -P build_previews.py -- <void_stag|rift_hawk|veil_wraith|shattered_colossus> <out.glb> [--preview <dir>]"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from common import reset
import previews as V
import export as X
import viz as P

argv = sys.argv[sys.argv.index('--') + 1:]
name, out = argv[0], argv[1]
preview = argv[argv.index('--preview') + 1] if '--preview' in argv else None
reset()
if name == 'void_stag':
    arm, parts, sp = V.void_stag(out)
    h = 1.6
elif name == 'rift_hawk':
    arm, parts = V.rift_hawk()
    h = 0.6
elif name == 'veil_wraith':
    arm, parts = V.veil_wraith()
    h = 2.6
else:
    arm, parts, d = V.shattered_colossus()
    h = 3.2
print('PREVIEW', name, 'parts', len(parts), 'tris', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in parts))
X.export_glb(out, parts, arm)
print('exported', out, os.path.getsize(out))
if preview:
    os.makedirs(preview, exist_ok=True)
    P.setup_scene()
    for o in parts:
        for m in o.data.materials:
            m.diffuse_color = tuple(m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value)
    for yaw, nm in ((90, 'side'), (30, 'q')):
        P.render(os.path.join(preview, f'{name}_{nm}.png'), target=(0, 0, h * 0.45), distance=h * 3.0, yaw_deg=yaw, pitch_deg=8, res=(700, 700))
