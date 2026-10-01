"""Reference-led high-detail components for the existing humanoid kit.

All coordinates are rig rest-space metres. These are presentation meshes: the shared
canonical appearance description chooses them, and the existing skeleton animates them.
No component changes the actor's collision, reach, anatomy or equipment inventory.
"""
import math
import random
import bpy
import bmesh
from mathutils import Vector
from common import smoothstep
from body import layout, tube_mesh
from head import head_frame, weight_all, bind
from garments_web import Fit


def mesh_object(name, verts, faces, uv, material, arm, bone='head', weights=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    tex = mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        poly.use_smooth = True
        for idx in poly.loop_indices:
            tex.data[idx].uv = uv[mesh.loops[idx].vertex_index]
    mesh.materials.append(bpy.data.materials[material])
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    if weights:
        groups = {}
        for i, ws in enumerate(weights):
            for key, value in ws.items():
                if value > .001:
                    if key not in groups:
                        groups[key] = ob.vertex_groups.new(name=key)
                    groups[key].add([i], value, 'REPLACE')
    else:
        weight_all(ob, bone)
    bind(ob, arm)
    return ob


def bm_object(name, bm, material, arm, bone='head'):
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(bpy.data.materials[material])
    for p in mesh.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    weight_all(ob, bone)
    bind(ob, arm)
    return ob


def ball(bm, centre, radii, seg=16, rings=10):
    for v in bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)['verts']:
        v.co = Vector((v.co.x*radii[0], v.co.y*radii[1], v.co.z*radii[2])) + Vector(centre)


def path(bm, points, radii, segments=7):
    tube_mesh(bm, [(Vector(p), r, r) for p, r in zip(points, radii)], segments=segments)


def face_position(n, d, p):
    """Soft facial planes, almond sockets and a small shaped nose instead of a skull cone."""
    c, rx, ry, rz = head_frame(d)
    x, y, z = n
    fem = p['fem']
    front = smoothstep(.12, .7, -y)
    jaw = 1 - (.13 + .07*fem) * smoothstep(-.1, -.85, z)
    jaw *= 1 + (p['jaw']-1) * .14 * smoothstep(.05, -.6, z)
    px = x*rx*jaw*p['x_scale']
    pz = z*rz*p['z_scale']
    # Slightly flattened facial plane with rounded temples, never a pinched pole chin.
    py = y*ry
    py += front * (.008 * math.exp(-((z+.72)/.25)**2))
    for s in (-1, 1):
        g = math.exp(-((x-s*.355)/.19)**2)
        py += .0055*g*math.exp(-((z-.055)/.11)**2)*front
        py -= .0025*g*math.exp(-((z-.23)/.09)**2)*front*p['brow']
        py -= .006 * math.exp(-((x-s*.50)/.24)**2-((z+.18)/.24)**2)*front*p['cheek']
    # Nose bridge, rounded tip and alae. Width and projection remain subtle in profile.
    py -= front * (.0085*p['nose_len']*math.exp(-(x/.11)**2-((z-.0)/.26)**2)
                   + .010*math.exp(-(x/.12)**2-((z+.16)/.09)**2))
    py -= .0018*math.exp(-(x/.23)**2-((z+.19)/.07)**2)*front
    py -= .0027*p['lips']*math.exp(-(x/.25)**2-((z+.385)/.055)**2)*front
    py += .0013*math.exp(-(x/.27)**2-((z+.365)/.010)**2)*front
    py -= .003*p['chin']*math.exp(-(x/.30)**2-((z+.62)/.13)**2)*front
    pz -= p['mouth_open']*.009*math.exp(-(x/.35)**2-((z+.50)/.16)**2)*front
    pz += p['smile']*.002*math.exp(-((abs(x)-.26)/.10)**2-((z+.365)/.08)**2)*front
    # Anatomical human ears; pointed ornaments are not substituted for anatomy.
    if abs(x) > .80:
        px += math.copysign(.009*p['ear']*math.exp(-((y-.10)/.22)**2-((z+.06)/.27)**2), x)
    return Vector((px, py, pz))


