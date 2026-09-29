"""Footwear, headwear, ornaments and the hero's non-human parts, all built from code.

Rigid accessories are skinned 100% to one bone (head, hand, spine...); footwear and wraps take their weights
from the body at their own bind positions, exactly like garments. Nothing here comes from an outside asset.
"""
import math

import bmesh
import bpy
from mathutils import Vector

from common import Dims, smoothstep
from head import head_frame
from body import layout, tube_mesh, mirror, foot_rings, arm_rings, leg_rings
from garments_web import SLOTS, Fit, orient_outward
from ashford_lib import normalise_weights, transfer_weights

ACC_SLOTS = ['Cloth', 'Under', 'Accent', 'Metal', 'Leather', 'Fur', 'Hem', 'Straw', 'Lacquer', 'Crystal']


def _material(name):
    return bpy.data.materials.get('TV_' + name) or bpy.data.materials.new('TV_' + name)


def _obj_from_bm(bm, name, slot_names, tag, face_slot=None):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    for s in slot_names:
        mesh.materials.append(_material(s))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['tv_part'] = tag
    return obj


def _rigid(obj, arm, bone):
    g = obj.vertex_groups.new(name=bone)
    g.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')
    obj.parent = arm
    m = obj.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    m.use_vertex_groups = True


def _from_body(obj, body, arm, limit=4):
    """Weights sampled from the body at the object's own vertex positions (footwear, wraps)."""
    proxy = bpy.data.objects.new('proxy', obj.data.copy())
    bpy.context.scene.collection.objects.link(proxy)
    transfer_weights(obj, proxy, [body])
    normalise_weights(obj, limit=limit)
    obj.parent = arm
    m = obj.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    m.use_vertex_groups = True


def _assign(obj, faces_slot):
    for poly in obj.data.polygons:
        poly.material_index = faces_slot.get(poly.index, 0)


def footwear(d: Dims, style, body, arm):
    """Left and right footwear as one object. Styles: zori (flat sandal), geta (raised wooden), boots."""
    H = d.height
    j = layout(d)
    bm = bmesh.new()
    slot_of = {}
    for s in ('l', 'r'):
        m = (lambda v: v) if s == 'l' else mirror
        an, ball, toe = m(j['ankle']), m(j['ball']), m(j['toe'])
        heel = an + Vector((0, 0.022 * H, -0.02 * H))
        if style in ('zori', 'geta'):
            lift = 0.0 if style == 'zori' else 0.030 * H
            sole = [(heel + Vector((0, 0, lift * 0.0)), 0.026 * H, 0.010 * H)]
            base_z = 0.0
            # platform: a wide slab under the foot
            tube_mesh(bm, [(Vector((heel.x, heel.y, base_z + lift + 0.006 * H)), 0.028 * H, 0.008 * H), (Vector((ball.x, ball.y - 0.010 * H, base_z + lift + 0.006 * H)), 0.036 * H, 0.008 * H),
                           (Vector((toe.x, toe.y + 0.004 * H, base_z + lift + 0.006 * H)), 0.030 * H, 0.007 * H)], segments=10, kind='foot')
            if style == 'geta':
                for yy in (heel.y - 0.012 * H, ball.y + 0.008 * H):
                    tube_mesh(bm, [(Vector((heel.x, yy, base_z + 0.014 * H)), 0.032 * H, 0.014 * H), (Vector((heel.x, yy, base_z + 0.036 * H)), 0.032 * H, 0.014 * H)], segments=8, kind='limb')
            # thong straps (accent) across the instep
            tube_mesh(bm, [(Vector((heel.x - 0.026 * H, ball.y + 0.018 * H, base_z + lift + 0.014 * H)), 0.005 * H, 0.005 * H), (Vector((heel.x, ball.y + 0.006 * H, base_z + lift + 0.056 * H)), 0.007 * H, 0.007 * H),
                           (Vector((heel.x + 0.026 * H, ball.y + 0.018 * H, base_z + lift + 0.014 * H)), 0.005 * H, 0.005 * H)], segments=6, kind='limb')
        else:  # boots: a shaft to mid-calf and a shaped foot
            tube_mesh(bm, foot_rings(d, s), segments=14, kind='foot')
            an2 = an
            kn = m(j['knee'])
            tube_mesh(bm, [(an2 + Vector((0, 0.0, -0.01 * H)), 0.034 * H, 0.035 * H), (an2.lerp(kn, 0.35), 0.036 * H, 0.038 * H), (an2.lerp(kn, 0.55), 0.036 * H, 0.040 * H)], segments=14, kind='limb')
    obj = _obj_from_bm(bm, f'Foot_{style}', ['Leather', 'Accent', 'Straw'], 'footwear')
    obj['tv_style'] = style
    for poly in obj.data.polygons:
        poly.material_index = 0 if style == 'boots' else 2
    _from_body(obj, body, arm)
    orient_outward(obj, body)
    return obj


