"""Quadruped creatures (roe deer, woodland boar, field hare) and the concept-art previews built on the same rig.

One skeleton layout serves every quadruped; a species is a table of proportions. Bodies are lofted tubes welded
with a voxel remesh, exactly like the human kit, so limbs blend into the barrel and the neck into the shoulder.
Vertex colours carry the coat pattern (belly, rump patch, leg socks, face mask) as a multiplier over the
species' base coat colour, which the client sets. The figure faces -Y; +X is its left.
"""
import math

import bmesh
import bpy
from mathutils import Vector

from common import smoothstep
from body import tube_mesh, _select_only, _segment_distance

SPECIES = {
    # name: proportions (metres at natural scale) — shoulder height, body length, depth, etc.
    'roe_deer': dict(sh=0.74, hip=0.72, L=0.98, depth=0.34, width=0.19, neck=0.42, neck_r=0.07, head=0.23, head_r=0.058, ear=0.13, tail=0.05, leg_r=0.030, haunch=1.0, coat=(0.62, 0.44, 0.28), antler=True, height=1.16),
    'woodland_boar': dict(sh=0.62, hip=0.58, L=1.05, depth=0.44, width=0.30, neck=0.22, neck_r=0.15, head=0.34, head_r=0.085, ear=0.07, tail=0.14, leg_r=0.036, haunch=1.0, coat=(0.22, 0.17, 0.13), tusk=True, hump=0.06, height=0.78),
    'field_hare': dict(sh=0.24, hip=0.30, L=0.42, depth=0.17, width=0.11, neck=0.09, neck_r=0.045, head=0.10, head_r=0.036, ear=0.15, tail=0.04, leg_r=0.014, haunch=1.6, coat=(0.62, 0.48, 0.32), height=0.42, sit=True),
}

LEG_BONES = ['scapula', 'upper', 'lower', 'paw']
BONES = ['root', 'pelvis', 'spine_01', 'spine_02', 'neck_01', 'neck_02', 'head', 'jaw', 'ear_l_01', 'ear_l_02', 'ear_r_01', 'ear_r_02', 'tail_01', 'tail_02', 'tail_03'] + \
    [f'{s}_{b}' for s in ('fl', 'fr') for b in ('scapula', 'upper', 'lower', 'paw')] + [f'{s}_{b}' for s in ('bl', 'br') for b in ('thigh', 'lower', 'cannon', 'paw')]


def joints(sp):
    """All joint positions from a species table."""
    S = sp
    h, hp, L = S['sh'], S['hip'], S['L']
    j = {}
    rump_y, chest_y = L * 0.5, -L * 0.5
    j['rump'] = Vector((0, rump_y, hp + 0.03))
    j['mid'] = Vector((0, 0.0, max(h, hp) + 0.02 + S.get('hump', 0)))
    j['withers'] = Vector((0, chest_y + 0.12, h + 0.04 + S.get('hump', 0)))
    j['chest'] = Vector((0, chest_y + 0.02, h * 0.86))
    nb = Vector((0, chest_y + 0.02, h + 0.02))
    j['neck_b'] = nb
    nl = S['neck']
    ang = 0.75 if not S.get('sit') else 0.6
    j['neck_m'] = nb + Vector((0, -math.cos(ang) * nl * 0.5, math.sin(ang) * nl * 0.5))
    j['neck_t'] = nb + Vector((0, -math.cos(ang) * nl, math.sin(ang) * nl))
    hl = S['head']
    j['head_c'] = j['neck_t'] + Vector((0, -hl * 0.35, hl * 0.10))
    j['muzzle'] = j['neck_t'] + Vector((0, -hl * 0.95, -hl * 0.18))
    lo = j['muzzle'] + Vector((0, 0.02, -0.03))
    j['jaw'] = lo
    for s, sg in (('l', 1), ('r', -1)):
        w = S['width'] * 0.5
        f = 'f' + s
        j[f + '_scap'] = Vector((sg * w * 0.80, chest_y + 0.16, h * 0.86))
        j[f + '_elbow'] = Vector((sg * w * 0.78, chest_y + 0.20, h * 0.60))
        j[f + '_knee'] = Vector((sg * w * 0.75, chest_y + 0.17, h * 0.36))
        j[f + '_fet'] = Vector((sg * w * 0.72, chest_y + 0.15, h * 0.10))
        j[f + '_toe'] = Vector((sg * w * 0.72, chest_y + 0.11, 0.0))
        b = 'b' + s
        hs = S.get('haunch', 1.0)
        j[b + '_hip'] = Vector((sg * w * 0.85, rump_y - 0.08, hp * 0.92))
        j[b + '_stifle'] = Vector((sg * w * 0.95, rump_y - 0.18 * hs, hp * 0.66))
        j[b + '_hock'] = Vector((sg * w * 0.80, rump_y + 0.02, hp * 0.38))
        j[b + '_fet'] = Vector((sg * w * 0.72, rump_y - 0.02, hp * 0.10))
        j[b + '_toe'] = Vector((sg * w * 0.72, rump_y - 0.08, 0.0))
        j['ear_' + s + '_b'] = j['head_c'] + Vector((sg * S['head_r'] * 0.8, hl * 0.25, S['head_r'] * 0.9))
        j['ear_' + s + '_t'] = j['ear_' + s + '_b'] + Vector((sg * S['ear'] * 0.25, S['ear'] * (0.1 if S.get('sit') else -0.05), S['ear']))
    j['tail_b'] = Vector((0, rump_y + 0.01, hp + 0.02))
    j['tail_t'] = j['tail_b'] + Vector((0, S['tail'], -S['tail'] * 0.2))
    return j