def eye_meshes(d, arm):
    """Convex almond corneas with actual lash geometry and a closing aperture morph."""
    from head import DEFAULT
    c, rx, ry, rz = head_frame(d)
    output = []
    for s, tag in ((1, 'L'), (-1, 'R')):
        verts, faces, uvs = [], [], []
        nx0, nz0 = s*.355, .055
        width, top, bottom = .205, .088, .063
        def position(u, v):
            nx, nz = nx0 + u*width, nz0 + v*(top if v >= 0 else bottom) + s*u*.016
            n = Vector((nx, -math.sqrt(max(.001, 1-nx*nx-nz*nz)), nz))
            q = face_position(n, d, DEFAULT) + c
            q.y -= .0018 + .0035*(1-u*u)*max(0, 1-v*v)
            return q
        seg, rings = 64, 12
        for j in range(rings+1):
            r = j/rings
            for i in range(seg):
                a = i*math.tau/seg
                u = math.cos(a)*r
                v = math.sin(a)*r*(.72+.28*abs(math.sin(a)))
                verts.append(tuple(position(u, v)))
                uvs.append((.5+u*.5, .5+v*.25))
        for j in range(rings):
            for i in range(seg):
                a=j*seg+i; b=j*seg+(i+1)%seg
                faces.append((a,a+seg,b+seg,b))
        ob=mesh_object('Eye'+tag,verts,faces,uvs,'TV_Eye',arm)
        ob['tv_part']='eye'
        ob.shape_key_add(name='Basis')
        blink=ob.shape_key_add(name='blink')
        for k,v in enumerate(blink.data):
            v.co.z=c.z+rz*nz0+(v.co.z-(c.z+rz*nz0))*.035
        output.append(ob)
        bm=bmesh.new()
        pts=[]
        for i in range(49):
            u=-1+2*i/48
            q=position(u,math.sqrt(max(0,1-u*u))*(.72+.28*math.sqrt(max(0,1-u*u))))
            q.y-=.0008; pts.append(q)
        path(bm,pts,[.0005+.0007*math.sin(math.pi*i/48) for i in range(49)],6)
        for i in range(5):
            u=s*(.6+i*.075); q=position(u,math.sqrt(1-u*u))
            path(bm,[q,q+Vector((s*.002,-.001,.001)),q+Vector((s*.003,-.001,.0025))],[.00045,.0003,.00005],5)
        lash=bm_object('Lashes'+tag,bm,'TV_Lash',arm)
        lash['tv_part']='eye'
        output.append(lash)
    return output


def hand_parts(bm, d, s):
    """Separate tapered fingers with rounded tips, then a distinct opposable thumb."""
    H=d.height; j=layout(d); sign=1 if s=='l' else -1
    def m(v): return Vector((v.x*sign,v.y,v.z))
    wr,f1=m(j['wrist']),m(j['fingers_1'])
    direction=(f1-wr).normalized(); across=Vector((sign,0,0))
    tube_mesh(bm,[(wr-direction*.006,.017*H,.011*H),(wr.lerp(f1,.48),.021*H,.009*H),(f1-direction*.008,.023*H,.008*H)],segments=18)
    for index,(offset,length) in enumerate([(-.017,.052),(-.0057,.059),(.0057,.055),(.017,.043)]):
        base=f1+across*(offset*H/1.66)-direction*.007
        tip=base+direction*(length*H/1.66)+across*(offset*.25)+Vector((0,-.004,0))
        r=(.0052 if index<3 else .0044)*H/1.66
        tube_mesh(bm,[(base,r*.95,r*.8),(base.lerp(tip,.3),r,r*.85),(base.lerp(tip,.65),r*.84,r*.75),(base.lerp(tip,.9),r*.72,r*.66),(tip,r*.22,r*.23)],segments=12)
    t1,t2,te=m(j['thumb_1']),m(j['thumb_2']),m(j['thumb_end'])
    tube_mesh(bm,[(t1,.008*H,.007*H),(t2,.0065*H,.006*H),(t2.lerp(te,.8),.005*H,.0048*H),(te,.002*H,.002*H)],segments=14)