def hat(d: Dims, kind, arm):
    c, rx, ry, rz = head_frame(d)
    H = d.height
    k = H / 1.66
    bm = bmesh.new()
    top = Vector((0, c.y, c.z + rz))
    if kind == 'wide':
        # A conical straw hat: a low cone with a wide, slightly drooping brim.
        rings = [(top + Vector((0, 0, 0.078 * k)), 0.004 * k, 0.004 * k), (top + Vector((0, 0, 0.060 * k)), 0.050 * k, 0.050 * k), (top + Vector((0, 0, 0.020 * k)), 0.105 * k, 0.105 * k),
                 (top + Vector((0, 0, -0.010 * k)), 0.190 * k, 0.190 * k), (top + Vector((0, 0, -0.030 * k)), 0.230 * k, 0.230 * k)]
        loops = tube_mesh(bm, rings, segments=28, kind='limb', cap_start=True, cap_end=False)
        slot = 'Straw'
    elif kind == 'hood':
        rings = [(c + Vector((0, 0.010 * k, rz * 0.98)), rx * 0.86, ry * 0.85), (c + Vector((0, 0.010 * k, rz * 0.50)), rx * 1.24, ry * 1.20), (c + Vector((0, 0.020 * k, -rz * 0.15)), rx * 1.28, ry * 1.26),
                 (c + Vector((0, 0.030 * k, -rz * 0.85)), rx * 1.35, ry * 1.30), (c + Vector((0, 0.040 * k, -rz * 1.60)), rx * 1.60, ry * 1.45)]
        tube_mesh(bm, rings, segments=22, kind='limb', cap_start=True, cap_end=False)
        slot = 'Cloth'
    elif kind == 'cap':
        rings = [(c + Vector((0, 0.0, rz * 0.99)), rx * 0.30, ry * 0.30), (c + Vector((0, 0.0, rz * 0.62)), rx * 1.08, ry * 1.08), (c + Vector((0, 0.0, rz * 0.22)), rx * 1.13, ry * 1.13)]
        tube_mesh(bm, rings, segments=24, kind='limb', cap_start=True, cap_end=False)
        slot = 'Cloth'
    else:  # helm (kabuto-like): a bowl with a neck guard and a brow ridge
        rings = [(c + Vector((0, 0.0, rz * 1.02)), rx * 0.20, ry * 0.20), (c + Vector((0, 0.0, rz * 0.65)), rx * 1.10, ry * 1.10), (c + Vector((0, 0.0, rz * 0.15)), rx * 1.18, ry * 1.18),
                 (c + Vector((0, 0.02 * k, -rz * 0.30)), rx * 1.38, ry * 1.32), (c + Vector((0, 0.04 * k, -rz * 0.55)), rx * 1.62, ry * 1.42)]
        tube_mesh(bm, rings, segments=26, kind='limb', cap_start=True, cap_end=False)
        slot = 'Lacquer'
    obj = _obj_from_bm(bm, f'Hat_{kind}', [slot], 'hat')
    obj['tv_style'] = kind
    _rigid(obj, arm, 'head')
    return obj


def hair_ornament(d: Dims, arm, style='pins'):
    c, rx, ry, rz = head_frame(d)
    k = d.height / 1.66
    bm = bmesh.new()
    top = Vector((0, c.y, c.z + rz))
    for sg in (-1, 1):
        base = top + Vector((sg * 0.055 * k, 0.045 * k, 0.020 * k))
        tube_mesh(bm, [(base, 0.0025 * k, 0.0025 * k), (base + Vector((sg * 0.03 * k, 0.03 * k, 0.05 * k)), 0.0025 * k, 0.0025 * k)], segments=6, kind='limb')
        res = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=7, radius=0.011 * k)
        for v in res['verts']:
            v.co += base + Vector((sg * 0.03 * k, 0.03 * k, 0.05 * k))
    obj = _obj_from_bm(bm, 'Ornament_pins', ['Metal'], 'accessory')
    obj['tv_style'] = style
    _rigid(obj, arm, 'head')
    return obj


