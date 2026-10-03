"""Run with Blender --background --threads 2 --python create_character.py.
Creates a new isolated scene; never run in an unsaved interactive scene.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector
from bl_ext.blender_org.mpfb.services import HumanService, TargetService

ROOT = Path(__file__).resolve().parent
argv=sys.argv[sys.argv.index('--')+1:]
slot=argv[0]
OUT=Path(argv[1])
OUT.mkdir(parents=True,exist_ok=False)
preset=json.loads((ROOT/'slots.json').read_text(encoding='utf-8-sig'))['slots'][slot]
assert preset['pixel_reviewed'] and Path(preset['reference_local_path']).is_file()
preset['name']='TornVeil_'+slot+'_Foundation'
assert preset['macro'] is not None
bpy.ops.wm.read_factory_settings(use_empty=True)
macro = TargetService.get_default_macro_info_dict()
macro.update(preset['macro'])
body = HumanService.create_human(macro_detail_dict=macro)
body.name = preset['name']
rig = HumanService.add_builtin_rig(body, 'game_engine', import_weights=True)
assert rig and any(m.type == 'ARMATURE' and m.object == rig for m in body.modifiers)
rig.show_in_front = True

# Opaque neutral mannequin suit, with head/hands in a clay material.
# No anatomy, skin textures, or optional bodypart assets are downloaded.
for name, color in [('Suit', (0.055, 0.12, 0.17, 1)), ('Clay', (0.38, 0.28, 0.22, 1))]:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = color
    material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.8
    body.data.materials.append(material)
bpy.context.view_layer.update()
height = body.dimensions.z
for polygon in body.data.polygons:
    center = sum((body.data.vertices[i].co for i in polygon.vertices), Vector()) / len(polygon.vertices)
    polygon.material_index = int(center.z > height * 0.84 or abs(center.x) > height * 0.41)

HumanService.serialize_to_json_file(body, str(OUT / 'character.mpfb.json'))

def positions():
    bpy.context.view_layer.update()
    obj = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = obj.to_mesh()
    result = [v.co.copy() for v in mesh.vertices]
    obj.to_mesh_clear()
    return result

baseline = positions()
tests = []
for name, axis, degrees in [('lowerarm_l', 0, 35), ('calf_l', 0, 25), ('upperarm_r', 1, 20)]:
    bone = rig.pose.bones.get(name)
    assert bone is not None, name
    bone.rotation_mode = 'XYZ'
    bone.rotation_euler[axis] = math.radians(degrees)
    rig.update_tag()
    posed = positions()
    distances = [(a-b).length for a,b in zip(baseline, posed)]
    moved = sum(d > 0.00001 for d in distances)
    assert moved > 20 and max(distances) > 0.005, (name, moved)
    tests.append({'bone': name, 'angle_degrees': degrees, 'moved_vertices': moved,
                  'maximum_displacement_m': max(distances)})
    bone.rotation_euler = (0, 0, 0)
    rig.update_tag()
    positions()

# Short rest -> bent arm/knee -> rest clip, available for visual inspection.
for frame, bend in [(1, 0), (15, 1), (30, 0)]:
    for name, axis, degrees in [('lowerarm_l', 0, 35), ('calf_l', 0, 25)]:
        bone = rig.pose.bones[name]
        bone.rotation_euler[axis] = math.radians(degrees * bend)
        bone.keyframe_insert(data_path='rotation_euler', frame=frame)
bpy.context.scene.frame_end = 30
bpy.context.scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'adult-neutral.blend'))
# Bake a disposable export mesh so glTF cannot retain MPFB's hidden helper
# geometry or authoring shape keys. Keep the editable .blend intact.
bpy.ops.object.select_all(action='DESELECT')
export_body = body.copy()
export_body.data = body.data.copy()
bpy.context.collection.objects.link(export_body)
for modifier in list(export_body.modifiers):
    if modifier.type == 'ARMATURE':
        export_body.modifiers.remove(modifier)
export_body.select_set(True)
bpy.context.view_layer.objects.active = export_body
bpy.ops.object.convert(target='MESH')
export_body = bpy.context.object
modifier = export_body.modifiers.new('Rig', 'ARMATURE')
modifier.object = rig
rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'adult-neutral.glb'), export_format='GLB',
    use_selection=True, export_animations=True, export_apply=True)
report = {'blender': bpy.app.version_string, 'mpfb': '2.0.17',
          'bones': len(rig.data.bones), 'visible_vertices': len(baseline),
          'deformation_tests': tests, 'glb_bytes': (OUT / 'adult-neutral.glb').stat().st_size}
(OUT / 'verification.json').write_text(json.dumps(report, indent=2))
print('VERIFIED', json.dumps(report))

