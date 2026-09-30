"""Render every garment on a build, front and back, for review:  blender -b -P garment_sheet.py -- <f|m|c> <outdir> [kinds...]"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from common import reset
import body as B
import head as Hd
import garments_web as G
import viz as P

argv = sys.argv[sys.argv.index('--') + 1:]
sex, out = argv[0], argv[1]
kinds = argv[2:] or list(G.REGISTRY)
os.makedirs(out, exist_ok=True)
reset()
d, arm, body = B.build_body(sex)
head = Hd.build_head(d, arm)
Hd.weight_all(head)
Hd.bind(head, arm)
skin = bpy.data.materials.new('Skin')
skin.diffuse_color = (0.86, 0.68, 0.56, 1)
for o in (body, head):
    o.data.materials.append(skin)
palette = {'Cloth': (0.55, 0.62, 0.78, 1), 'Under': (0.14, 0.18, 0.32, 1), 'Accent': (0.75, 0.6, 0.25, 1), 'Metal': (0.85, 0.72, 0.3, 1), 'Leather': (0.35, 0.22, 0.15, 1), 'Fur': (0.95, 0.93, 0.88, 1), 'Hem': (0.42, 0.48, 0.62, 1)}
P.setup_scene()
fit = G.Fit(d)
for kind in kinds:
    try:
        g = G.make_garment(kind, fit, body, arm)
    except Exception as e:  # keep going so one broken garment does not hide the others
        print('GARMENT_FAIL', kind, repr(e))
        continue
    for m in g.data.materials:
        m.diffuse_color = palette[m.name[3:]]
    tris = sum(len(p.vertices) - 2 for p in g.data.polygons)
    print('GARMENT', kind, 'tris', tris)
    for yaw, nm in ((0, 'f'), (150, 'b')):
        P.render(os.path.join(out, f'g_{sex}_{kind}_{nm}.png'), target=(0, 0, d.height * 0.5), distance=d.height * 2.4, yaw_deg=yaw, res=(600, 800))
    bpy.data.objects.remove(g, do_unlink=True)
