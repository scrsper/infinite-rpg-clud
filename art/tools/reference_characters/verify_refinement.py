"""Reimport numerical skin/control verification; no visual-quality certification."""
import bpy,sys,json,math
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:];root=Path(args[0]);bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(root/'hero.glb'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');body=max((o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)),key=lambda o:len(o.data.vertices))
assert all(math.isfinite(x) for v in body.data.vertices for x in v.co)
bone_names=set(rig.data.bones.keys());valid_groups={g.index for g in body.vertex_groups if g.name in bone_names};sums=[sum(g.weight for g in v.groups if g.group in valid_groups) for v in body.data.vertices];assert min(sums)>.999 and max(sums)<1.001,(min(sums),max(sums))
def points():
    bpy.context.view_layer.update();ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();p=[v.co.copy() for v in me.vertices];ev.to_mesh_clear();return p
rest=points();tests=[]
for name in ['fingers_01_l','fingers_01_r','calf_l']:
    b=rig.pose.bones[name];b.rotation_mode='XYZ';b.rotation_euler.x=.55;rig.update_tag();pose=points();ds=[(a-b).length for a,b in zip(rest,pose)];moved=sum(d>1e-5 for d in ds);assert moved>20;tests.append({'bone':name,'moved_vertices':moved,'max_displacement_m':max(ds)});b.rotation_euler=(0,0,0);rig.update_tag();points()
result={'reimported_bones':len(rig.data.bones),'body_vertices':len(body.data.vertices),'finite_coordinates':True,'skin_sum_range':[min(sums),max(sums)],'deformation_tests':tests,'visual_quality_approved':False,'thigh_crease_fixed':False,'browser_motions_verified':False}
(root/'export-verification.json').write_text(json.dumps(result,indent=2));print('VERIFIED',json.dumps(result))
