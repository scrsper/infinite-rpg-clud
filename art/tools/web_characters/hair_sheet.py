"""Every hairstyle on the head, three views: blender -b -P hair_sheet.py -- <f|m|c> <outdir>"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from common import reset, Dims
import body as B
import head as Hd
import hair as Hr
import viz as P

argv = sys.argv[sys.argv.index('--') + 1:]
sex, out = argv[0], argv[1]
styles = argv[2:] or Hr.HAIR_STYLES
os.makedirs(out, exist_ok=True)
reset()
d, arm, body = B.build_body(sex, extra_bones=Hr.hair_bones(Dims(sex)))
head = Hd.build_head(d, arm)
Hd.weight_all(head)
Hd.bind(head, arm)
eyes = Hd.eye_meshes(d, arm)
skin = bpy.data.materials.new('Skin')
skin.diffuse_color = (0.86, 0.68, 0.56, 1)
for o in (body, head):
    o.data.materials.append(skin)
em = bpy.data.materials.new('Eye')
em.diffuse_color = (0.95, 0.95, 0.97, 1)
for e in eyes:
    e.data.materials.append(em)
P.setup_scene()
c, rx, ry, rz = Hd.head_frame(d)
for st in styles:
    h = Hr.build_hair(d, st)
    Hr.weight_hair(h, arm, d)
    h.data.materials[0].diffuse_color = (0.45, 0.32, 0.22, 1)
    for yaw, nm in ((0, 'f'), (55, 'q'), (180, 'b')):
        P.render(os.path.join(out, f'h_{sex}_{st}_{nm}.png'), target=(0, c.y - ry * 0.2, c.z - 0.06 * d.height / 1.66), distance=1.15 * d.height / 1.66, yaw_deg=yaw, pitch_deg=4, focal=70, res=(500, 640))
    bpy.data.objects.remove(h, do_unlink=True)
print('done', len(styles))
