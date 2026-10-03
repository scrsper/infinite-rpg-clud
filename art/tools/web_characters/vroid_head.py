"""Adapt the CC0 VRoid Studio beta base face to Torn Veil's existing skeleton.

Only the face topology, UVs and expression deltas are reused. The wardrobe, hair, body,
animation and canonical appearance adapter remain Torn Veil components. See source LICENSE.md.
"""
import os, math
import bpy
from mathutils import Vector, Matrix
from head import bind, weight_all, head_frame


def build(d, arm):
    male=d.sex=='m'
    source=os.path.abspath(os.path.join(os.path.dirname(__file__), '../../source/vroid-beta/'+('male/Base_Male.vrm' if male else 'female/Base_Female.vrm')))
    existing=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=source)
    imported=set(bpy.data.objects)-existing
    face=next(o for o in imported if o.type=='MESH' and o.name.startswith('Face'))
    matrix=face.matrix_world.copy()
    centre,rx,ry,rz=head_frame(d)
    # Source is Y-forward in Blender; our component convention is -Y-forward, Z-up.
    world_points=[matrix@v.co for v in face.data.vertices]
    lo=Vector(tuple(min(v[i] for v in world_points) for i in range(3)))
    hi=Vector(tuple(max(v[i] for v in world_points) for i in range(3)))
    mid=(lo+hi)*.5
    sx=d.head_w*1.10/(hi.x-lo.x); sy=d.head_d*.90/(hi.y-lo.y); sz=d.head_h/(hi.z-lo.z)
    transform=Matrix(((-sx,0,0,mid.x*sx),(0,-sy,0,centre.y+mid.y*sy),(0,0,sz,centre.z-mid.z*sz),(0,0,0,1))) @ matrix
    face.data.transform(transform, shape_keys=True)
    face.parent=None; face.matrix_world=Matrix.Identity(4); face.modifiers.clear(); face.vertex_groups.clear()
    face.name='Head'; face.data.name='Head'; face['tv_part']='head'
    keys=face.data.shape_keys.key_blocks
    keep=({'target_11':'blink','target_28':'mouth_open','target_4':'smile','target_3':'angry','target_2':'sad'} if male
          else {'target_13':'blink','target_37':'mouth_open','target_2':'smile','target_1':'angry','target_4':'sad'})
    for shape in list(keys)[1:]:
        if shape.name in keep: shape.name=keep[shape.name]
        else: face.shape_key_remove(shape)
    # Preserve ordinary appearance shape choices as proportional deformations of the real topology.
    for name, sx, sz in [('face_heart',.98,1),('face_round',1.07,.96),('face_square',1.06,1),('face_long',.97,1.06),('face_angular',.97,1.015),('feminine',.99,1),('masculine',1.03,1.015)]:
        shape=face.shape_key_add(name=name,from_mix=False)
        for vertex in shape.data:
            vertex.co.x*=sx; vertex.co.z=centre.z+(vertex.co.z-centre.z)*sz
        shape.value=0
    for mat in face.data.materials:
        original=mat.name
        image=next((n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None)
        slot='Skin' if '_SKIN' in original else 'Iris' if 'EyeIris' in original else 'White' if 'EyeWhite' in original else 'Brow' if 'FaceBrow' in original else 'Mouth' if 'FaceMouth' in original else 'Highlight' if 'EyeHighlight' in original else 'Lash'
        mat.name='TV_Base'+slot
        mat.node_tree.nodes.clear(); nodes=mat.node_tree.nodes; links=mat.node_tree.links
        out=nodes.new('ShaderNodeOutputMaterial'); shader=nodes.new('ShaderNodeBsdfPrincipled'); links.new(shader.outputs['BSDF'],out.inputs['Surface'])
        shader.inputs['Roughness'].default_value=.13 if slot in ('Iris','White','Highlight') else .58
        if image:
            texture=nodes.new('ShaderNodeTexImage'); texture.image=image
            links.new(texture.outputs['Color'],shader.inputs['Base Color'])
            if slot not in ('Skin','White','Mouth'):
                links.new(texture.outputs['Alpha'],shader.inputs['Alpha']); mat.surface_render_method='DITHERED'
        if slot in ('Lash','Brow'):
            shader.inputs['Base Color'].default_value=(.065,.037,.044,1)
            for link in list(shader.inputs['Base Color'].links): links.remove(link)
        mat.use_backface_culling=False
    weight_all(face,'head'); bind(face,arm)
    for ob in imported:
        if ob != face: bpy.data.objects.remove(ob,do_unlink=True)
    for poly in face.data.polygons: poly.use_smooth=True
    return face