def couture_hair(d, arm):
    """Swept tapered locks with fine supporting strands, a parted fringe and long back fall."""
    from hair import weight_hair
    c,rx,ry,rz=head_frame(d); k=d.height/1.66
    rx *= 1.16
    verts,faces,uvs=[],[],[]
    def lock(points,width,depth=.006):
        start=len(verts); rows=36; cols=12
        for j in range(rows+1):
            t=j/rows; q=t*(len(points)-1); n=min(len(points)-2,int(q)); f=q-n
            # Smooth cubic interpolation on the authored guide.
            p0=points[max(0,n-1)]; p1=points[n]; p2=points[n+1]; p3=points[min(len(points)-1,n+2)]
            centre=.5*((2*p1)+(-p0+p2)*f+(2*p0-5*p1+4*p2-p3)*f*f+(-p0+3*p1-3*p2+p3)*f*f*f)
            tangent=(p2-p1).normalized()
            outward=Vector((centre.x,centre.y-c.y,0)).normalized()
            if outward.length<.1: outward=Vector((0,1,0))
            side=tangent.cross(outward).normalized()
            if side.length<.1: side=Vector((1,0,0))
            normal=side.cross(tangent).normalized()
            taper=max(.012,(math.sin(math.pi*(.14+.86*t))**.6))
            for i in range(cols+1):
                a=i/cols*math.tau
                p=centre+side*(math.cos(a)*width*taper)+normal*(math.sin(a)*depth*taper)
                verts.append(tuple(p)); uvs.append((i/cols,t))
        for j in range(rows):
            for i in range(cols):
                a=start+j*(cols+1)+i; faces.append((a,a+1,a+cols+2,a+cols+1))
    # A continuous scalp under the layered locks prevents daylight between roots.
    start=len(verts); rows=16; cols=80
    for j in range(rows+1):
        for i in range(cols+1):
            a=i/cols*math.tau
            front=max(0,-math.sin(a))
            end=2.05-1.05*front**4
            t=.015+j/rows*end
            verts.append(tuple(c+Vector((rx*math.sin(t)*math.cos(a),ry*1.10*math.sin(t)*math.sin(a),rz*1.025*math.cos(t)))))
            uvs.append((i/cols*6,j/rows))
    for j in range(rows):
        for i in range(cols):
            a=start+j*(cols+1)+i; faces.append((a,a+1,a+cols+2,a+cols+1))
    # Full, rounded locks: broader outer layers and narrower overlapping fall.
    for i in range(26):
        a=-math.pi*.59+i/25*math.pi*1.18
        x=math.sin(a); y=math.cos(a)
        pts=[c+Vector((x*rx*.12,y*ry*.08,rz*1.06)),c+Vector((x*rx*.89,y*ry*.96,rz*.54)),
             c+Vector((x*rx*1.03,y*ry*1.12,-rz*.3)),c+Vector((x*(rx+.014*k),y*ry+.034*k,-.28*k)),
             c+Vector((x*(rx+.023*k)+.012*math.sin(i),y*ry+.052*k,-(.48+.045*math.sin(i*2))*k))]
        lock(pts,.020*k,.007*k)
    # Long face-framing curtains, with fine separated tips.
    for s in (-1,1):
        for i in range(4):
            x=s*(.86+i*.055)*rx
            pts=[c+Vector((s*.07*rx,-.05*ry,rz*1.05)),c+Vector((x,-ry*.64,rz*.63)),c+Vector((x*1.07,-ry*.62,-rz*.45)),
                 c+Vector((x*1.04,-ry*.51,-.21*k)),c+Vector((x*.84,-ry*.35,-(.33+i*.022)*k))]
            lock(pts,.014*k,.005*k)
        # Soft diagonal fringe; leaves the actual eyes readable.
        for i in range(6):
            t=i/5
            pts=[c+Vector((s*.08*rx,-ry*.24,rz*1.01)),c+Vector((s*(.16+.35*t)*rx,-ry*.80,rz*.65)),
                 c+Vector((s*(.39+.53*t)*rx,-ry*.96,rz*(.39-.15*t))),c+Vector((s*(.52+.49*t)*rx,-ry*.90,rz*(.29-.32*t)))]
            lock(pts,.011*k,.004*k)
    ob=mesh_object('Hair_hero_long',verts,faces,uvs,'TV_Hair',arm)
    bm=bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(ob.data); bm.free()
    ob['tv_part']='hair'; ob['tv_style']='hero_long'
    # Replace binding made by mesh_object with the existing hair-chain weight contract.
    for mod in list(ob.modifiers): ob.modifiers.remove(mod)
    weight_hair(ob,arm,d)
    return ob


