"""Build one quadruped creature and export it as a GLB (and optionally review renders).

    blender -b -P build_creature.py -- <roe_deer|woodland_boar|field_hare> <out.glb> [--preview <dir>]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from common import reset
import creatures as C
import export as X
import viz as P

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
name = argv[0] if argv else 'roe_deer'
out = argv[1] if len(argv) > 1 else os.path.join(os.getcwd(), f'creature_{name}.glb')
preview = argv[argv.index('--preview') + 1] if '--preview' in argv else None
sp = C.SPECIES[name]
reset()


def material(n, color, rough=0.8, metal=0.0):
    m = bpy.data.materials.get(n) or bpy.data.materials.new(n)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = color
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


hide = material('TV_Hide', sp['coat'] + (1,), 0.92)
material('TV_Hoof', (0.09, 0.07, 0.06, 1), 0.5)
material('TV_Antler', (0.66, 0.6, 0.5, 1), 0.7)
material('TV_Tusk', (0.86, 0.82, 0.7, 1), 0.5)
material('TV_CreatureEye', (0.03, 0.02, 0.02, 1), 0.1)
arm = C.build_armature(sp)
body = C.build_body(sp)
C.add_pattern(body, sp, name)
body.data.materials.append(hide)
C.assign(body, arm, sp)
body['tv_part'] = 'body'
parts = [body, C.ears(sp, arm), C.hooves(sp, arm), C.eyes(sp, arm)]
if sp.get('antler'):
    parts.append(C.antlers(sp, arm))
if sp.get('tusk'):
    parts.append(C.tusks(sp, arm))
    parts.append(C.mane(sp, arm))
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in parts)
print('CREATURE', name, 'tris', tris, 'height', sp['height'])
X.export_glb(out, parts, arm)
print('exported', out, os.path.getsize(out))
if preview:
    os.makedirs(preview, exist_ok=True)
    P.setup_scene()
    for o in parts:
        for m in o.data.materials:
            m.diffuse_color = tuple(m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value)
    tgt = (0, 0, sp['height'] * 0.4)
    for yaw, nm in ((90, 'side'), (35, 'q'), (0, 'front'), (180, 'back')):
        P.render(os.path.join(preview, f'{name}_{nm}.png'), target=tgt, distance=sp['height'] * 4.2, yaw_deg=yaw, pitch_deg=8, res=(800, 600))
