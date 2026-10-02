"""Disposable background MPFB workbench; never touches an interactive scene.
blender -b --python build_foundation.py -- hero VERSION_DIRECTORY
"""
import bpy, sys, json, math
from pathlib import Path
from mathutils import Vector
from bl_ext.blender_org.mpfb.services import HumanService, TargetService
args=sys.argv[sys.argv.index('--')+1:]; slot=args[0]; out=Path(args[1]); out.mkdir(parents=True,exist_ok=False)
bpy.ops.wm.read_factory_settings(use_empty=True)
macro=TargetService.get_default_macro_info_dict()
preset=json.loads((Path(__file__).parent/'slots.json').read_text(encoding='utf-8-sig'))['slots'][slot]
assert preset['pixel_reviewed'] and Path(preset['reference_local_path']).is_file()
macro.update(preset['macro'])
body=HumanService.create_human(macro_detail_dict=macro); body.name=slot+'_MPFB'
assert slot=='hero', 'NPC costume authoring is not implemented; use build_anatomy.py for neutral foundation slots'
rig=HumanService.add_builtin_rig(body,'game_engine',import_weights=True)
HumanService.serialize_to_json_file(body,str(out/'foundation.mpfb.json'))
bpy.context.view_layer.update()
# Bake only the disposable visible surface, retaining weighted topology.
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active=body
for m in list(body.modifiers):
    if m.type=='ARMATURE': body.modifiers.remove(m)
bpy.ops.object.convert(target='MESH'); body=bpy.context.object
arm=body.modifiers.new('CanonicalMPFBSkin','ARMATURE'); arm.object=rig;body.parent=rig
H=body.dimensions.z

def mat(n,c):
    m=bpy.data.materials.new(n); m.diffuse_color=(*c,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*c,1); p.inputs['Roughness'].default_value=.72
    return m
skin=mat('SkinClay',(.55,.37,.28)); black=mat('CharcoalCloth',(.025,.023,.022)); crimson=mat('CrimsonOuter',(.19,.035,.038)); gold=mat('AntiqueTrim',(.3,.2,.08)); hairmat=mat('BlondeHair',(.49,.32,.14))
body.data.materials.clear(); body.data.materials.append(skin)
for p in body.data.polygons:p.use_smooth=True
body['tv_part']='body'
# Fitted shells derive from MPFB's surface and copy its authoritative weights.
def shell(name,predicate,material,offset):
    faces=[p for p in body.data.polygons if predicate(p.center/H)]
    ids=sorted({i for p in faces for i in p.vertices}); remap={v:i for i,v in enumerate(ids)}
    mesh=bpy.data.meshes.new(name); mesh.from_pydata([body.data.vertices[i].co+body.data.vertices[i].normal*offset for i in ids],[],[[remap[i] for i in p.vertices] for p in faces]); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o); mesh.materials.append(material)
    for group in body.vertex_groups:o.vertex_groups.new(name=group.name)
    for old,new in remap.items():
        for g in body.data.vertices[old].groups:o.vertex_groups[g.group].add([new],g.weight,'REPLACE')
    a=o.modifiers.new('MPFBSkin','ARMATURE'); a.object=rig;o.parent=rig
    s=o.modifiers.new('TailoredThickness','SOLIDIFY'); s.thickness=.003; s.offset=0
    for p in mesh.polygons:p.use_smooth=True
    o['tv_part']='garment';return o
shell('DarkTrousers',lambda p:.06<p.z<.54,black,.006)
shell('OpaqueUnderBodice',lambda p:.50<p.z<.81 and abs(p.x)<.13,black,.012)
shell('CrimsonElbowSleeves',lambda p:.68<p.z<.82 and .10<abs(p.x)<.20,crimson,.025)
shell('BootShells',lambda p:p.z<.20,black,.012)
# Continuous tailored torso pattern, with a fitted waist and eased chest.
verts=[];faces=[]
for z,rx,ry in [(.515,.133,.081),(.555,.117,.074),(.60,.096,.066),(.66,.121,.105),(.72,.148,.122),(.78,.14,.094)]:
    for k in range(48):
        a=2*math.pi*k/48;verts.append((H*rx*math.sin(a),-H*ry*math.cos(a),H*z))
for r in range(5):
    for k in range(48):i=r*48+k;j=r*48+(k+1)%48;faces.append((i,j,j+48,i+48))
