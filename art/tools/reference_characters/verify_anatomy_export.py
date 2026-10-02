import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(sys.argv[sys.argv.index('--')+1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'adult-neutral.glb'))
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
assert any(m.type == 'ARMATURE' and m.object == rig for m in mesh.modifiers)
def points():
    bpy.context.view_layer.update()
    obj = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    return [v.co.copy() for v in obj.data.vertices]
bpy.context.scene.frame_set(1)
rest = points()
bpy.context.scene.frame_set(15)
posed = points()
changed = sum((a-b).length > 0.00001 for a,b in zip(rest, posed))
assert changed > 100, changed
report = {'reimported_bones': len(rig.data.bones), 'animated_vertices_changed': changed,
          'skin_modifier_present': True, 'animation_present': rig.animation_data is not None}
(ROOT / 'export-verification.json').write_text(json.dumps(report, indent=2))
print('EXPORT_VERIFIED', report)

# Fast local workbench preview of the bent pose.
bpy.ops.object.camera_add(location=(3.3,-5.8,2.5))
camera = bpy.context.object
camera.rotation_euler = (Vector((0,0,0.95))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.4
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.render.resolution_x = 600
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.render.filepath = str(ROOT / 'rig-preview.png')
bpy.ops.render.render(write_still=True)