def build_armature(sp, extra=None):
    j = joints(sp)
    data = bpy.data.armatures.new('CreatureArmature')
    arm = bpy.data.objects.new('CreatureArmature', data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    E = data.edit_bones

    def bone(name, parent, head, tail, connect=False):
        b = E.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        if (b.tail - b.head).length < 1e-4:
            b.tail = b.head + Vector((0, 0, 0.01))
        if parent:
            b.parent = E[parent]
            b.use_connect = connect
        return b

    bone('root', None, Vector((0, 0, 0.02)), Vector((0, 0.1, 0.02)))
    bone('pelvis', 'root', j['rump'], j['mid'])
    bone('spine_01', 'pelvis', j['mid'], j['withers'], True)
    bone('spine_02', 'spine_01', j['withers'], j['neck_b'], True)
    bone('neck_01', 'spine_02', j['neck_b'], j['neck_m'])
    bone('neck_02', 'neck_01', j['neck_m'], j['neck_t'], True)
    bone('head', 'neck_02', j['neck_t'], j['muzzle'], True)
    bone('jaw', 'head', j['jaw'] + Vector((0, 0.03, 0.02)), j['jaw'] + Vector((0, -0.03, -0.02)))
    for s in ('l', 'r'):
        bone(f'ear_{s}_01', 'head', j[f'ear_{s}_b'], (j[f'ear_{s}_b'] + j[f'ear_{s}_t']) / 2)
        bone(f'ear_{s}_02', f'ear_{s}_01', (j[f'ear_{s}_b'] + j[f'ear_{s}_t']) / 2, j[f'ear_{s}_t'], True)
        f, b = 'f' + s, 'b' + s
        bone(f'{f}_scapula', 'spine_02', j[f + '_scap'] + Vector((0, 0.06, 0.06)), j[f + '_scap'])
        bone(f'{f}_upper', f'{f}_scapula', j[f + '_scap'], j[f + '_elbow'], True)
        bone(f'{f}_lower', f'{f}_upper', j[f + '_elbow'], j[f + '_knee'], True)
        bone(f'{f}_paw', f'{f}_lower', j[f + '_knee'], j[f + '_toe'], True)
        bone(f'{b}_thigh', 'pelvis', j[b + '_hip'], j[b + '_stifle'])
        bone(f'{b}_lower', f'{b}_thigh', j[b + '_stifle'], j[b + '_hock'], True)
        bone(f'{b}_cannon', f'{b}_lower', j[b + '_hock'], j[b + '_fet'], True)
        bone(f'{b}_paw', f'{b}_cannon', j[b + '_fet'], j[b + '_toe'], True)
    bone('tail_01', 'pelvis', j['tail_b'], j['tail_b'].lerp(j['tail_t'], 0.4))
    bone('tail_02', 'tail_01', j['tail_b'].lerp(j['tail_t'], 0.4), j['tail_b'].lerp(j['tail_t'], 0.75), True)
    bone('tail_03', 'tail_02', j['tail_b'].lerp(j['tail_t'], 0.75), j['tail_t'], True)
    for name, parent, head, tail in (extra or []):
        bone(name, parent, head, tail)
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def _tube(bm, pts, radii, segments=14, kind='limb'):
    rings = [(Vector(p), r[0], r[1]) for p, r in zip(pts, radii)]
    return tube_mesh(bm, rings, segments=segments, kind=kind)


def build_body(sp, voxel=None, target_tris=22000):
    j = joints(sp)
    S = sp
    k = S['sh'] / 0.74
    bm = bmesh.new()
    w, d = S['width'] * 0.5, S['depth'] * 0.5
    # Barrel: rump, hips, mid, ribs, chest, with the spine's gentle arch.
    spine = [j['rump'] + Vector((0, 0.13, -0.05)), j['rump'] + Vector((0, 0.06, -0.02)), j['rump'], j['rump'].lerp(j['mid'], 0.5), j['mid'], j['mid'].lerp(j['withers'], 0.5), j['withers'], j['chest'] + Vector((0, 0.0, 0.04))]
    # Deep at the chest and withers, tucked at the flank, rounded at the haunch: a body, not a sausage.
    rad = [(w * 0.30, d * 0.34), (w * 0.60, d * 0.66), (w * 0.94, d * 0.88), (w * 0.86, d * 0.74), (w * 0.96, d * 0.86), (w * 1.02, d * 1.04), (w * 0.98, d * 1.12), (w * 0.86, d * 1.0)]
    # Barrel cross-sections are taller than wide; the spine curve sits on the top line, so centre each ring lower.
    ctr = [p - Vector((0, 0, r[1] * 0.6)) for p, r in zip(spine, rad)]
    _tube(bm, ctr, [(r[0], r[1]) for r in rad], segments=18)
    # Neck into the shoulder.
    nr = S['neck_r']
    # The neck's first ring is buried inside the chest so its cap never shows as a collar.
    _tube(bm, [j['neck_b'] + Vector((0, 0.14, -0.05)), j['neck_b'], j['neck_m'], j['neck_t']], [(nr * 1.15, nr * 1.2), (nr * 1.1, nr * 1.15), (nr * 0.95, nr), (nr * 0.75, nr * 0.8)], segments=14)
    # Head: skull and a tapering muzzle.
    hr = S['head_r']
    _tube(bm, [j['neck_t'] + Vector((0, 0.03, 0.0)), j['head_c'], j['head_c'].lerp(j['muzzle'], 0.6), j['muzzle']], [(hr * 1.0, hr * 1.05), (hr * 1.05, hr * 1.1), (hr * 0.72, hr * 0.68), (hr * 0.5, hr * 0.42)], segments=14)
    for s in ('l', 'r'):
        f, b = 'f' + s, 'b' + s
        lr = S['leg_r']
        sgn = 1 if s == 'l' else -1   # first ring inside the ribcage, so no shoulder-blade disc shows on the surface
        _tube(bm, [j[f + '_scap'] + Vector((-sgn * w * 0.7, 0.03, 0.08)), j[f + '_scap'], j[f + '_elbow'], j[f + '_knee'], j[f + '_fet'], j[f + '_toe'] + Vector((0, 0, 0.01))],
              [(lr * 1.5, lr * 1.5), (lr * 1.7, lr * 1.7), (lr * 1.25, lr * 1.25), (lr * 0.8, lr * 0.9), (lr * 0.7, lr * 0.75), (lr * 0.85, lr * 0.85)], segments=10)
        hs = S.get('haunch', 1.0)
        _tube(bm, [j[b + '_hip'] + Vector((-sgn * w * 0.6, 0.0, 0.10)), j[b + '_hip'], j[b + '_stifle'], j[b + '_hock'], j[b + '_fet'], j[b + '_toe'] + Vector((0, 0, 0.01))],
              [(lr * 2.3 * hs, lr * 2.4 * hs), (lr * 2.1 * hs, lr * 2.2 * hs), (lr * 1.35, lr * 1.45), (lr * 0.85, lr * 0.95), (lr * 0.7, lr * 0.75), (lr * 0.85, lr * 0.85)], segments=10)
    _tube(bm, [j['tail_b'], j['tail_b'].lerp(j['tail_t'], 0.5), j['tail_t']], [(0.02 * k, 0.02 * k), (0.022 * k, 0.022 * k), (0.008 * k, 0.008 * k)], segments=8)
    mesh = bpy.data.meshes.new('CreatureBase')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('CreatureBody', mesh)
    bpy.context.scene.collection.objects.link(obj)
    _select_only(obj)
    obj.data.remesh_voxel_size = voxel or max(0.006, 0.010 * k)
    obj.data.remesh_voxel_adaptivity = 0.0
    bpy.ops.object.voxel_remesh()
    sm = obj.modifiers.new('Smooth', 'LAPLACIANSMOOTH')
    sm.iterations = 45
    sm.lambda_factor = 0.5
    sm.use_volume_preserve = True
    bpy.ops.object.modifier_apply(modifier='Smooth')
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tris > target_tris:
        dec = obj.modifiers.new('Decimate', 'DECIMATE')
        dec.ratio = target_tris / tris
        bpy.ops.object.modifier_apply(modifier='Decimate')
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def add_pattern(obj, sp, name):
    """Coat pattern as a vertex-colour multiplier: pale belly, dark legs below the knee, face mask, rump patch."""
    mesh = obj.data
    col = mesh.color_attributes.new(name='Color', type='BYTE_COLOR', domain='POINT')
    j = joints(sp)
    h = sp['sh']
    for i, v in enumerate(mesh.vertices):
        p = v.co
        g = 0.86 + 0.10 * smoothstep(0.35 * h, 0.95 * h, p.z)                         # dorsal darker than the flanks
        belly = smoothstep(0.62 * h, 0.40 * h, p.z) * (1.0 if -0.42 * sp['L'] < p.y < 0.5 * sp['L'] else 0.0)
        g = g + 0.20 * belly
        leg = smoothstep(0.34 * h, 0.12 * h, p.z) * (1 if abs(p.x) > 0.02 else 0)
        g = g * (1.0 - 0.36 * leg)
        r, gg, b = g, g, g
        if name == 'roe_deer':
            rump = smoothstep(0.30, 0.12, math.hypot(p.x, p.y - (sp['L'] * 0.5 - 0.02))) * smoothstep(0.55 * h, 0.75 * h, p.z)
            r, gg, b = lerp3((r, gg, b), (1.25, 1.22, 1.15), rump * 0.9)
        face = smoothstep(j['neck_t'].y - 0.03, j['muzzle'].y + 0.02, p.y) * smoothstep(j['neck_t'].z - 0.16, j['neck_t'].z + 0.02, p.z) if p.y < j['neck_t'].y else 0.0
        if face > 0:
            r, gg, b = lerp3((r, gg, b), (0.55, 0.5, 0.48) if name != 'field_hare' else (0.9, 0.85, 0.8), face * 0.55)
        col.data[i].color = (min(1.0, r), min(1.0, gg), min(1.0, b), 1.0)


def lerp3(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


REACH = {'root': 0.1, 'pelvis': 0.18, 'spine_01': 0.20, 'spine_02': 0.20, 'neck_01': 0.09, 'neck_02': 0.08, 'head': 0.10, 'jaw': 0.03}


def assign(obj, arm, sp, max_influences=4):
    segs = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones if b.use_deform and b.name in BONES}
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    groups = {n: obj.vertex_groups.new(name=n) for n in segs}
    k = sp['sh'] / 0.74
    for v in obj.data.vertices:
        p = obj.matrix_world @ v.co
        scores = []
        for name, (a, b) in segs.items():
            if name == 'root':
                continue
            side = 'l' if name.startswith(('fl_', 'bl_')) or name.endswith('_l_01') or name.endswith('_l_02') else 'r' if name.startswith(('fr_', 'br_')) or '_r_0' in name else ''
            if side == 'l' and p.x < -0.015 * k:
                continue
            if side == 'r' and p.x > 0.015 * k:
                continue
            dist, t = _segment_distance(p, a, b)
            reach = REACH.get(name, 0.05) * k
            if name.startswith(('ear', 'tail')):
                reach = 0.04 * k
            scores.append((math.exp(-(dist / reach) ** 2 * 1.5), name))
        scores.sort(reverse=True)
        top = scores[:max_influences]
        total = sum(w for w, _ in top)
        if total <= 1e-6:
            top, total = [(1.0, scores[0][1])], 1.0
        for w, name in top:
            if w / total > 0.01:
                groups[name].add([v.index], w / total, 'REPLACE')
    obj.parent = arm
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    mod.use_vertex_groups = True


def rigid(obj, arm, bone):
    g = obj.vertex_groups.new(name=bone)
    g.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')
    obj.parent = arm
    m = obj.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    m.use_vertex_groups = True


def _obj(bm, name, slot, tag, style=''):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.materials.append(bpy.data.materials.get('TV_' + slot) or bpy.data.materials.new('TV_' + slot))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['tv_part'] = tag
    obj['tv_style'] = style
    return obj


def ears(sp, arm):
    j = joints(sp)
    bm = bmesh.new()
    S = sp
    for s, sg in (('l', 1), ('r', -1)):
        b, t = j[f'ear_{s}_b'], j[f'ear_{s}_t']
        mid = (b + t) / 2
        rings = [(b, 0.014 * S['ear'] / 0.13 + 0.006, 0.006), (mid + Vector((sg * 0.006, 0, 0)), 0.024 * S['ear'] / 0.13 + 0.006, 0.006), (t, 0.004, 0.003)]
        tube_mesh(bm, rings, segments=8, kind='limb')
    obj = _obj(bm, 'Ears', 'Hide', 'ears')
    for name in ('head', 'ear_l_01', 'ear_l_02', 'ear_r_01', 'ear_r_02'):
        obj.vertex_groups.new(name=name)
    for v in obj.data.vertices:
        side = 'l' if v.co.x > 0 else 'r'
        u = smoothstep(j[f'ear_{side}_b'].z, j[f'ear_{side}_t'].z, v.co.z)
        obj.vertex_groups['head'].add([v.index], max(0.0, 0.5 - u), 'REPLACE')
        obj.vertex_groups[f'ear_{side}_01'].add([v.index], max(0.0, 1.0 - abs(u - 0.3) * 2.2), 'REPLACE')
        obj.vertex_groups[f'ear_{side}_02'].add([v.index], max(0.0, u - 0.4), 'REPLACE')
    obj.parent = arm
    m = obj.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    m.use_vertex_groups = True
    return obj


def hooves(sp, arm):
    j = joints(sp)
    bm = bmesh.new()
    lr = sp['leg_r']
    for pre in ('fl', 'fr', 'bl', 'br'):
        top = j[pre + '_fet'] + Vector((0, 0, 0.005)) if pre.startswith('f') else j[pre + '_fet'] + Vector((0, 0, 0.005))
        toe = j[pre + '_toe']
        tube_mesh(bm, [(top, lr * 0.95, lr * 1.0), (top.lerp(toe, 0.6) + Vector((0, -0.005, 0)), lr * 1.0, lr * 1.05), (toe + Vector((0, -0.012, 0.004)), lr * 0.9, lr * 0.55)], segments=8)
    obj = _obj(bm, 'Hooves', 'Hoof', 'hooves')
    for pre, bone in (('fl', 'fl_paw'), ('fr', 'fr_paw'), ('bl', 'bl_paw'), ('br', 'br_paw')):
        obj.vertex_groups.new(name=bone)
    for v in obj.data.vertices:
        side = 'l' if v.co.x > 0 else 'r'
        front = v.co.y < (joints(sp)['rump'].y - 0.2)
        bone = ('f' if front else 'b') + side + '_paw'
        obj.vertex_groups[bone].add([v.index], 1.0, 'REPLACE')
    obj.parent = arm
    m = obj.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    m.use_vertex_groups = True
    return obj


def eyes(sp, arm):
    j = joints(sp)
    bm = bmesh.new()
    hr = sp['head_r']
    for sg in (1, -1):
        c = j['head_c'] + Vector((sg * hr * 0.9, -0.03 * (sp['head'] / 0.23), hr * 0.32))
        res = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=7, radius=hr * 0.2)
        for v in res['verts']:
            v.co += c
    obj = _obj(bm, 'Eyes', 'CreatureEye', 'eyes')
    rigid(obj, arm, 'head')
    return obj