def couture_garment(d, body, arm):
    """Layered split robe: fitted bodice, independent flowing skirt panels and hanging sleeves."""
    fit=Fit(d); H=d.height; verts=[]; faces=[]; uvs=[]; weights=[]; slots=[]
    def surface(rows,cols,fn,wfn,slot,uvscale=(1,1)):
        start=len(verts)
        for j in range(rows+1):
            v=j/rows
            for i in range(cols+1):
                u=i/cols; p=fn(u,v)
                verts.append(tuple(p)); uvs.append((u*uvscale[0],v*uvscale[1])); weights.append(wfn(u,v,p))
        for j in range(rows):
            for i in range(cols):
                a=start+j*(cols+1)+i
                faces.append((a,a+1,a+cols+2,a+cols+1)); slots.append(slot)
    def torso_w(u,v,p):
        t=smoothstep(d.waist,d.chest,p.z)
        return {'spine_01':1-t,'spine_03':t}
    def bodice(u,v):
        a=u*math.tau
        top=d.chest+.068*H-.036*H*max(0,-math.sin(a))
        z=d.waist-.025*H+(top-d.waist+.025*H)*v
        cy,rx,ry=fit.torso(z)
        return Vector((math.cos(a)*(rx+.009),cy+math.sin(a)*(ry+.012),z))
    surface(28,72,bodice,torso_w,0,(2,1))
    # A broad, fitted indigo obi gives the garment a waist and supports its jewelry.
    def obi(u,v):
        a=u*math.tau; z=d.waist-.018*H+v*.067*H
        cy,rx,ry=fit.torso(z)
        ripple=math.sin(v*math.pi*8)*.0008*H
        return Vector((math.cos(a)*(rx+.014+ripple),cy+math.sin(a)*(ry+.018+ripple),z))
    surface(14,72,obi,torso_w,1)
    # Bound neckline and obi edges: silk piping under the fine metal embroidery.
    def collar(u,v):
        p=bodice(u,.96+v*.04); p.x*=1.013; p.y*=1.02; return p
    surface(3,72,collar,torso_w,1,(2,.08))
    # Full indigo underskirt, shaped with restrained vertical pleats.
    def skirt(u,v):
        a=u*math.tau; z=d.waist-.02*H-v*(d.waist-.06*H)
        radius=(.105+.06*v)*H+math.sin(a*18)*.008*H*v
        return Vector((math.cos(a)*radius,math.sin(a)*radius*.62+.012*H*v,z))
    def skirt_w(u,v,p):
        leg='thigh_l' if p.x>0 else 'thigh_r'
        k=smoothstep(.12,.65,v)*.68
        return {'pelvis':1-k,leg:k}
    surface(40,96,skirt,skirt_w,1)
    # Ivory outer leaves, open at the front; offset folds and scalloped hems.
    for s in (-1,1):
        def panel(u,v,s=s):
            a=(.04+u*.90)*math.pi*s
            z=d.waist-.015*H-v*(d.waist-.03*H)+.016*H*math.sin(u*math.pi*3)*v*v
            radius=(.113+.080*v)*H+math.sin(u*math.pi*11+v)*.010*H*v
            return Vector((math.sin(a)*radius,math.cos(a)*radius*.67+.018*H*v,z))
        surface(44,36,panel,skirt_w,0,(1,2.2))
        for edge in (0,.97):
            def border(u,v,s=s,edge=edge):
                p=panel(edge+u*.03,v,s); p.x*=1.015; p.y*=1.015; return p
            surface(44,3,border,skirt_w,1,(.04,2))
    # Deliberately open neckline and separate broad sleeves fitted to the real arm rest pose.
    j=layout(d)
    for s in (-1,1):
        sh=Vector((j['shoulder'].x*s,j['shoulder'].y,j['shoulder'].z))
        wr=Vector((j['wrist'].x*s,j['wrist'].y,j['wrist'].z))
        side='l' if s>0 else 'r'
        def sleeve(u,v):
            centre=sh.lerp(wr,.13+v*.90)
            a=u*math.tau; r=(.045+.057*v)*H
            return centre+Vector((math.cos(a)*r*.62,math.sin(a)*r*.60, -.075*H*v*(1+math.sin(a)) +.008*math.cos(a*8)*v))
        def sw(u,v,p,side=side):
            t=smoothstep(.3,.9,v)
            return {'upperarm_'+side:1-t,'lowerarm_'+side:t}
        surface(30,48,sleeve,sw,0,(1.4,1.8))
        def cuff(u,v):
            p=sleeve(u,.94+v*.06); p.y-=.002*H; return p
        surface(3,48,cuff,sw,1)
    ob=mesh_object('G_furisode_hero',verts,faces,uvs,'TV_Cloth',arm,weights=weights)
    ob.data.materials.append(bpy.data.materials['TV_Under'])
    for poly,slot in zip(ob.data.polygons,slots): poly.material_index=slot
    ob['tv_part']='garment'; ob['tv_garment']='furisode_hero'
    # Existing fit helpers choose outward winding; material is also two-sided for open silk.
    from garments_web import orient_outward
    orient_outward(ob,body)
    return ob


