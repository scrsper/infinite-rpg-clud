"""Turnaround preview of exported arena people (reimports the GLBs, so it checks the export too).
    blender -b --python art/tools/arena/render_people.py -- <people_dir> <out_png_dir>
"""
import bpy, sys, os, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]; os.makedirs(out, exist_ok=True)
for f in sorted(x for x in os.listdir(src) if x.endswith('.glb')):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, f))
    sc = bpy.context.scene
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 900, 900
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (.55, .57, .6, 1); bg.inputs[1].default_value = .8
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 50
    for i, ang in enumerate((0, 35, 180)):
        r = 4.4; a = math.radians(ang)
        cam.location = (math.sin(a) * r, -math.cos(a) * r, 1.15)
        cam.rotation_euler = (Vector((0, 0, .95)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(out, f'{f[:-4]}-{i}.png'); bpy.ops.render.render(write_still=True)
