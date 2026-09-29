"""Blender-side preview renders (Workbench, no lights to author) used while building assets."""
import math

import bpy
from mathutils import Vector


def setup_scene(bg=(0.13, 0.15, 0.19)):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'MATERIAL'
    sc.display.shading.show_cavity = True
    sc.render.film_transparent = False
    sc.world = bpy.data.worlds.new('W')
    sc.world.color = bg
    sc.render.resolution_x, sc.render.resolution_y = 900, 1200
    return sc


def render(path, target=(0, 0, 0.9), distance=4.2, yaw_deg=0, pitch_deg=8, focal=60, res=(900, 1200)):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    cam = bpy.data.objects.get('PreviewCam')
    if not cam:
        cam = bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam'))
        sc.collection.objects.link(cam)
    cam.data.lens = focal
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    t = Vector(target)
    # The figure faces -Y; yaw 0 looks at its front from -Y.
    pos = t + Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch))) * distance
    cam.location = pos
    cam.rotation_euler = (t - pos).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