def antlers(sp, arm, spread=1.0, tines=3, scale=1.0, style='roe'):
    j = joints(sp)
    bm = bmesh.new()
    k = sp['sh'] / 0.74 * scale
    for sg in (1, -1):
        base = j['head_c'] + Vector((sg * sp['head_r'] * 0.55, sp['head'] * 0.10, sp['head_r'] * 1.0))
        pts = [base, base + Vector((sg * 0.03 * spread * k, 0.015 * k, 0.09 * k)), base + Vector((sg * 0.055 * spread * k, 0.03 * k, 0.19 * k)), base + Vector((sg * 0.05 * spread * k, 0.02 * k, 0.27 * k))]
        rad = [(0.012 * k, 0.012 * k), (0.010 * k, 0.010 * k), (0.008 * k, 0.008 * k), (0.004 * k, 0.004 * k)]
        _tube(bm, pts, rad, segments=7)
        for t in range(tines):
            u = 0.35 + 0.22 * t
            i0 = min(2, int(u * 3)); a, bb = pts[i0], pts[i0 + 1]
            p0 = a.lerp(bb, u * 3 - i0)
            dirv = Vector((sg * 0.5, -0.7 if t % 2 else 0.5, 0.75)).normalized()
            _tube(bm, [p0, p0 + dirv * 0.045 * k, p0 + dirv * 0.095 * k], [(0.007 * k, 0.007 * k), (0.005 * k, 0.005 * k), (0.002 * k, 0.002 * k)], segments=6)
    obj = _obj(bm, 'Antlers', 'Antler', 'antlers', style)
    rigid(obj, arm, 'head')
    return obj