def ear_drops(d: Dims, arm):
    c, rx, ry, rz = head_frame(d)
    k = d.height / 1.66
    bm = bmesh.new()
    for sg in (-1, 1):
        p = c + Vector((sg * rx * 1.05, ry * 0.08, -rz * 0.15))
        tube_mesh(bm, [(p, 0.0016 * k, 0.0016 * k), (p + Vector((0, 0, -0.030 * k)), 0.0016 * k, 0.0016 * k)], segments=5, kind='limb')
        res = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=7, radius=0.0075 * k)
        for v in res['verts']:
            v.co = Vector((v.co.x, v.co.y, v.co.z * 1.4)) + p + Vector((0, 0, -0.036 * k))
    obj = _obj_from_bm(bm, 'Accessory_ear_drops', ['Metal'], 'accessory')
    obj['tv_style'] = 'ear_drops'
    _rigid(obj, arm, 'head')
    return obj


def arm_wrap(d: Dims, body, arm):
    H = d.height
    j = layout(d)
    bm = bmesh.new()
    for s in ('l', 'r'):
        m = (lambda v: v) if s == 'l' else mirror
        el, wr = m(j['elbow']), m(j['wrist'])
        rings = []
        for i in range(7):
            u = 0.18 + 0.7 * i / 6
            c = el.lerp(wr, u)
            r = (0.026 - 0.008 * u) * H + 0.004 * H
            rings.append((c, r, r * 0.96))
        tube_mesh(bm, rings, segments=12, kind='limb', cap_start=False, cap_end=False)
    obj = _obj_from_bm(bm, 'Accessory_arm_wrap', ['Cloth'], 'accessory')
    obj['tv_style'] = 'arm_wrap'
    _from_body(obj, body, arm)
    orient_outward(obj, body)
    return obj


def prayer_beads(d: Dims, arm):
    H = d.height
    bm = bmesh.new()
    n = 24
    cy = 0.0
    for i in range(n):
        t = math.tau * i / n
        # a loop draped over the shoulders and hanging to the chest
        x = math.sin(t) * 0.075 * H
        y = -0.075 * H * math.cos(t) * 0.9 - 0.01 * H
        z = d.chest + 0.070 * H - 0.09 * H * (0.5 - 0.5 * math.cos(t)) if False else d.neck_base - 0.02 * H - 0.11 * H * (0.5 - 0.5 * math.cos(t))
        res = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.0085 * H)
        for v in res['verts']:
            v.co += Vector((x, y - 0.010 * H, z))
    obj = _obj_from_bm(bm, 'Accessory_prayer_beads', ['Lacquer'], 'accessory')
    obj['tv_style'] = 'prayer_beads'
    _rigid(obj, arm, 'spine_03')
    return obj


def travel_pack(d: Dims, arm):
    H = d.height
    bm = bmesh.new()
    cy = 0.10 * H / 1.66
    tube_mesh(bm, [(Vector((0, cy + 0.03 * H, d.chest + 0.02 * H)), 0.070 * H, 0.030 * H), (Vector((0, cy + 0.05 * H, d.chest + 0.07 * H)), 0.085 * H, 0.055 * H), (Vector((0, cy + 0.05 * H, d.chest + 0.15 * H)), 0.080 * H, 0.055 * H),
                   (Vector((0, cy + 0.04 * H, d.chest + 0.19 * H)), 0.060 * H, 0.040 * H)], segments=16, kind='limb')
    tube_mesh(bm, [(Vector((0, cy + 0.02 * H, d.chest + 0.20 * H)), 0.030 * H, 0.030 * H), (Vector((0, cy + 0.02 * H, d.chest + 0.27 * H)), 0.030 * H, 0.030 * H)], segments=10, kind='limb')  # rolled blanket
    obj = _obj_from_bm(bm, 'Accessory_travel_pack', ['Leather'], 'accessory')
    obj['tv_style'] = 'travel_pack'
    _rigid(obj, arm, 'spine_03')
    return obj


# --------------------------------------------------------------------------------------------
# The hero's parts: fox ears, a many-tailed brush, a fur stole and gold/crystal ornaments.
# --------------------------------------------------------------------------------------------

