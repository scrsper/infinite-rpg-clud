"""The head: a UV-sphere skull with a modelled face, ears, eyes, and morph targets.

Every feature is a smooth bump or dent defined in the head's own unit coordinates, so the face can be
re-parameterised (face shape, femininity, blink, mouth) by evaluating the same function with different
parameters and storing the difference as a glTF morph target. Nothing is sculpted by hand and nothing
comes from an outside asset. The figure faces -Y; +X is its left.
"""
import math

import bmesh
import bpy
from mathutils import Vector

from common import Dims, gauss, smoothstep

DEFAULT = dict(jaw=1.0, chin=1.0, chin_h=1.0, cheek=1.0, brow=1.0, nose_len=1.0, nose_w=1.0, lips=1.0, eyes=1.0, z_scale=1.0, x_scale=1.0,
               fem=0.0, ear=1.0, mouth_open=0.0, blink=0.0, smile=0.0, cheekbone=1.0, forehead=1.0)


def head_frame(d: Dims):
    """Centre and radii of the skull ellipsoid."""
    H = d.height
    c = Vector((0.0, 0.021 * H, d.head_c))
    return c, d.head_w * 0.5, d.head_d * 0.5, d.head_h * 0.5


def face_position(n: Vector, d: Dims, p: dict) -> Vector:
    """Displaced position of the unit-sphere vertex direction `n` under parameters `p`."""
    c, rx, ry, rz = head_frame(d)
    fem = p['fem']
    zs = p['z_scale'] * (1.0 - 0.03 * fem)
    xs = p['x_scale'] * (1.0 - 0.04 * fem)
    nx, ny, nz = n.x, n.y, n.z
    f = -ny                                   # forward-ness: 1 at the face's centre
    front = smoothstep(0.05, 0.55, f)          # mask for features that live on the face
    ax = abs(nx)
    sx = 1.0 if nx >= 0 else -1.0
    # Jaw and chin: taper the lower skull, pull the chin forward and down.
    jaw = p['jaw'] * (1.0 - 0.10 * fem)
    lower = smoothstep(-0.05, -0.85, nz)
    wx = 1.0 - (1.0 - min(1.0, 0.94 * jaw)) * lower - 0.05 * lower
    # A blunt jaw instead of a pole: the last 20% of the skull's height is compressed into a broad, nearly flat underside that meets the neck.
    nzc = nz if nz > -0.80 else -0.80 + (nz + 0.80) * 0.16
    ycomp = 1.0 if nz > -0.80 else 1.0 + (-0.80 - nz) * 1.9
    px = nx * rx * wx * xs * ycomp
    py = ny * ry * (ycomp * 0.92 if nz <= -0.80 else 1.0)
    pz = nzc * rz * zs
    dx = dy = dz = 0.0
    # Lower skull is slightly flattened under the jaw so the throat reads.
    if nz < -0.6:
        dz += 0.004 * (nz + 0.6) * d.height * 0.4 * 0.0
    # --- Eyes: sockets, brow ridge, lids ---
    es = p['eyes']
    for sg in (-1.0, 1.0):
        ex, ez = 0.355 * sg, 0.055
        gx = gauss(nx - ex, 0.115 * es)
        gz = gauss(nz - ez, 0.085 * es)
        dy += 0.0055 * gx * gz * front                        # socket
        # Upper lid fold and lower lid rim.
        dy -= 0.0016 * gauss(nz - (ez + 0.10 * es), 0.03) * gx * front
        dy -= 0.0011 * gauss(nz - (ez - 0.085 * es), 0.03) * gx * front
        # Blink: the upper lid closes toward the lower one.
        if p['blink'] > 0:
            dz -= p['blink'] * 0.0058 * gauss(nz - (ez + 0.05), 0.08) * gx * front
            dy -= p['blink'] * 0.0012 * gauss(nz - (ez + 0.02), 0.06) * gx * front
    dy -= 0.0058 * p['brow'] * (1.0 - 0.35 * fem) * gauss(nz - 0.235, 0.06) * (1.0 - 0.45 * smoothstep(0.0, 0.9, ax)) * front
    dy -= 0.0040 * p['forehead'] * gauss(nz - 0.52, 0.16) * front * (1.0 - 0.3 * ax)
    # --- Nose ---
    nl, nw = p['nose_len'], p['nose_w']
    bridge = gauss(nx, 0.06 * nw)
    tip_prof = smoothstep(0.24, -0.11, nz) * (1.0 - smoothstep(-0.135, -0.205, nz) * 0.85)
    dy -= (0.021 * nl * tip_prof) * bridge * front
    dy -= 0.011 * nl * gauss(nz + 0.135, 0.030) * gauss(nx, 0.055 * nw) * front       # tip
    for sg in (-1.0, 1.0):
        dy -= 0.0062 * gauss(nz + 0.165, 0.030) * gauss(nx - 0.095 * sg * nw, 0.038) * front   # alae
        dy += 0.0036 * gauss(nz + 0.195, 0.014) * gauss(nx - 0.052 * sg * nw, 0.020) * front   # nostril
    dy += 0.0022 * gauss(nz + 0.225, 0.02) * gauss(nx, 0.05) * front                       # under the nose
    # --- Cheeks and cheekbones ---
    for sg in (-1.0, 1.0):
        dy -= 0.0055 * p['cheek'] * gauss(nx - 0.50 * sg, 0.17) * gauss(nz + 0.16, 0.16) * front
        dy -= 0.0032 * p['cheekbone'] * gauss(nx - 0.56 * sg, 0.10) * gauss(nz + 0.01, 0.07) * front
        dy += 0.0020 * gauss(nx - 0.56 * sg, 0.09) * gauss(nz + 0.27, 0.07) * front * (1 - fem * 0.3)   # hollow under the cheekbone
    # --- Mouth ---
    lips = p['lips'] * (1.0 + 0.25 * fem)
    open_ = p['mouth_open']
    smile = p['smile']
    m_z = -0.365
    dy -= 0.0043 * lips * gauss(nz - (m_z + 0.030), 0.024) * gauss(nx, 0.27) * front                 # upper lip
    dy -= 0.0052 * lips * gauss(nz - (m_z - 0.032 - open_ * 0.02), 0.028) * gauss(nx, 0.25) * front  # lower lip
    dy += 0.0030 * gauss(nz - m_z, 0.0085) * gauss(nx, 0.30) * front * (1.0 + 2.2 * open_)           # the mouth line
    dy += 0.0016 * gauss(nz - (m_z + 0.075), 0.03) * gauss(nx, 0.045) * front                        # philtrum
    dy -= 0.0025 * gauss(nz - (m_z + 0.075), 0.02) * gauss(nx - 0.07, 0.03) * front
    dz -= open_ * 0.0125 * smoothstep(m_z + 0.02, m_z - 0.20, nz) * gauss(nx, 0.34) * front           # jaw drops
    dz += smile * 0.0035 * gauss(ax - 0.30, 0.06) * gauss(nz - m_z, 0.05) * front
    # --- Chin ---
    dy -= 0.0085 * p['chin'] * gauss(nz + 0.66 * p['chin_h'], 0.10) * gauss(nx, 0.20 - 0.04 * (1 - jaw)) * front
    dy += 0.0022 * gauss(nz - (m_z - 0.115), 0.028) * gauss(nx, 0.24) * front                        # under-lip dent
    # --- Ears: a plate with a rim, standing off the side of the skull ---
    if ax > 0.80:
        e = gauss(ny - 0.10, 0.20) * gauss(nz + 0.03, 0.21)
        rim = gauss(math.hypot((ny - 0.10) / 0.20, (nz + 0.03) / 0.26) - 1.0, 0.30)
        dx += sx * p['ear'] * (0.012 * e * (0.55 + 0.45 * rim) + 0.006 * e * e) * smoothstep(0.80, 0.96, ax) * (1.0 - 0.18 * fem)
    return Vector((px + dx, py + c.y * 0 + dy, pz + dz)) + Vector((0, 0, 0))