me=bpy.data.meshes.new('TailoredWrap');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('TailoredWrap',me);bpy.context.collection.objects.link(o);me.materials.append(black)
for p in me.polygons:p.use_smooth=True
for name in ['pelvis','spine_01','spine_02','spine_03']:o.vertex_groups.new(name=name)
for v in me.vertices:
    z=v.co.z/H;name='pelvis' if z<.56 else 'spine_01' if z<.63 else 'spine_02' if z<.70 else 'spine_03';o.vertex_groups[name].add([v.index],1,'REPLACE')
o.hide_render=True;o.hide_viewport=True
a=o.modifiers.new('DraftSkin','ARMATURE');a.object=rig;o.parent=rig;s=o.modifiers.new('TailoredThickness','SOLIDIFY');s.thickness=.004;o['tv_part']='garment'
# Patterned split panels: defined waist/knee outlines, no recoloured body surface.
def panel(name,angle):
    verts=[]; faces=[]
    for row in range(9):
        t=row/8; z=H*(.535-.255*t); rx=H*(.14+.065*t); ry=H*(.092+.025*t)
        for col in range(9):
            a=angle+(.65*(col/8-.5)); verts.append((rx*math.sin(a),-ry*math.cos(a),z))
    for r in range(8):
        for c in range(8):i=r*9+c;faces.append((i,i+1,i+10,i+9))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(crimson)
    uv=mesh.uv_layers.new()
    for p in mesh.polygons:
        for li in p.loop_indices:
            i=mesh.loops[li].vertex_index;uv.data[li].uv=(i%9/8,i//9/8)
    o.vertex_groups.new(name='pelvis').add(list(range(len(verts))),1,'REPLACE');a=o.modifiers.new('TemporaryPelvisBinding','ARMATURE');a.object=rig;o.parent=rig;s=o.modifiers.new('ClothThickness','SOLIDIFY');s.thickness=.004
    o['tv_part']='garment';o['weight_status']='blockout pelvis binding; motion fitting pending'
for i,a in enumerate((.50,-.50,math.pi-.50,math.pi+.50)):panel('SplitCoatPanel'+str(i),a)
# Layered curve locks with a three-strand crown. These are silhouette studies.
def lock(name,points,radius):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=3;s=c.splines.new('POLY');s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*v,1)
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);c.materials.append(hairmat);o['tv_part']='hair';return o
head=rig.data.bones['head']; top=head.tail_local.z; center=head.head_local.z+(top-head.head_local.z)*.55
shell('ScalpHairCap',lambda p:p.z>.97 or (p.y>.005 and p.z>.93),hairmat,.004)
for j in range(36):
    a=math.pi*(.10+j/36*1.80);points=[]
    for k in range(20):
        t=k/19; points.append((H*.061*math.sin(a)+.008*math.sin(t*11+j),H*.05*math.cos(a)+.012+.023*t,top-H*.025-H*.29*t))
    lock('LayeredLock'+str(j),points,.006)
for strand in range(3):
    points=[]
    for k in range(90):
        a=2*math.pi*k/89;w=12*a+strand*2*math.pi/3;points.append((H*.062*math.sin(a)+.003*math.sin(w),H*.052*math.cos(a)+.003*math.cos(w),center+H*.027+.004*math.sin(w)))
    lock('CrownStrand'+str(strand),points,.004)
# Neutral studio turnarounds: reveal the actual workbench, not a beauty claim.
scene=bpy.context.scene;scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL';scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True;scene.display.shading.background_type='WORLD';scene.world=bpy.data.worlds.new('StudioWorld');scene.world.color=(.12,.12,.12)
scene.render.resolution_x=640;scene.render.resolution_y=900;scene.render.resolution_percentage=100
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=H*1.18;scene.camera=cam
for name,pos in [('front',(0,-4,H*.53)),('side',(4,0,H*.53)),('back',(0,4,H*.53))]:
    cam.location=pos;cam.rotation_euler=(Vector((0,0,H*.5))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/(slot+'.blend')))
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    if o.type in ('MESH','CURVE','ARMATURE') and not o.hide_render:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(out/(slot+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_influence_nb=4)
(out/'status.json').write_text(json.dumps({'slot':slot,'macro':macro,'height_m':H,'status':'silhouette workbench; face likeness and cloth weighting unapproved','source':'MPFB 2.0.17; no VRoid/procedural loft body reused','remaining':['eyes/face target fitting','sleeve pattern opening','coat swing weights','rig finger mapping','reference comparison','NPC generation']},indent=2))