def add_fur_tufts(bm, count, length, width, droop=0.35, seed=5, min_up=-0.4, only_lower=None):
    """Scatter tapered fur tufts over a bmesh: each is a four-sided cone along the surface normal, drooping under gravity."""
    import random
    rnd = random.Random(seed)
    faces = [f for f in bm.faces if f.calc_area() > 1e-7]
    if not faces:
        return
    areas = [f.calc_area() for f in faces]
    total = sum(areas)
    for _ in range(count):
        r = rnd.random() * total
        acc = 0.0
        f = faces[-1]
        for fc, ar in zip(faces, areas):
            acc += ar
            if acc >= r:
                f = fc
                break
        vs = [v.co for v in f.verts]
        w = [rnd.random() for _ in vs]
        s = sum(w)
        p = sum((v * (wi / s) for v, wi in zip(vs, w)), Vector())
        n = f.normal.copy()
        if n.z < min_up:
            continue
        dirv = (n + Vector((0, 0, -droop)) + Vector((rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0))).normalized()
        L = length * (0.6 + 0.8 * rnd.random())
        side = dirv.cross(Vector((0, 0, 1)))
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        side.normalize()
        up2 = dirv.cross(side).normalized()
        base = [p + side * width + up2 * width * 0.3, p - side * width + up2 * width * 0.3, p + side * width * 0.0 - up2 * width]
        tip = p + dirv * L + Vector((0, 0, -droop * L * 0.4))
        vv = [bm.verts.new(x) for x in base] + [bm.verts.new(tip)]
        for i in range(3):
            try:
                bm.faces.new((vv[i], vv[(i + 1) % 3], vv[3]))
            except ValueError:
                pass


def hero_ear_bones(d: Dims):
    c, rx, ry, rz = head_frame(d)
    k = d.height / 1.66
    out = []
    for s, sg in (('l', 1), ('r', -1)):
        base = c + Vector((sg * rx * 0.55, ry * 0.05, rz * 0.82))
        out.append((f'ear_{s}_01', 'head', base, base + Vector((sg * 0.02 * k, 0.0, 0.055 * k))))
        out.append((f'ear_{s}_02', f'ear_{s}_01', base + Vector((sg * 0.02 * k, 0.0, 0.055 * k)), base + Vector((sg * 0.035 * k, 0.005 * k, 0.11 * k))))
    return out


def hero_tail_bones(d: Dims):
    H = d.height
    out = []
    parent = 'pelvis'
    p = Vector((0, 0.075 * H, d.pelvis - 0.005 * H))
    for i in range(6):
        q = p + Vector((0, 0.045 * H if i < 2 else 0.028 * H, -0.02 * H * (i - 1) if i > 1 else 0.03 * H))
        name = f'tail_{i + 1:02d}'
        out.append((name, parent, p, q))
        parent, p = name, q
    return out


def hero_ears(d: Dims, arm):
    c, rx, ry, rz = head_frame(d)
    k = d.height / 1.66
    bm = bmesh.new()
    for s, sg in (('l', 1), ('r', -1)):
        base = c + Vector((sg * rx * 0.55, ry * 0.05, rz * 0.82))
        # outer ear: a tall, slightly curved pointed shell, wide at the base; the inner face is a separate lighter shell
        rings = [(base + Vector((0, 0, -0.004 * k)), 0.036 * k, 0.014 * k), (base + Vector((sg * 0.012 * k, 0, 0.035 * k)), 0.034 * k, 0.013 * k), (base + Vector((sg * 0.025 * k, 0.003 * k, 0.08 * k)), 0.022 * k, 0.009 * k),
                 (base + Vector((sg * 0.036 * k, 0.006 * k, 0.125 * k)), 0.004 * k, 0.003 * k)]
        tube_mesh(bm, rings, segments=12, kind='limb', cap_start=True, cap_end=True)
    obj = _obj_from_bm(bm, 'Hero_ears', ['Fur'], 'hero')
    obj['tv_style'] = 'ears'
    g = {f'ear_{s}_01': None for s in ('l', 'r')}
    for v in obj.data.vertices:
        pass
    # weights: each ear to its own bone chain by side and height
    for name in ('head', 'ear_l_01', 'ear_l_02', 'ear_r_01', 'ear_r_02'):
        obj.vertex_groups.new(name=name)
    for v in obj.data.vertices:
        side = 'l' if v.co.x > 0 else 'r'
        u = smoothstep(c.z + rz * 0.80, c.z + rz * 0.80 + 0.11 * k, v.co.z)
        obj.vertex_groups['head'].add([v.index], max(0.0, 1.0 - u * 2.2), 'REPLACE')
        obj.vertex_groups[f'ear_{side}_01'].add([v.index], max(0.0, min(1.0, 1.4 - abs(u - 0.25) * 3)), 'REPLACE')
        obj.vertex_groups[f'ear_{side}_02'].add([v.index], max(0.0, u * 1.2 - 0.2), 'REPLACE')
    obj.parent = arm
    m = obj.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    m.use_vertex_groups = True
    normalise_weights(obj, limit=3)
    return obj