def build_head(d: Dims, arm, name='Head'):
    """Create the head object with morph targets and head-bone weights."""
    c, rx, ry, rz = head_frame(d)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=56, v_segments=40, radius=1.0)
    normals = [v.co.copy().normalized() for v in bm.verts]
    # Face UVs: planar front projection, so a painted skin texture lines up with the modelled features.
    uv = bm.loops.layers.uv.new('UVMap')
    for face in bm.faces:
        for loop in face.loops:
            n = loop.vert.co.normalized()
            loop[uv].uv = (0.5 + n.x * 0.5, 0.5 + n.z * 0.5)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True

    def evaluate(**over):
        p = dict(DEFAULT)
        p.update(over)
        return [face_position(n, d, p) + c for n in normals]

    base = evaluate()
    for v, pos in zip(mesh.vertices, base):
        v.co = pos
    obj.shape_key_add(name='Basis', from_mix=False)
    shapes = {
        'blink': dict(blink=1.0),
        'mouth_open': dict(mouth_open=1.0),
        'smile': dict(smile=1.0),
        'face_round': dict(jaw=1.25, chin=0.55, cheek=1.6, z_scale=0.95, x_scale=1.06, cheekbone=0.6),
        'face_square': dict(jaw=1.35, chin=1.0, chin_h=1.05, cheek=0.7, cheekbone=1.1, brow=1.2),
        'face_heart': dict(jaw=0.62, chin=0.9, cheek=0.85, forehead=1.3, cheekbone=1.4, x_scale=1.02),
        'face_long': dict(jaw=0.95, z_scale=1.09, x_scale=0.93, chin=1.2, chin_h=1.02, nose_len=1.15),
        'face_angular': dict(jaw=0.9, chin=1.5, cheekbone=1.8, cheek=0.5, brow=1.2, nose_len=1.1),
        'feminine': dict(fem=1.0),
        'masculine': dict(fem=-1.0, brow=1.25, jaw=1.1),
    }
    for key, over in shapes.items():
        sk = obj.shape_key_add(name=key, from_mix=False)
        for v, pos in zip(sk.data, evaluate(**over)):
            v.co = pos
        sk.value = 0.0
    return obj


