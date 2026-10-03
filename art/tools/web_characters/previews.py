"""The four concept-art creatures as presentation previews: Rift Hawk, Veil Wraith, Shattered Colossus, Void Stag.

None of these exists in the simulation (it has no flight, no incorporeality, no giants, and its only deer is the
roe deer), so they are built as clearly labelled art previews for the showroom and are never spawned by the
world. Every one is built from code with the same conventions as the rest of the kit (Z up, facing -Y).
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

from common import Dims, smoothstep
from body import tube_mesh, _select_only, _segment_distance, build_body, layout, mirror
import creatures as C


def mat(name, color, rough=0.7, metal=0.0, emit=None, alpha=None, strength=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = color
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit is not None:
        b.inputs['Emission Color'].default_value = emit
        b.inputs['Emission Strength'].default_value = strength
    if alpha is not None:
        b.inputs['Alpha'].default_value = alpha
    return m


def make_obj(bm, name, slot, tag, style=''):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    mesh.materials.append(bpy.data.materials.get('TV_' + slot) or bpy.data.materials.new('TV_' + slot))
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    o['tv_part'] = tag
    o['tv_style'] = style
    return o


def dbl(bm, coords):
    """A double-sided quad (two separately wound faces on their own vertices)."""
    a = [bm.verts.new(c) for c in coords]
    b = [bm.verts.new(c) for c in coords]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))


def rock_chunk(bm, centre, radii, seed, rough=0.28, seg=14, ring=9, stretch=None):
    rnd = random.Random(seed)
    res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=1.0)
    for v in res['verts']:
        n = v.co.normalized()
        f = 1.0 + (rnd.random() - 0.5) * 2 * rough
        v.co = Vector((n.x * radii[0] * f, n.y * radii[1] * f, n.z * radii[2] * f)) + centre
    for face in res['faces'] if 'faces' in res else []:
        pass


def weight_rigid(obj, arm, bone):
    g = obj.vertex_groups.new(name=bone)
    g.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')
    obj.parent = arm
    m = obj.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    m.use_vertex_groups = True


def weight_nearest(obj, arm, bones, max_infl=3, reach=0.15):
    segs = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones if b.name in bones}
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    groups = {n: obj.vertex_groups.new(name=n) for n in segs}
    for v in obj.data.vertices:
        p = obj.matrix_world @ v.co
        sc = sorted(((math.exp(-(_segment_distance(p, a, b)[0] / reach) ** 2 * 1.6), n) for n, (a, b) in segs.items()), reverse=True)[:max_infl]
        tot = sum(w for w, _ in sc) or 1.0
        for w, n in sc:
            if w / tot > 0.01:
                groups[n].add([v.index], w / tot, 'REPLACE')
    obj.parent = arm
    m = obj.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    m.use_vertex_groups = True


# ---------------------------------------------------------------------------------------------------
# Void Stag: the roe-deer rig, larger, near-black, with a great crimson crown. Not a deer species.
# ---------------------------------------------------------------------------------------------------

def void_stag(arm_out):
    sp = dict(C.SPECIES['roe_deer'])
    sp.update(sh=0.98, hip=0.95, L=1.3, depth=0.42, width=0.24, neck=0.55, neck_r=0.09, head=0.29, head_r=0.072, ear=0.15, leg_r=0.036, coat=(0.10, 0.07, 0.13), antler=False, height=1.55)
    mat('TV_Hide', sp['coat'] + (1,), 0.85, 0.0, emit=(0.5, 0.05, 0.08, 1), strength=0.06)
    mat('TV_Hoof', (0.04, 0.03, 0.05, 1), 0.4)
    mat('TV_VoidAntler', (0.5, 0.05, 0.08, 1), 0.4, 0.0, emit=(1.0, 0.12, 0.16, 1))
    mat('TV_CreatureEye', (1.0, 0.25, 0.2, 1), 0.1, 0.0, emit=(1.0, 0.3, 0.2, 1))
    arm = C.build_armature(sp)
    body = C.build_body(sp)
    C.add_pattern(body, sp, 'void_stag')
    body.data.materials.append(bpy.data.materials['TV_Hide'])
    C.assign(body, arm, sp)
    body['tv_part'] = 'body'
    parts = [body, C.ears(sp, arm), C.hooves(sp, arm), C.eyes(sp, arm)]
    j = C.joints(sp)
    bm = bmesh.new()
    k = 2.6
    for sg in (1, -1):
        base = j['head_c'] + Vector((sg * sp['head_r'] * 0.55, sp['head'] * 0.1, sp['head_r']))
        beam = [base, base + Vector((sg * 0.08 * k / 2.6, 0.02, 0.22)), base + Vector((sg * 0.16, 0.05, 0.46)), base + Vector((sg * 0.20, 0.03, 0.72)), base + Vector((sg * 0.16, -0.04, 0.98))]
        rad = [0.030, 0.026, 0.022, 0.017, 0.006]
        tube_mesh(bm, [(p, r, r) for p, r in zip(beam, rad)], segments=8)
        for t, u in enumerate((0.25, 0.4, 0.55, 0.7, 0.85)):
            i0 = min(3, int(u * 4)); p0 = beam[i0].lerp(beam[i0 + 1], u * 4 - i0)
            for side in (-1, 1):
                d = Vector((sg * 0.6 + side * 0.35 * sg, 0.5 * side * (1 if t % 2 else -1), 1.0)).normalized()
                L = 0.20 - 0.02 * t
                tube_mesh(bm, [(p0, 0.014, 0.014), (p0 + d * L * 0.5 + Vector((0, 0, 0.03)), 0.010, 0.010), (p0 + d * L + Vector((0, 0, 0.06)), 0.003, 0.003)], segments=6)
    ant = make_obj(bm, 'Antlers', 'VoidAntler', 'antlers', 'void')
    weight_rigid(ant, arm, 'head')
    parts.append(ant)
    # A few drifting embers around the crown, as separate rigid bits.
    bm = bmesh.new()
    rnd = random.Random(4)
    for i in range(16):
        c = j['head_c'] + Vector((rnd.uniform(-0.35, 0.35), rnd.uniform(-0.2, 0.2), rnd.uniform(0.15, 1.0)))
        res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=rnd.uniform(0.01, 0.022))
        for v in res['verts']:
            v.co += c
    emb = make_obj(bm, 'Embers', 'VoidAntler', 'embers')
    weight_rigid(emb, arm, 'head')
    parts.append(emb)
    return arm, parts, sp


# ---------------------------------------------------------------------------------------------------
# Rift Hawk: a raptor with crystalline flight feathers. Flight is not a canonical locomotion.
# ---------------------------------------------------------------------------------------------------

BIRD_BONES = ['root', 'body', 'neck', 'head', 'beak', 'tail_01', 'tail_02'] + [f'wing_{s}_{i}' for s in ('l', 'r') for i in (1, 2, 3)] + [f'leg_{s}' for s in ('l', 'r')]


def rift_hawk():
    S = 1.0
    data = bpy.data.armatures.new('HawkArmature')
    arm = bpy.data.objects.new('HawkArmature', data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    E = data.edit_bones

    def bone(name, parent, head, tail, connect=False):
        b = E.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        if parent:
            b.parent = E[parent]
            b.use_connect = connect
        return b
    bone('root', None, (0, 0, 0.0), (0, -0.1, 0.0))
    bone('body', 'root', (0, 0.18, 0.0), (0, -0.10, 0.02))
    bone('neck', 'body', (0, -0.10, 0.02), (0, -0.20, 0.10), True)
    bone('head', 'neck', (0, -0.20, 0.10), (0, -0.30, 0.10), True)
    bone('beak', 'head', (0, -0.30, 0.10), (0, -0.36, 0.085))
    bone('tail_01', 'body', (0, 0.18, 0.0), (0, 0.34, -0.005))
    bone('tail_02', 'tail_01', (0, 0.34, -0.005), (0, 0.50, -0.01), True)
    for s, sg in (('l', 1), ('r', -1)):
        bone(f'wing_{s}_1', 'body', (sg * 0.06, -0.06, 0.05), (sg * 0.34, -0.03, 0.06))
        bone(f'wing_{s}_2', f'wing_{s}_1', (sg * 0.34, -0.03, 0.06), (sg * 0.68, 0.02, 0.06), True)
        bone(f'wing_{s}_3', f'wing_{s}_2', (sg * 0.68, 0.02, 0.06), (sg * 1.06, 0.10, 0.05), True)
        bone(f'leg_{s}', 'body', (sg * 0.05, 0.05, -0.03), (sg * 0.05, 0.03, -0.20))
    bpy.ops.object.mode_set(mode='OBJECT')
    mat('TV_Feather', (0.24, 0.20, 0.30, 1), 0.7)
    mat('TV_Crystal', (0.35, 0.55, 1.0, 1), 0.15, 0.0, emit=(0.25, 0.45, 1.0, 1), alpha=0.9)
    mat('TV_Beak', (0.9, 0.75, 0.3, 1), 0.4)
    mat('TV_CreatureEye', (1.0, 0.85, 0.3, 1), 0.1, 0.0, emit=(1.0, 0.7, 0.2, 1))
    parts = []
    # Body: a lofted spindle.
    bm = bmesh.new()
    tube_mesh(bm, [(Vector((0, 0.24, 0.0)), 0.01, 0.01), (Vector((0, 0.16, 0.0)), 0.05, 0.05), (Vector((0, 0.04, 0.02)), 0.085, 0.08), (Vector((0, -0.08, 0.03)), 0.075, 0.075), (Vector((0, -0.16, 0.06)), 0.05, 0.05), (Vector((0, -0.21, 0.10)), 0.035, 0.035)], segments=14)
    tube_mesh(bm, [(Vector((0, -0.19, 0.10)), 0.04, 0.045), (Vector((0, -0.27, 0.11)), 0.048, 0.05), (Vector((0, -0.31, 0.10)), 0.028, 0.03)], segments=12)
    body = make_obj(bm, 'HawkBody', 'Feather', 'body')
    weight_nearest(body, arm, ['body', 'neck', 'head', 'tail_01'], reach=0.12)
    parts.append(body)
    bm = bmesh.new()
    tube_mesh(bm, [(Vector((0, -0.305, 0.10)), 0.02, 0.022), (Vector((0, -0.345, 0.088)), 0.017, 0.02), (Vector((0, -0.375, 0.062)), 0.004, 0.006)], segments=8)
    beak = make_obj(bm, 'Beak', 'Beak', 'beak')
    weight_rigid(beak, arm, 'head')
    parts.append(beak)
    bm = bmesh.new()
    for sg in (1, -1):
        res = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=7, radius=0.012)
        for v in res['verts']:
            v.co += Vector((sg * 0.042, -0.285, 0.115))
    eyes = make_obj(bm, 'Eyes', 'CreatureEye', 'eyes')
    weight_rigid(eyes, arm, 'head')
    parts.append(eyes)
    # Wings: a fan of feathers per wing, each a slightly cambered strip, plus crystals on the tips.
    for s, sg in (('l', 1), ('r', -1)):
        bm = bmesh.new()
        cm = bmesh.new()
        n = 11
        for i in range(n):
            u = i / (n - 1)
            root = Vector((sg * (0.06 + 0.86 * u), -0.05 + 0.10 * u, 0.055 - 0.01 * u))
            length = 0.18 + 0.30 * math.sin(u * math.pi * 0.9) + 0.10 * u
            tip = root + Vector((sg * 0.05 * (1 - u), 0.24 + 0.22 * u + length * 0.4, -0.02 - 0.03 * u))
            width = 0.045 + 0.02 * (1 - u)
            p0, p1 = root + Vector((0, 0, 0.004)), tip
            side = Vector((0, 0, 1)).cross((p1 - p0).normalized()).normalized() * width
            quad = [p0 - side, p0 + side, p1 + side * 0.5, p1 - side * 0.5]
            dbl(bm, quad)
            if i > n - 5:
                c = tip + Vector((0, 0.01, 0.0))
                res = bmesh.ops.create_icosphere(cm, subdivisions=1, radius=0.018)
                for v in res['verts']:
                    v.co = Vector((v.co.x * 0.6, v.co.y * 1.9, v.co.z * 0.6)) + c
        # a solid wing arm from the shoulder
        tube_mesh(bm, [(Vector((sg * 0.06, -0.06, 0.05)), 0.028, 0.02), (Vector((sg * 0.34, -0.03, 0.06)), 0.02, 0.016), (Vector((sg * 0.68, 0.02, 0.06)), 0.014, 0.012), (Vector((sg * 1.02, 0.09, 0.05)), 0.006, 0.006)], segments=8)
        wing = make_obj(bm, f'Wing_{s}', 'Feather', 'wing', s)
        weight_nearest(wing, arm, [f'wing_{s}_1', f'wing_{s}_2', f'wing_{s}_3', 'body'], reach=0.2)
        cry = make_obj(cm, f'Crystals_{s}', 'Crystal', 'crystals', s)
        weight_nearest(cry, arm, [f'wing_{s}_2', f'wing_{s}_3'], reach=0.2)
        parts += [wing, cry]
    bm = bmesh.new()
    for i in range(7):
        a = (i - 3) / 3 * 0.5
        p0 = Vector((0, 0.20, -0.005)); p1 = Vector((math.sin(a) * 0.30, 0.20 + math.cos(a) * 0.32, -0.02))
        side = Vector((0, 0, 1)).cross((p1 - p0).normalized()).normalized() * 0.04
        dbl(bm, (p0 - side * 0.5, p0 + side * 0.5, p1 + side, p1 - side))
    tail = make_obj(bm, 'Tail', 'Feather', 'tail')
    weight_nearest(tail, arm, ['tail_01', 'tail_02', 'body'], reach=0.16)
    parts.append(tail)
    bm = bmesh.new()
    for sg in (1, -1):
        tube_mesh(bm, [(Vector((sg * 0.05, 0.05, -0.03)), 0.014, 0.014), (Vector((sg * 0.05, 0.03, -0.14)), 0.009, 0.009), (Vector((sg * 0.05, 0.0, -0.2)), 0.003, 0.003)], segments=6)
        for t in (-1, 0, 1):
            tube_mesh(bm, [(Vector((sg * 0.05, 0.0, -0.19)), 0.007, 0.007), (Vector((sg * 0.05 + t * 0.03, -0.05, -0.23)), 0.002, 0.002)], segments=5)
    legs = make_obj(bm, 'Legs', 'Beak', 'legs')
    weight_nearest(legs, arm, ['leg_l', 'leg_r'], reach=0.15)
    parts.append(legs)
    return arm, parts


# ---------------------------------------------------------------------------------------------------
# Veil Wraith: a hooded, tattered, incorporeal figure. Not a canonical creature.
# ---------------------------------------------------------------------------------------------------

WRAITH_BONES = ['root', 'hover'] + [f'shroud_{i:02d}' for i in range(1, 8)] + ['head'] + [f'arm_{s}_{i}' for s in ('l', 'r') for i in (1, 2, 3)]


def veil_wraith():
    H = 2.2
    data = bpy.data.armatures.new('WraithArmature')
    arm = bpy.data.objects.new('WraithArmature', data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    E = data.edit_bones

    def bone(name, parent, head, tail, connect=False):
        b = E.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        if parent:
            b.parent = E[parent]
            b.use_connect = connect
        return b
    bone('root', None, (0, 0, 0.0), (0, 0, 0.1))
    bone('hover', 'root', (0, 0, 0.2), (0, 0, 0.5))
    prev = 'hover'
    zs = [0.5 + i * 0.22 for i in range(8)]
    for i in range(7):
        bone(f'shroud_{i + 1:02d}', prev, (0, 0, zs[i]), (0, 0, zs[i + 1]), True)
        prev = f'shroud_{i + 1:02d}'
    bone('head', 'shroud_07', (0, 0, zs[7]), (0, -0.05, zs[7] + 0.28))
    for s, sg in (('l', 1), ('r', -1)):
        bone(f'arm_{s}_1', 'shroud_06', (sg * 0.18, -0.02, 1.62), (sg * 0.36, -0.10, 1.34))
        bone(f'arm_{s}_2', f'arm_{s}_1', (sg * 0.36, -0.10, 1.34), (sg * 0.44, -0.30, 1.10), True)
        bone(f'arm_{s}_3', f'arm_{s}_2', (sg * 0.44, -0.30, 1.10), (sg * 0.46, -0.44, 0.96), True)
    bpy.ops.object.mode_set(mode='OBJECT')
    mat('TV_Shroud', (0.10, 0.12, 0.20, 1), 0.9, 0.0, emit=(0.10, 0.16, 0.34, 1), alpha=0.72, strength=0.35)
    mat('TV_Bone', (0.75, 0.78, 0.82, 1), 0.6, 0.0, emit=(0.25, 0.32, 0.5, 1))
    mat('TV_Glow', (0.4, 0.7, 1.0, 1), 0.1, 0.0, emit=(0.5, 0.85, 1.0, 1))
    parts = []
    bm = bmesh.new()
    # Cloak: a tall tapering cone with flared, ragged strips below.
    rings = []
    for i, (z, r) in enumerate(((0.22, 0.10), (0.45, 0.34), (0.9, 0.36), (1.3, 0.30), (1.62, 0.26), (1.82, 0.20), (1.98, 0.13), (2.16, 0.16), (2.36, 0.15), (2.48, 0.06))):
        rings.append((Vector((0, 0.0, z)), r, r * 0.9))
    tube_mesh(bm, rings, segments=20, kind='limb', cap_start=False, cap_end=True)
    rnd = random.Random(2)
    for i in range(16):
        a = i / 16 * math.tau
        L = 0.5 + rnd.random() * 0.6
        base = Vector((math.sin(a) * 0.34, math.cos(a) * 0.30, 0.9))
        tip = Vector((math.sin(a) * (0.42 + 0.1 * rnd.random()), math.cos(a) * (0.36 + 0.1 * rnd.random()), 0.9 - L))
        w = 0.07
        side = Vector((math.cos(a), -math.sin(a), 0)) * w
        dbl(bm, (base - side, base + side, tip + side * 0.3, tip - side * 0.3))
    cloak = make_obj(bm, 'Shroud', 'Shroud', 'shroud')
    weight_nearest(cloak, arm, ['hover'] + [f'shroud_{i:02d}' for i in range(1, 8)] + ['head'], reach=0.28)
    parts.append(cloak)
    # Hood and the dark face with two points of light.
    bm = bmesh.new()
    tube_mesh(bm, [(Vector((0, 0.02, 2.14)), 0.12, 0.13), (Vector((0, 0.0, 2.32)), 0.17, 0.19), (Vector((0, -0.02, 2.5)), 0.15, 0.17), (Vector((0, 0.02, 2.62)), 0.06, 0.07)], segments=14, cap_end=True)
    hood = make_obj(bm, 'Hood', 'Shroud', 'hood')
    weight_rigid(hood, arm, 'head')
    parts.append(hood)
    bm = bmesh.new()
    for sg in (1, -1):
        res = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.028)
        for v in res['verts']:
            v.co = Vector((v.co.x * 1.2, v.co.y * 0.5, v.co.z * 0.6)) + Vector((sg * 0.07, -0.16, 2.34))
    glow = make_obj(bm, 'EyeGlow', 'Glow', 'eyes')
    weight_rigid(glow, arm, 'head')
    parts.append(glow)
    # Skeletal arms and long fingers.
    for s, sg in (('l', 1), ('r', -1)):
        bm = bmesh.new()
        pts = [Vector((sg * 0.18, -0.02, 1.62)), Vector((sg * 0.36, -0.10, 1.34)), Vector((sg * 0.44, -0.30, 1.10)), Vector((sg * 0.46, -0.44, 0.96))]
        tube_mesh(bm, [(p, r, r) for p, r in zip(pts, (0.030, 0.022, 0.018, 0.016))], segments=8)
        for f in range(4):
            a = -0.3 + f * 0.2
            tube_mesh(bm, [(pts[-1], 0.008, 0.008), (pts[-1] + Vector((sg * a * 0.5, -0.10, -0.06)), 0.006, 0.006), (pts[-1] + Vector((sg * a, -0.19, -0.16)), 0.002, 0.002)], segments=5)
        armo = make_obj(bm, f'Arm_{s}', 'Bone', 'arm', s)
        weight_nearest(armo, arm, [f'arm_{s}_1', f'arm_{s}_2', f'arm_{s}_3', 'shroud_06'], reach=0.2)
        parts.append(armo)
    return arm, parts


# ---------------------------------------------------------------------------------------------------
# Shattered Colossus: a horned giant of split stone with crimson fractures, on the human male rig at 2.8 m.
# ---------------------------------------------------------------------------------------------------

def shattered_colossus():
    d = Dims('m', 2.9)
    from body import build_armature, build_body_mesh, assign_weights
    arm = build_armature(d)
    body = build_body_mesh(d)
    assign_weights(body, arm)
    body.parent = arm
    mod = body.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    mod.use_vertex_groups = True
    mat('TV_Stone', (0.16, 0.16, 0.18, 1), 0.9)
    mat('TV_Crack', (1.0, 0.1, 0.1, 1), 0.3, 0.0, emit=(1.0, 0.12, 0.08, 1))
    mat('TV_Horn', (0.55, 0.5, 0.42, 1), 0.6)
    body.data.materials.append(bpy.data.materials['TV_Stone'])
    body['tv_part'] = 'body'
    parts = [body]
    j = layout(d)
    H = d.height
    rnd = random.Random(9)

    def add_chunks(name, specs, bones_for):
        bm = bmesh.new()
        for (c, r, seed) in specs:
            rock_chunk(bm, Vector(c), r, seed)
        o = make_obj(bm, name, 'Stone', 'plate')
        for p in o.data.polygons:
            p.use_smooth = False
        weight_nearest(o, arm, bones_for, reach=0.3)
        parts.append(o)
        return o

    for s, sg in (('l', 1), ('r', -1)):
        sh, el, wr = (j['shoulder'] if sg > 0 else mirror(j['shoulder'])), (j['elbow'] if sg > 0 else mirror(j['elbow'])), (j['wrist'] if sg > 0 else mirror(j['wrist']))
        add_chunks(f'Pauldron_{s}', [(sh + Vector((sg * 0.18, 0, 0.12)), (0.42, 0.38, 0.28), 3 + int(sg)), (sh + Vector((sg * 0.30, 0.02, -0.06)), (0.30, 0.30, 0.24), 5 + int(sg)), (sh + Vector((sg * 0.08, 0, 0.30)), (0.24, 0.22, 0.20), 7 + int(sg))], [f'clavicle_{s}', f'upperarm_{s}', 'spine_03'])
        add_chunks(f'Gauntlet_{s}', [(wr + Vector((sg * 0.0, -0.06, -0.10)), (0.30, 0.30, 0.30), 11 + int(sg)), (el.lerp(wr, 0.55), (0.24, 0.24, 0.26), 13 + int(sg))], [f'lowerarm_{s}', f'hand_{s}'])
        hp = (j['hip'] if sg > 0 else mirror(j['hip'])); kn = (j['knee'] if sg > 0 else mirror(j['knee']))
        add_chunks(f'Greave_{s}', [(hp.lerp(kn, 0.55) + Vector((sg * 0.06, -0.10, 0)), (0.26, 0.26, 0.30), 17 + int(sg)), (kn + Vector((0, -0.14, 0.0)), (0.24, 0.22, 0.24), 19 + int(sg))], [f'thigh_{s}', f'calf_{s}'])
    add_chunks('ChestPlate', [(Vector((0, -0.12, d.chest + 0.05)), (0.52, 0.30, 0.42), 23), (Vector((0, -0.16, d.waist + 0.05)), (0.40, 0.24, 0.26), 29), (Vector((0, 0.20, d.chest + 0.10)), (0.44, 0.22, 0.44), 31)], ['spine_02', 'spine_03', 'spine_01'])
    # A horned skull-helm.
    hc = Vector((0, 0.02 * H, d.head_c))
    bm = bmesh.new()
    rock_chunk(bm, hc + Vector((0, -0.02, 0.02)), (0.26, 0.28, 0.30), 41, rough=0.12)
    for sg in (1, -1):
        base = hc + Vector((sg * 0.16, 0.0, 0.18))
        tube_mesh(bm, [(base, 0.06, 0.06), (base + Vector((sg * 0.20, -0.02, 0.10)), 0.05, 0.05), (base + Vector((sg * 0.34, -0.04, 0.34)), 0.035, 0.035), (base + Vector((sg * 0.30, -0.06, 0.62)), 0.008, 0.008)], segments=8)
    helm = make_obj(bm, 'HornedHelm', 'Horn', 'helm')
    weight_rigid(helm, arm, 'head')
    parts.append(helm)
    # Crimson fractures: thin glowing wedges splitting the chest and helm.
    bm = bmesh.new()
    for i in range(9):
        a = rnd.uniform(-0.4, 0.4); z0 = d.waist + i * 0.09
        p = Vector((a * 0.4, -0.31 - 0.02 * rnd.random(), z0))
        tube_mesh(bm, [(p, 0.012, 0.012), (p + Vector((rnd.uniform(-0.12, 0.12), -0.01, 0.10)), 0.008, 0.008), (p + Vector((rnd.uniform(-0.2, 0.2), -0.02, 0.20)), 0.002, 0.002)], segments=4)
    crk = make_obj(bm, 'Fractures', 'Crack', 'fractures')
    weight_nearest(crk, arm, ['spine_01', 'spine_02', 'spine_03'], reach=0.3)
    parts.append(crk)
    bm = bmesh.new()
    for sg in (1, -1):
        res = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.035)
        for v in res['verts']:
            v.co = Vector((v.co.x * 1.4, v.co.y * 0.6, v.co.z * 0.8)) + hc + Vector((sg * 0.10, -0.27, 0.02))
    eyes = make_obj(bm, 'Eyes', 'Crack', 'eyes')
    weight_rigid(eyes, arm, 'head')
    parts.append(eyes)
    # Floating shards around the shoulders and back.
    bm = bmesh.new()
    for i in range(14):
        a = i / 14 * math.tau
        rock_chunk(bm, Vector((math.sin(a) * 0.9, math.cos(a) * 0.5 + 0.2, d.chest + rnd.uniform(-0.3, 0.9))), (0.09, 0.07, 0.16), 60 + i, rough=0.35, seg=8, ring=6)
    shards = make_obj(bm, 'Shards', 'Stone', 'shards')
    weight_rigid(shards, arm, 'spine_03')
    parts.append(shards)
    return arm, parts, d
