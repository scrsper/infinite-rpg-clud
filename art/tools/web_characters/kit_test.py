import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from common import reset, Dims
import body as B
import head as Hd
import viz as P
import garments_web as G
import hair as Hr

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
sex = argv[0] if argv else 'f'
out = argv[1] if len(argv) > 1 else '.debug/web/blender'
os.makedirs(out, exist_ok=True)
reset()
d, arm, body = B.build_body(sex, extra_bones=Hr.hair_bones(Dims(sex)))
head = Hd.build_head(d, arm)
Hd.weight_all(head)
Hd.bind(head, arm)
eyes = Hd.eye_meshes(d, arm)
for e in eyes:
    Hd.weight_all(e)
    Hd.bind(e, arm)
# Preview materials.
def mat(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = color
    return m
skin = mat('Skin', (0.86, 0.68, 0.56, 1))
for o in (body, head):
    o.data.materials.append(skin)
em = mat('Eye', (0.92, 0.92, 0.95, 1))
for o in eyes:
    o.data.materials.append(em)
garment = argv[2] if len(argv) > 2 and argv[2] != '-' else None
style = argv[3] if len(argv) > 3 else None
if style:
    hobj = Hr.build_hair(d, style)
    Hr.weight_hair(hobj, arm, d)
    hobj.data.materials[0].diffuse_color = (0.55, 0.55, 0.62, 1)
fit = G.Fit(d)
gobj = G.make_garment(garment, fit, body, arm) if garment else None
if gobj:
    palette = {'Cloth': (0.85, 0.88, 0.95, 1), 'Under': (0.15, 0.2, 0.4, 1), 'Accent': (0.75, 0.6, 0.25, 1), 'Metal': (0.8, 0.7, 0.35, 1), 'Leather': (0.35, 0.22, 0.15, 1), 'Fur': (0.95, 0.93, 0.88, 1), 'Hem': (0.7, 0.72, 0.8, 1)}
    for m in gobj.data.materials:
        m.diffuse_color = palette[m.name[3:]]
print('body tris', sum(len(p.vertices) - 2 for p in body.data.polygons), 'head tris', sum(len(p.vertices) - 2 for p in head.data.polygons))
P.setup_scene()
c, rx, ry, rz = Hd.head_frame(d)
for yaw, nm in ((0, 'full'), (180, 'back'), (60, 'q3')):
    P.render(os.path.join(out, f'{nm}_{sex}.png'), target=(0, 0, d.height * 0.5), distance=d.height * 2.6, yaw_deg=yaw)
for k, (yaw, name) in enumerate(((0, 'front'), (40, 'q3'), (90, 'side'))):
    P.render(os.path.join(out, f'head_{sex}_{name}.png'), target=(0, c.y - ry * 0.3, c.z - 0.005), distance=0.85, yaw_deg=yaw, pitch_deg=2, focal=85, res=(900, 900))
# Face-shape and expression morph checks (front).
for key in ('face_round', 'face_long', 'feminine', 'mouth_open', 'blink'):
    for sk in head.data.shape_keys.key_blocks:
        sk.value = 1.0 if sk.name == key else 0.0
    P.render(os.path.join(out, f'head_{sex}_{key}.png'), target=(0, c.y - ry * 0.3, c.z - 0.005), distance=0.85, yaw_deg=25, pitch_deg=2, focal=85, res=(700, 700))
