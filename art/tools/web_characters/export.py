"""glTF export for the browser client."""
import os

import bpy


def export_glb(path, objects, armature=None, animations=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in list(bpy.context.scene.objects):
        o.select_set(False)
    for o in objects:
        o.select_set(True)
    if armature is not None:
        armature.select_set(True)
        bpy.context.view_layer.objects.active = armature
    elif objects:
        bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
        export_skins=True, export_morph=True, export_morph_normal=False, export_animations=animations,
        export_materials='EXPORT', export_image_format='AUTO', export_texcoords=True, export_normals=True,
        export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True, export_extras=True,
        export_cameras=False, export_lights=False, export_influence_nb=4,
    )
    return path