def hero_tail(d: Dims, arm):
    """A large, fluffy tail: a stack of tapering fur lobes following the tail bone chain."""
    H = d.height
    bones = hero_tail_bones(d)
    bm = bmesh.new()
    pts = [Vector(b[2]) for b in bones] + [Vector(bones[-1][3])]
    radii = [0.030, 0.050, 0.070, 0.078, 0.066, 0.040, 0.010]
    rings = [(p, r * H / 1.66, r * H / 1.66 * 1.15) for p, r in zip(pts, radii)]
    tube_mesh(bm, rings, segments=16, kind='limb', cap_start=True, cap_end=True)
    add_fur_tufts(bm, 1400, 0.11 * H / 1.66, 0.014 * H / 1.66, droop=0.25, seed=11, min_up=-1.0)
    obj = _obj_from_bm(bm, 'Hero_tail', ['Fur'], 'hero')
    obj['tv_style'] = 'tail'
    names = [b[0] for b in bones]
    for n in ['pelvis'] + names:
        obj.vertex_groups.new(name=n)
    for v in obj.data.vertices:
        best = min(range(len(bones)), key=lambda i: (v.co - (Vector(bones[i][2]) + Vector(bones[i][3])) * 0.5).length)
        obj.vertex_groups[names[best]].add([v.index], 1.0, 'REPLACE')
    obj.parent = arm
    m = obj.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    m.use_vertex_groups = True
    return obj


def hero_stole(d: Dims, arm, body):
    """An ivory fur stole draped across the shoulders and down the front."""
    H = d.height
    k = H / 1.66
    fit = Fit(d)
    bm = bmesh.new()
    n = 9
    rings = []
    for i in range(n + 1):
        u = i / n
        z = d.neck_base + 0.012 * H - u * 0.14 * H
        cy, rx, ry = fit.torso(z)
        w = rx + 0.05 * k + 0.07 * k * math.sin(min(1, u * 1.3) * 1.6)
        rings.append((Vector((0, cy, z)), w, ry + 0.045 * k + 0.02 * k * u))
    tube_mesh(bm, rings, segments=32, kind='limb', cap_start=False, cap_end=False)
    # trailing front lobes (the ends of the stole)
    for sg in (-1, 1):
        tube_mesh(bm, [(Vector((sg * 0.055 * H, -0.11 * H, d.chest + 0.02 * H)), 0.036 * H, 0.03 * H), (Vector((sg * 0.06 * H, -0.115 * H, d.chest - 0.08 * H)), 0.038 * H, 0.032 * H),
                       (Vector((sg * 0.062 * H, -0.11 * H, d.waist - 0.02 * H)), 0.030 * H, 0.026 * H), (Vector((sg * 0.062 * H, -0.105 * H, d.waist - 0.07 * H)), 0.012 * H, 0.010 * H)], segments=12, kind='limb')
    add_fur_tufts(bm, 1800, 0.06 * k, 0.011 * k, droop=0.5, seed=19, min_up=-0.6)
    obj = _obj_from_bm(bm, 'Hero_stole', ['Fur'], 'hero')
    obj['tv_style'] = 'stole'
    _from_body(obj, body, arm)
    orient_outward(obj, body)
    return obj


def hero_ornaments(d: Dims, arm):
    """Gold hair ornaments, crystal drops, and a moon-and-snowflake brooch at the sash."""
    c, rx, ry, rz = head_frame(d)
    k = d.height / 1.66
    bm = bmesh.new()
    for sg in (-1, 1):
        base = c + Vector((sg * rx * 0.85, -ry * 0.25, rz * 0.55))
        # a gold comb with hanging crystals
        tube_mesh(bm, [(base + Vector((0, 0, 0.0)), 0.004 * k, 0.010 * k), (base + Vector((sg * 0.006 * k, -0.005 * k, -0.04 * k)), 0.003 * k, 0.008 * k)], segments=6, kind='limb')
        for i in range(3):
            res = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.007 * k)
            for v in res['verts']:
                v.co = Vector((v.co.x, v.co.y, v.co.z * 1.7)) + base + Vector((sg * (0.010 + 0.004 * i) * k, -0.010 * k, -(0.05 + 0.03 * i) * k))
    obj = _obj_from_bm(bm, 'Hero_ornaments', ['Metal'], 'hero')
    obj['tv_style'] = 'ornaments'
    _rigid(obj, arm, 'head')
    return obj
