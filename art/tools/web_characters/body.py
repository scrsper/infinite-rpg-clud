"""The skeleton and the skinned body (neck down) for one build.

The body is built from explicit lofted tubes (torso, arms, legs, feet) whose cross-sections have
their own width and depth at every ring, welded into one surface with a voxel remesh, smoothed and
decimated. Hands stay separate fine geometry. It is then shaped (bust, glutes, calves, deltoids) with
smooth bumps so sex and build read in silhouette under clothes. Weights are computed here from bone
geometry: for every vertex the nearest few bone segments share the weight, with a falloff that
widens at joints so elbows and knees bend without creasing to a point.
"""
import math

import bmesh
import bpy
from mathutils import Vector

from common import Dims, gauss, smoothstep

DEFORM = [
    'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head',
    'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'thumb_01_l', 'thumb_02_l', 'fingers_01_l', 'fingers_02_l',
    'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thumb_01_r', 'thumb_02_r', 'fingers_01_r', 'fingers_02_r',
    'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r',
]


def mirror(v):
    return Vector((-v.x, v.y, v.z))


def layout(d: Dims):
    """Joint positions for the left half (+X) and the spine, from proportions."""
    H = d.height
    c = d.sex == 'c'
    a1, a2 = 0.40, 0.30            # A-pose: arm angles from straight down (radians)
    upper, fore, hand = (0.172 if not c else 0.165) * H, (0.150 if not c else 0.150) * H, (0.070 if not c else 0.072) * H
    j = {}
    j['pelvis_h'] = Vector((0, 0.0, d.pelvis))
    j['waist'] = Vector((0, 0.0, d.waist))
    j['chest'] = Vector((0, 0.0, d.chest))
    j['shoulder_line'] = Vector((0, 0.0, d.shoulder_z))
    j['neck_b'] = Vector((0, 0.008 * H, d.neck_base))
    j['neck_t'] = Vector((0, 0.012 * H, d.neck_top))
    j['head_top'] = Vector((0, 0.014 * H, d.head_c + d.head_h * 0.5))
    j['clav'] = Vector((0.018 * H, -0.006 * H, d.shoulder_z - 0.004 * H))
    sh = Vector((d.shoulder_x, 0.0, d.shoulder_z - 0.012 * H))
    j['shoulder'] = sh
    el = sh + Vector((math.sin(a1), 0.02, -math.cos(a1))).normalized() * upper
    j['elbow'] = el
    wr = el + Vector((math.sin(a2), -0.16, -math.cos(a2))).normalized() * fore
    j['wrist'] = wr
    hand_dir = Vector((math.sin(a2 * 0.7), -0.12, -math.cos(a2 * 0.7))).normalized()
    j['hand_end'] = wr + hand_dir * hand
    j['fingers_1'] = wr + hand_dir * (hand * 0.55)
    j['fingers_2'] = wr + hand_dir * (hand * 0.80)
    j['fingers_end'] = wr + hand_dir * (hand * 1.08)
    j['thumb_1'] = wr + hand_dir * (hand * 0.18) + Vector((-0.012 * H, -0.020 * H, 0))
    j['thumb_2'] = j['thumb_1'] + (hand_dir + Vector((-0.25, -0.5, 0))).normalized() * (hand * 0.36)
    j['thumb_end'] = j['thumb_2'] + (hand_dir + Vector((-0.2, -0.6, 0))).normalized() * (hand * 0.34)
    hx = d.hip_x
    j['hip'] = Vector((hx, 0.0, d.hip))
    j['knee'] = Vector((hx + 0.004 * H, -0.010 * H, d.knee))
    j['ankle'] = Vector((hx + 0.006 * H, 0.012 * H, d.ankle))
    flen = (0.145 if not c else 0.150) * H
    j['ball'] = Vector((hx + 0.008 * H, j['ankle'].y - flen * 0.72, 0.026 * H))
    j['toe'] = Vector((hx + 0.010 * H, j['ankle'].y - flen * 1.04, 0.014 * H))
    return j


