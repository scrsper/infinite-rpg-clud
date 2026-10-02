"""Focused non-destructive rig/eye/surface refinement of the checkpoint blend.
blender -b --python refine_checkpoint.py -- SOURCE.blend NEW_DIRECTORY
"""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
from bl_ext.blender_org.mpfb.services import HumanService,TargetService,MeshService
args=sys.argv[sys.argv.index('--')+1:];src=Path(args[0]);out=Path(args[1]);out.mkdir(parents=True,exist_ok=False)
bpy.ops.wm.open_mainfile(filepath=str(src));rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');body=bpy.data.objects['hero_MPFB'];H=body.dimensions.z
# Grouped controls parent existing independent digit chains; existing weights stay intact.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for side in ['l','r']:
    digits=[rig.data.edit_bones[f'{d}_01_{side}'] for d in ['index','middle','ring','pinky']]
    name='fingers_01_'+side;b=rig.data.edit_bones.new(name);b.head=sum((d.head for d in digits),Vector())/4;b.tail=sum((d.tail for d in digits),Vector())/4;b.parent=rig.data.edit_bones['hand_'+side];b.use_deform=True
    for d in digits:d.use_connect=False;d.parent=b
bpy.ops.object.mode_set(mode='OBJECT')
def points():
    bpy.context.view_layer.update();obj=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=obj.to_mesh();p=[v.co.copy() for v in mesh.vertices];obj.to_mesh_clear();return p
rest=points();tests=[]
for side in ['l','r']:
    bone=rig.pose.bones['fingers_01_'+side];bone.rotation_mode='XYZ';bone.rotation_euler.x=.55;rig.update_tag();pose=points();ds=[(a-b).length for a,b in zip(rest,pose)];moved=sum(d>1e-5 for d in ds);assert moved>20
    tests.append({'bone':bone.name,'moved_vertices':moved,'max_displacement_m':max(ds)});bone.rotation_euler=(0,0,0);rig.update_tag();points()
# Use original MPFB eye-joint landmarks, rather than guessing eye locations.
preset=json.loads((Path(__file__).parent/'slots.json').read_text(encoding='utf-8-sig'))['slots']['hero'];macro=TargetService.get_default_macro_info_dict();macro.update(preset['macro']);temp=HumanService.create_human(macro_detail_dict=macro)
for m in temp.modifiers:m.show_viewport=False
bpy.context.view_layer.update();ev=temp.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();centers={}
for side in ['l','r']:
    ids=[i for i,w in MeshService.find_vertices_in_vertex_group(temp,'joint-'+side+'-eye')];assert ids,'MPFB eye landmark missing';centers[side]=sum((mesh.vertices[i].co for i in ids),Vector())/len(ids)
ev.to_mesh_clear();bpy.data.objects.remove(temp,do_unlink=True)
def material(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);return m
white=material('EyeSclera',(.64,.59,.48));iris=material('HeroGreyGreenIris',(.10,.17,.13));pupil=material('Pupil',(.008,.009,.008))
def eye(name,center,scale,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=1,location=center);o=bpy.context.object;o.name=name;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    o.vertex_groups.new(name='head').add(list(range(len(o.data.vertices))),1,'REPLACE');a=o.modifiers.new('HeadSkin','ARMATURE');a.object=rig;o.parent=rig;o['tv_part']='eye';return o
for side,c in centers.items():
    eye('Eye_'+side,c,(.012,.012,.012),white);eye('Iris_'+side,c+Vector((0,-.0119,0)),(.0054,.0010,.0054),iris);eye('Pupil_'+side,c+Vector((0,-.0128,0)),(.0023,.0005,.0023),pupil)
# Smooth the anatomical surface once; this is a shading/shape trial, not a crease cure claim.
sub=body.modifiers.new('AnatomySurfaceSubdivision','SUBSURF');sub.levels=1;sub.render_levels=1
for name in ['OpaqueUnderBodice','CrimsonElbowSleeves','ScalpHairCap']:
    o=bpy.data.objects.get(name)
    if o:
        m=o.modifiers.new('BoundarySmoothingTrial','SMOOTH');m.factor=.5;m.iterations=4
scene=bpy.context.scene;cam=scene.camera;scene.render.resolution_x=640;scene.render.resolution_y=900
for name,pos,aim,scale in [('front',(0,-4,H*.53),(0,0,H*.5),H*1.18),('side',(4,0,H*.53),(0,0,H*.5),H*1.18),('back',(0,4,H*.53),(0,0,H*.5),H*1.18),('face',(0,-2,H*.91),(0,0,H*.91),H*.28)]:
    cam.location=pos;cam.rotation_euler=(Vector(aim)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
# Numerical knee/hip deformation plus a dedicated pose image.
rig.pose.bones['thigh_l'].rotation_mode='XYZ';rig.pose.bones['thigh_l'].rotation_euler.x=-.65;rig.pose.bones['calf_l'].rotation_mode='XYZ';rig.pose.bones['calf_l'].rotation_euler.x=.9;rig.update_tag()
cam.location=(2,-4,H*.50);cam.rotation_euler=(Vector((0,0,H*.47))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=H*1.18;scene.render.filepath=str(out/'hip-knee-pose.png');bpy.ops.render.render(write_still=True)
for n in ['thigh_l','calf_l']:rig.pose.bones[n].rotation_euler=(0,0,0)
rig.update_tag();bpy.ops.wm.save_as_mainfile(filepath=str(out/'hero.blend'));bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    if o.type in ['MESH','CURVE','ARMATURE'] and not o.hide_render:o.select_set(True)
bpy.context.view_layer.objects.active=rig;bpy.ops.export_scene.gltf(filepath=str(out/'hero.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_influence_nb=4)
(out/'refinement-report.json').write_text(json.dumps({'source_checkpoint':'0163b5e','source':str(src),'finger_controls':tests,'eye_centers':{s:list(c) for s,c in centers.items()},'surface_trial':'one subdivision level; visual evaluation required','reference_match':False,'remaining':['face likeness fitting','hair reconstruction','tailored costume','thigh crease review','browser motions']},indent=2))