def eye_meshes(d: Dims, arm):
    """Two eyeballs set in the sockets: a sphere whose front carries the iris, on its own material slot."""
    c, rx, ry, rz = head_frame(d)
    H = d.height
    objs = []
    for sg, tag in ((1.0, 'L'), (-1.0, 'R')):
        nx, nz = 0.355 * sg, 0.055
        ny = -math.sqrt(max(0.0, 1.0 - nx * nx - nz * nz))
        surf = Vector((nx * rx, ny * ry, nz * rz)) + c
        r = 0.0128 * H / 1.66 * (1.0 if d.sex != 'c' else 1.15)
        centre = surf + Vector((0, r * 0.62, 0))
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=r)
        for v in bm.verts:
            v.co += centre
        # Front-facing UV (the iris disc is painted at the centre of this square).
        uv = bm.loops.layers.uv.new('UVMap')
        for face in bm.faces:
            for loop in face.loops:
                q = (loop.vert.co - centre) / r
                loop[uv].uv = (0.5 + q.x * 0.5, 0.5 + q.z * 0.5)
        mesh = bpy.data.meshes.new('Eye' + tag)
        bm.to_mesh(mesh)
        bm.free()
        for poly in mesh.polygons:
            poly.use_smooth = True
        obj = bpy.data.objects.new('Eye' + tag, mesh)
        bpy.context.scene.collection.objects.link(obj)
        objs.append(obj)
    return objs


def mouth_interior(d: Dims):
    """A shallow dark cavity behind the lips, so an open mouth reads as an opening."""
    c, rx, ry, rz = head_frame(d)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * rx * 0.30, v.co.y * ry * 0.10, v.co.z * rz * 0.075))
        v.co += c + Vector((0, -ry * 0.90, rz * -0.365))
    mesh = bpy.data.meshes.new('Mouth')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('Mouth', mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def weight_all(obj, bone='head'):
    g = obj.vertex_groups.new(name=bone)
    g.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')


def bind(obj, arm):
    obj.parent = arm
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    mod.use_vertex_groups = True