def build_armature(d: Dims, extra=None):
    """Create the armature object (rest pose = A-pose). `extra` adds (name, parent, head, tail) bones."""
    j = layout(d)
    arm_data = bpy.data.armatures.new('Armature')
    arm = bpy.data.objects.new('Armature', arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    E = arm_data.edit_bones

    def bone(name, parent, head, tail, roll=0.0, connect=False, deform=True):
        b = E.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        if (b.tail - b.head).length < 1e-4:
            b.tail = b.head + Vector((0, 0, 0.01))
        b.roll = roll
        b.use_deform = deform
        if parent:
            b.parent = E[parent]
            b.use_connect = connect
        return b

    bone('pelvis', None, j['pelvis_h'] - Vector((0, 0, 0.02)), j['waist'])
    bone('spine_01', 'pelvis', j['waist'], (j['waist'] + j['chest']) / 2, connect=True)
    bone('spine_02', 'spine_01', (j['waist'] + j['chest']) / 2, j['chest'], connect=True)
    bone('spine_03', 'spine_02', j['chest'], j['shoulder_line'], connect=True)
    bone('neck_01', 'spine_03', j['neck_b'], j['neck_t'])
    bone('head', 'neck_01', j['neck_t'], j['head_top'], connect=True)
    for s, m in (('l', lambda v: v), ('r', mirror)):
        bone(f'clavicle_{s}', 'spine_03', m(j['clav']), m(j['shoulder']))
        bone(f'upperarm_{s}', f'clavicle_{s}', m(j['shoulder']), m(j['elbow']), connect=True)
        bone(f'lowerarm_{s}', f'upperarm_{s}', m(j['elbow']), m(j['wrist']), connect=True)
        bone(f'hand_{s}', f'lowerarm_{s}', m(j['wrist']), m(j['fingers_1']), connect=True)
        bone(f'thumb_01_{s}', f'hand_{s}', m(j['thumb_1']), m(j['thumb_2']))
        bone(f'thumb_02_{s}', f'thumb_01_{s}', m(j['thumb_2']), m(j['thumb_end']), connect=True)
        bone(f'fingers_01_{s}', f'hand_{s}', m(j['fingers_1']), m(j['fingers_2']), connect=True)
        bone(f'fingers_02_{s}', f'fingers_01_{s}', m(j['fingers_2']), m(j['fingers_end']), connect=True)
        bone(f'thigh_{s}', 'pelvis', m(j['hip']), m(j['knee']))
        bone(f'calf_{s}', f'thigh_{s}', m(j['knee']), m(j['ankle']), connect=True)
        bone(f'foot_{s}', f'calf_{s}', m(j['ankle']), m(j['ball']), connect=True)
        bone(f'ball_{s}', f'foot_{s}', m(j['ball']), m(j['toe']), connect=True)
    for name, parent, head, tail in (extra or []):
        bone(name, parent, head, tail)
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


# ---------------------------------------------------------------------------------------------
# Lofted parts
# ---------------------------------------------------------------------------------------------

def _frame(T, kind='limb'):
    """(side, front) unit vectors of a cross-section perpendicular to tangent T. The figure faces -Y."""
    T = Vector(T).normalized()
    if kind == 'foot':
        return Vector((1, 0, 0)), Vector((0, 0, 1))
    hint = Vector((0, -1, 0))
    if abs(T.dot(hint)) > 0.7:
        # A tube running along the figure's front-back axis (a quadruped's barrel): keep the section frame tied to 'up' so it cannot flip between rings.
        hint = Vector((0, 0, 1))
    front = hint - T * hint.dot(T)
    if front.length < 1e-4:
        front = Vector((0, 0, 1))
    front.normalize()
    if hint.z == 1 and front.z < 0:
        front = -front
    side = T.cross(front).normalized()
    return side, front


def tube_mesh(bm, rings, segments=20, kind='limb', cap_start=True, cap_end=True):
    """Add a lofted tube to `bm`. `rings` is [(centre, rx, ry)]; the section frame follows the path."""
    n = len(rings)
    loops = []
    for i, (c, rx, ry) in enumerate(rings):
        a = rings[max(i - 1, 0)][0]
        b = rings[min(i + 1, n - 1)][0]
        T = b - a
        if T.length < 1e-6:
            T = Vector((0, 0, 1))
        side, front = _frame(T, kind)
        loops.append([bm.verts.new(c + side * (rx * math.cos(math.tau * k / segments)) + front * (ry * math.sin(math.tau * k / segments))) for k in range(segments)])
    for i in range(n - 1):
        for k in range(segments):
            k2 = (k + 1) % segments
            try:
                bm.faces.new((loops[i][k], loops[i][k2], loops[i + 1][k2], loops[i + 1][k]))
            except ValueError:
                pass
    if cap_start:
        try:
            bm.faces.new(list(reversed(loops[0])))
        except ValueError:
            pass
    if cap_end:
        try:
            bm.faces.new(loops[-1])
        except ValueError:
            pass
    return loops


def _at(a, b, t):
    return a + (b - a) * t


def round_start(rings, steps=(72, 48, 22)):
    """Prepend rings that close the start of a tube like a hemisphere, so a limb fades into the torso instead of ending in a flat cap."""
    c0, rx0, ry0 = rings[0]
    c1 = rings[1][0]
    T = (c1 - c0).normalized()
    out = []
    for deg in steps:
        phi = math.radians(deg)
        out.append((c0 - T * (max(rx0, ry0) * math.sin(phi) * 0.9), rx0 * math.cos(phi), ry0 * math.cos(phi)))
    return out + list(rings)


def torso_rings(d: Dims):
    H = d.height
    prof = [
        (0.470, d.hips_rx * 0.72, d.hips_ry * 0.78, 0.004),
        (0.500, d.hips_rx * 0.96, d.hips_ry * 0.98, 0.006),
        (0.530, d.hips_rx * 1.02, d.hips_ry * 1.02, 0.008),
        (0.580, (d.hips_rx + d.waist_rx) * 0.53, (d.hips_ry + d.waist_ry) * 0.53, 0.004),
        (0.625, d.waist_rx, d.waist_ry, 0.0),
        (0.675, (d.waist_rx + d.chest_rx) * 0.5, (d.waist_ry + d.chest_ry) * 0.5, -0.002),
        (0.725, d.chest_rx * 0.99, d.chest_ry * 1.0, -0.004),
        (0.770, d.chest_rx * 1.04, d.chest_ry * 0.96, -0.004),
        (0.808, d.chest_rx * 0.98, d.chest_ry * 0.80, -0.002),
        (0.832, d.chest_rx * 0.50, d.chest_ry * 0.60, 0.002),
        (0.846, 0.036 * H, 0.038 * H, 0.006),
    ]
    return [(Vector((0, cy * H / 1.7, zf * H)), rx, ry) for zf, rx, ry, cy in prof]


def arm_rings(d: Dims, s):
    H = d.height
    j = layout(d)
    m = (lambda v: v) if s == 'l' else mirror
    sh, el, wr = m(j['shoulder']), m(j['elbow']), m(j['wrist'])
    c = d.sex == 'c'
    return [
        (sh + Vector((-0.004 * H if s == 'l' else 0.004 * H, 0.0, -0.008 * H)), 0.032 * H if not c else 0.029 * H, 0.033 * H if not c else 0.030 * H),
        (_at(sh, el, 0.25), 0.031 * H, 0.033 * H if not c else 0.030 * H),
        (_at(sh, el, 0.6), 0.027 * H, 0.029 * H),
        (el, 0.024 * H, 0.025 * H),
        (_at(el, wr, 0.22), 0.026 * H, 0.025 * H),
        (_at(el, wr, 0.6), 0.021 * H, 0.020 * H),
        (wr, 0.0165 * H, 0.0140 * H),
    ]


def leg_rings(d: Dims, s):
    H = d.height
    j = layout(d)
    m = (lambda v: v) if s == 'l' else mirror
    hp, kn, an = m(j['hip']), m(j['knee']), m(j['ankle'])
    return [
        (hp + Vector((0, 0, 0.022 * H)), 0.050 * H, 0.054 * H),
        (_at(hp, kn, 0.15), 0.051 * H, 0.055 * H),
        (_at(hp, kn, 0.5), 0.045 * H, 0.049 * H),
        (_at(hp, kn, 0.85), 0.035 * H, 0.038 * H),
        (kn, 0.031 * H, 0.033 * H),
        (_at(kn, an, 0.22), 0.033 * H, 0.037 * H),
        (_at(kn, an, 0.45), 0.030 * H, 0.034 * H),
        (_at(kn, an, 0.8), 0.021 * H, 0.023 * H),
        (an, 0.019 * H, 0.020 * H),
    ]


def foot_rings(d: Dims, s):
    H = d.height
    j = layout(d)
    m = (lambda v: v) if s == 'l' else mirror
    an, ball, toe = m(j['ankle']), m(j['ball']), m(j['toe'])
    heel = an + Vector((0, 0.020 * H, -0.020 * H))
    mid = an.lerp(ball, 0.5) + Vector((0, 0, -0.012 * H))
    return [
        (heel + Vector((0, 0, 0.002 * H)), 0.024 * H, 0.020 * H),
        (an + Vector((0, -0.004 * H, -0.024 * H)), 0.028 * H, 0.030 * H),
        (mid, 0.031 * H, 0.020 * H),
        (ball, 0.036 * H, 0.014 * H),
        (toe, 0.030 * H, 0.010 * H),
    ]


def hand_parts(bm, d: Dims, s):
    """A hand with a separate thumb: palm block, finger block, thumb."""
    H = d.height
    j = layout(d)
    m = (lambda v: v) if s == 'l' else mirror
    wr, f1, f2, fe = m(j['wrist']), m(j['fingers_1']), m(j['fingers_2']), m(j['fingers_end'])
    th1, th2, the = m(j['thumb_1']), m(j['thumb_2']), m(j['thumb_end'])
    tube_mesh(bm, [(wr - (f1 - wr) * 0.12, 0.0175 * H, 0.0145 * H), (wr + (f1 - wr) * 0.35, 0.0235 * H, 0.0105 * H), (f1, 0.0250 * H, 0.0098 * H),
                   (f2, 0.0225 * H, 0.0088 * H), (fe, 0.0130 * H, 0.0065 * H)], segments=12)
    tube_mesh(bm, [(th1, 0.0100 * H, 0.0095 * H), (th2, 0.0092 * H, 0.0088 * H), (the, 0.0068 * H, 0.0066 * H)], segments=10)


def _select_only(obj):
    for o in list(bpy.context.selected_objects):
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def build_body_mesh(d: Dims, voxel=0.010, target_tris=12000):
    """Union the tube parts into one welded surface with a voxel remesh, smooth it, decimate it."""
    H = d.height
    bm = bmesh.new()
    tube_mesh(bm, torso_rings(d), segments=28)
    neck_f = d.sex == 'f'
    tube_mesh(bm, [(Vector((0, 0.008 * H, d.neck_base - 0.02 * H)), (0.033 if neck_f else 0.038) * H, (0.033 if neck_f else 0.040) * H), (Vector((0, 0.011 * H, d.neck_base + (0.007 if neck_f else 0.02) * H)), (0.024 if neck_f else 0.030) * H, (0.025 if neck_f else 0.033) * H),
                   (Vector((0, 0.016 * H, d.neck_top - 0.004 * H)), (0.022 if neck_f else 0.028) * H, (0.023 if neck_f else 0.031) * H)], segments=24)
    for s in ('l', 'r'):
        tube_mesh(bm, round_start(arm_rings(d, s)), segments=18, cap_start=True)
        tube_mesh(bm, round_start(leg_rings(d, s)), segments=20, cap_start=True)
        tube_mesh(bm, foot_rings(d, s), segments=14, kind='foot')
    mesh = bpy.data.meshes.new('BodyBase')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('Body', mesh)
    bpy.context.scene.collection.objects.link(obj)
    _select_only(obj)
    obj.data.remesh_voxel_size = voxel
    obj.data.remesh_voxel_adaptivity = 0.0
    bpy.ops.object.voxel_remesh()
    sm = obj.modifiers.new('Smooth', 'LAPLACIANSMOOTH')
    sm.iterations = 12
    sm.lambda_factor = 0.35
    sm.use_volume_preserve = True
    bpy.ops.object.modifier_apply(modifier='Smooth')
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tris > target_tris:
        dec = obj.modifiers.new('Decimate', 'DECIMATE')
        dec.ratio = target_tris / tris
        bpy.ops.object.modifier_apply(modifier='Decimate')
    hb = bmesh.new()
    for s in ('l', 'r'):
        hand_parts(hb, d, s)
    hmesh = bpy.data.meshes.new('Hands')
    hb.to_mesh(hmesh)
    hb.free()
    hobj = bpy.data.objects.new('Hands', hmesh)
    bpy.context.scene.collection.objects.link(hobj)
    _select_only(obj)
    hobj.select_set(True)
    bpy.ops.object.join()
    shape_body(obj, d)
    return obj


def shape_body(obj, d: Dims):
    """Bumps that make sex and build legible: bust, glutes, calves, deltoids, trapezius."""
    H = d.height
    f = d.sex == 'f'
    c = d.sex == 'c'
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for v in bm.verts:
        p = v.co
        x, y, z = p.x, p.y, p.z
        dx = dy = dz = 0.0
        ax = abs(x)
        if f and not c:
            for sgn in (-1, 1):
                r2 = ((x - sgn * 0.052 * H) ** 2 + (z - 0.706 * H) ** 2)
                if y < 0:
                    dy -= 0.022 * H * math.exp(-r2 / (2 * (0.030 * H) ** 2))
                    dz += 0.004 * H * math.exp(-r2 / (2 * (0.030 * H) ** 2))
            for sgn in (-1, 1):
                r2 = ((x - sgn * 0.045 * H) ** 2 + (z - 0.530 * H) ** 2)
                if y > 0:
                    dy += 0.014 * H * math.exp(-r2 / (2 * (0.034 * H) ** 2))
        elif not c:
            dz += 0.006 * H * gauss(ax - 0.05 * H, 0.03 * H) * gauss(z - 0.835 * H, 0.02 * H)
            if y < 0:
                dy -= 0.008 * H * gauss(z - 0.72 * H, 0.05 * H) * (1 - smoothstep(0.0, 0.09 * H, ax))
        if d.ankle + 0.02 < z < d.knee and y > 0.0:
            dy += 0.006 * H * gauss(z - (d.knee * 0.72 + d.ankle * 0.28), 0.06 * H)
        p.x += dx
        p.y += dy
        p.z += dz
    bm.to_mesh(obj.data)
    bm.free()
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()

    # Voxel smoothing can inflate the capped neck above its authored rest landmark.
    # Restore that contour before binding; the face and skeleton retain their own scale.
    start=.812*H
    for v in obj.data.vertices:
        if v.co.z <= start or abs(v.co.x) > .08*H: continue
        t=min(1,max(0,(v.co.z-start)/(.065*H)))
        v.co.z=start+(d.neck_top-.002*H-start)*t
        throat=(.0215 if f else .0255)*H
        radius=throat+(.038*H-throat)*(1-t)**2
        cy=.012*H
        radial=Vector((v.co.x,v.co.y-cy,0))
        if radial.length>radius:
            radial*=radius/radial.length
            v.co.x=radial.x; v.co.y=radial.y+cy
    obj.data.update()


# ---------------------------------------------------------------------------------------------
# Weights
# ---------------------------------------------------------------------------------------------

def _segment_distance(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length, t


def bone_segments(arm):
    m = arm.matrix_world
    return {b.name: (m @ b.head_local, m @ b.tail_local) for b in arm.data.bones if b.use_deform and b.name in DEFORM}


# How far each bone's influence reaches before falling off (metres).
INFLUENCE = {
    'pelvis': 0.13, 'spine_01': 0.13, 'spine_02': 0.14, 'spine_03': 0.15, 'neck_01': 0.075, 'head': 0.11,
    'clavicle_l': 0.07, 'clavicle_r': 0.07, 'upperarm_l': 0.075, 'upperarm_r': 0.075, 'lowerarm_l': 0.055, 'lowerarm_r': 0.055,
    'hand_l': 0.05, 'hand_r': 0.05, 'thumb_01_l': 0.03, 'thumb_01_r': 0.03, 'thumb_02_l': 0.025, 'thumb_02_r': 0.025,
    'fingers_01_l': 0.035, 'fingers_01_r': 0.035, 'fingers_02_l': 0.03, 'fingers_02_r': 0.03,
    'thigh_l': 0.09, 'thigh_r': 0.09, 'calf_l': 0.06, 'calf_r': 0.06, 'foot_l': 0.05, 'foot_r': 0.05, 'ball_l': 0.03, 'ball_r': 0.03,
}


def assign_weights(obj, arm, max_influences=4, reach_scale=1.0):
    """Distance-weighted skinning: each bone's raw weight is a Gaussian of the distance to its segment,
    limited to the correct side of the body; the best few are normalised. Adjacent bones are both close
    at a joint, so joints blend."""
    segs = bone_segments(arm)
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    groups = {n: obj.vertex_groups.new(name=n) for n in segs}
    mw = obj.matrix_world
    for v in obj.data.vertices:
        p = mw @ v.co
        scores = []
        for name, (a, b) in segs.items():
            side = name[-2:] if name.endswith(('_l', '_r')) else ''
            if side == '_l' and p.x < -0.02:
                continue
            if side == '_r' and p.x > 0.02:
                continue
            dist, _ = _segment_distance(p, a, b)
            reach = INFLUENCE.get(name, 0.08) * reach_scale
            scores.append((math.exp(-(dist / reach) ** 2 * 1.6), name))
        scores.sort(reverse=True)
        top = scores[:max_influences]
        total = sum(w for w, _ in top)
        if total <= 1e-6:
            top, total = [(1.0, scores[0][1])], 1.0
        for w, name in top:
            wn = w / total
            if wn > 0.01:
                groups[name].add([v.index], wn, 'REPLACE')


def bind(obj, arm):
    obj.parent = arm
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    mod.use_vertex_groups = True


def build_body(sex='f', height=None, extra_bones=None):
    d = Dims(sex, height)
    arm = build_armature(d, extra=extra_bones)
    body = build_body_mesh(d)
    assign_weights(body, arm)
    bind(body, arm)
    return d, arm, body