def couture_stole(d, arm):
    """A short curved fur mantle with dense tapered fibres, keeping neckline and hands clear."""
    H=d.height; rng=random.Random(3921); bm=bmesh.new()
    centre=Vector((0,.008*H,d.chest+.058*H))
    for i in range(42):
        a=-.16*math.pi+i/41*math.pi*1.32
        p=centre+Vector((math.cos(a)*.12*H,math.sin(a)*.072*H,.012*H*math.sin(a)))
        ball(bm,p,(.028*H,.028*H,.025*H),16,10)
    for i in range(10000):
        a=-.16*math.pi+rng.random()*math.pi*1.32; theta=rng.random()*math.tau
        p=centre+Vector((math.cos(a)*.12*H,math.sin(a)*.072*H,.012*H*math.sin(a)))
        n=Vector((math.cos(a)*math.cos(theta),math.sin(a)*math.cos(theta),math.sin(theta)))
        if i % 4 == 0:
            a=-.16*math.pi if i%8==0 else 1.16*math.pi
            p=centre+Vector((math.cos(a)*.12*H,math.sin(a)*.072*H,.012*H*math.sin(a)))
            n=Vector((rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(-1,1))).normalized()
        root=p+Vector((n.x*.026*H,n.y*.026*H,n.z*.023*H))
        length=(.002+rng.random()*.005)*H
        tip=root+n*length+Vector((0,.002,-length*.5))
        path(bm,[root,root.lerp(tip,.6),tip],[.00022*H,.00015*H,.000015*H],3)
    ob=bm_object('Hero_stole',bm,'TV_Fur',arm,'spine_03'); ob['tv_part']='hero'
    return ob


def couture_jewels(d, arm):
    """Fine gold filigree, a bodice clasp, layered chains and pearl/crystal drops."""
    H=d.height; bm=bmesh.new(); gems=bmesh.new()
    for z,r,depth in [(d.waist+.014*H,.084*H,-.069*H),(d.chest+.045*H,.068*H,-.065*H)]:
        for s in (-1,1):
            pts=[Vector((s*r*t/32,depth-.003*math.sin(t/32*math.pi),z-.022*H*math.sin(t/32*math.pi))) for t in range(33)]
            path(bm,pts,[.0009*H]*len(pts),6)
        for i in range(8):
            a=i*math.tau/8
            q=Vector((math.cos(a)*.018*H,depth-.008*H,z+math.sin(a)*.018*H))
            path(bm,[q*.0+Vector((0,depth-.007*H,z)),q],[.0012*H,.0006*H],6)
            ball(gems,q,(.0035*H,.0025*H,.005*H),10,6)
        ball(gems,(0,depth-.009*H,z),(.008*H,.004*H,.012*H),12,8)
    gold=bm_object('Hero_filigree',bm,'TV_Metal',arm,'spine_02'); gold['tv_part']='hero'
    gem=bm_object('Hero_gemstones',gems,'TV_Crystal',arm,'spine_02'); gem['tv_part']='hero'
    return [gold,gem]