def tusks(sp, arm):
    j = joints(sp)
    bm = bmesh.new()
    for sg in (1, -1):
        b = j['muzzle'] + Vector((sg * sp['head_r'] * 0.45, 0.06, -0.01))
        _tube(bm, [b, b + Vector((sg * 0.015, -0.03, 0.03)), b + Vector((sg * 0.02, -0.055, 0.075)), b + Vector((sg * 0.012, -0.05, 0.11))], [(0.009, 0.009), (0.008, 0.008), (0.006, 0.006), (0.002, 0.002)], segments=7)
    obj = _obj(bm, 'Tusks', 'Tusk', 'tusks')
    rigid(obj, arm, 'head')
    return obj


def mane(sp, arm):
    """A ridge of bristles along the boar's back."""
    j = joints(sp)
    bm = bmesh.new()
    n = 9
    for i in range(n):
        u = i / (n - 1)
        p = j['withers'].lerp(j['rump'], u) + Vector((0, 0, 0.02 + 0.03 * math.sin(u * math.pi)))
        _tube(bm, [p, p + Vector((0, 0.01, 0.04)), p + Vector((0, 0.025, 0.075))], [(0.01, 0.006), (0.007, 0.004), (0.002, 0.002)], segments=5)
    obj = _obj(bm, 'Mane', 'Hide', 'mane')
    for name in ('spine_01', 'spine_02', 'pelvis'):
        obj.vertex_groups.new(name=name)
    for v in obj.data.vertices:
        u = (j['withers'].y - v.co.y) / max(1e-4, (j['withers'].y - j['rump'].y))
        obj.vertex_groups['spine_02' if u < 0.35 else 'spine_01' if u < 0.75 else 'pelvis'].add([v.index], 1.0, 'REPLACE')
    obj.parent = arm
    m = obj.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    m.use_vertex_groups = True
    return obj
