"""Hair styles for the head, built from a scalp shell and swept strands.

Every style is a function of the head's own frame, so it fits the female, male and child heads. Long
hair is skinned to three three-bone chains behind the head (left-back, centre-back, right-back) that the
client animates as secondary motion; a vertex takes its weight from how far down the chain it lies.
Vertex colours carry a root-to-tip gradient (multiplied by the hair colour at runtime).
"""
import math

import bmesh
import bpy
from mathutils import Vector

from common import Dims, smoothstep
from head import head_frame, face_position, DEFAULT

HAIR_STYLES = ['shaved', 'cropped', 'short_swept', 'topknot', 'warrior_bun', 'tied_back', 'loose_long', 'wavy_long', 'braided', 'twin_braid',
               'updo_ornamented', 'ponytail', 'bob', 'unkempt', 'side_fringe', 'hero_long']
SLOTS = ['Hair', 'Accent', 'Metal']


def chains(d: Dims):
    """Rest positions of the hair bone chains: name -> [p0..p3] (model space, Z up, facing -Y)."""
    c, rx, ry, rz = head_frame(d)
    H = d.height
    z0 = c.z - rz * 0.30
    out = {}
    for tag, x in (('l', 0.62), ('b', 0.0), ('r', -0.62)):
        base_y = c.y + ry * (0.78 if tag != 'b' else 0.90)
        pts = []
        for k in range(4):
            drop = [0.0, 0.09, 0.20, 0.34][k] * H / 1.66 * 1.0
            pts.append(Vector((x * rx * 0.95, base_y + [0.0, 0.020, 0.030, 0.030][k] * H / 1.66, z0 - drop)))
        out[tag] = pts
    return out


def hair_bones(d: Dims):
    """(name, parent, head, tail) tuples for build_armature(extra=...)."""
    out = []
    for tag, pts in chains(d).items():
        parent = 'head'
        for k in range(3):
            name = f'hair_{tag}_{k + 1:02d}'
            out.append((name, parent, pts[k], pts[k + 1]))
            parent = name
    return out


def _strand_tube(bm, pts, widths, thick, segments=6, twist=0.0):
    """A flat swept ribbon-tube along `pts` (list of Vector) with per-point half-width; thickness is the ribbon's depth."""
    n = len(pts)
    loops = []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n - 1)]
        T = (b - a)
        if T.length < 1e-6:
            T = Vector((0, 0, -1))
        T.normalize()
        # Width direction: horizontal, perpendicular to the strand; depth direction: away from the head axis.
        w = T.cross(Vector((0, 0, 1)))
        if w.length < 1e-4:
            w = Vector((1, 0, 0))
        w.normalize()
        out = w.cross(T).normalized()
        wr = widths[i]
        loop = []
        for k in range(segments):
            t = math.tau * k / segments + twist * i
            loop.append(bm.verts.new(p + w * (wr * math.cos(t)) + out * (thick * math.sin(t))))
        loops.append(loop)
    for i in range(n - 1):
        for k in range(segments):
            k2 = (k + 1) % segments
            try:
                bm.faces.new((loops[i][k], loops[i][k2], loops[i + 1][k2], loops[i + 1][k]))
            except ValueError:
                pass
    for ring, flip in ((loops[0], True), (loops[-1], False)):
        try:
            bm.faces.new(list(reversed(ring)) if flip else ring)
        except ValueError:
            pass


def _blob(bm, centre, radii, seg=14, ring=9):
    res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=1.0)
    for v in res['verts']:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2])) + centre


def _path_on_chain(chain, start_scale=1.0, samples=8, spread=0.0, x_off=0.0, y_off=0.0, sway=0.0, phase=0.0, length_k=1.0):
    """Sample the chain's polyline; optionally offset/sway sideways. Returns list of Vector."""
    pts = []
    for i in range(samples):
        u = i / (samples - 1) * length_k
        seg = min(2, int(u * 3)) if u < 1 else 2
        t = u * 3 - seg
        a, b = chain[seg], chain[seg + 1]
        p = a.lerp(b, min(1.0, t))
        p = p + Vector((x_off + math.sin(u * 6 + phase) * sway * u, y_off, 0))
        pts.append(p)
    return pts


def build_hair(d: Dims, style: str, name=None):
    """Returns (object, bm_stats). Weights are assigned by `weight_hair`."""
    c, rx, ry, rz = head_frame(d)
    H = d.height
    k = H / 1.66
    bm = bmesh.new()
    ch = chains(d)
    # ---- scalp shell from the head's own surface ----
    cover = {'shaved': 0.0015, 'cropped': 0.006, 'short_swept': 0.011, 'topknot': 0.005, 'warrior_bun': 0.006, 'tied_back': 0.008, 'loose_long': 0.012, 'wavy_long': 0.014,
             'braided': 0.009, 'twin_braid': 0.009, 'updo_ornamented': 0.010, 'ponytail': 0.008, 'bob': 0.013, 'unkempt': 0.014, 'side_fringe': 0.011, 'hero_long': 0.014}[style] * k
    seg_u, seg_v = 96, 64
    res = bmesh.ops.create_uvsphere(bm, u_segments=seg_u, v_segments=seg_v, radius=1.0)
    p = dict(DEFAULT)

    def base_fn(n):
        nx, ny, nz = n.x, n.y, n.z
        ax = abs(nx)
        if ny <= 0:
            hf = 0.60 - 0.30 * min(1.0, ax / 0.9) ** 1.4
            base = hf * (1 - smoothstep(-0.7, -0.05, ny)) + (-0.03) * smoothstep(-0.7, -0.05, ny)
        else:
            base = -0.03 + (-0.64 + 0.03) * smoothstep(0.0, 0.9, ny)
        if style in ('shaved', 'cropped'):
            base += 0.12
        if style == 'bob':
            base = base * 0.6 - 0.20 * smoothstep(-0.4, 0.4, abs(ny))
        return base

    def included(n):
        if n.z <= base_fn(n):
            return False
        if abs(n.x) > 0.86 and abs(n.y - 0.08) < 0.32 and n.z < 0.28 and style != 'bob':
            return False
        return True

    keep = {v.index for v in bm.verts if included(v.co.normalized())}
    # Snap the lowest kept vertex of each meridian onto the exact hairline so the edge is smooth, not stair-stepped.
    lower = {}
    for v in bm.verts:
        if v.index not in keep:
            continue
        n0 = v.co.normalized()
        for e in v.link_edges:
            o = e.other_vert(v)
            if o.index not in keep and o.co.z < v.co.z:
                lon = math.atan2(n0.y, n0.x)
                lo, hi = math.asin(max(-1, min(1, o.co.normalized().z))), math.asin(max(-1, min(1, n0.z)))
                for _ in range(24):
                    mid = (lo + hi) / 2
                    nm = Vector((math.cos(mid) * math.cos(lon), math.cos(mid) * math.sin(lon), math.sin(mid)))
                    if included(nm):
                        hi = mid
                    else:
                        lo = mid
                lower[v.index] = Vector((math.cos(hi) * math.cos(lon), math.cos(hi) * math.sin(lon), math.sin(hi)))
                break
    for v in list(bm.verts):
        n = lower.get(v.index, v.co.normalized())
        pos = face_position(n, d, p) + c
        out = (pos - c).normalized()
        feather = 0.35 if v.index in lower else 1.0
        v.co = pos + out * cover * feather * (1.0 + 0.6 * smoothstep(0.0, 1.0, n.z))
    drop = [f for f in bm.faces if not all(v.index in keep for v in f.verts)]
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)

    top = Vector((0, c.y, c.z + rz))
    back_top = Vector((0, c.y + ry * 0.55, c.z + rz * 0.82))
    W = lambda a: a * k
    # ---- style strands ----
    if style == 'short_swept':
        for i in range(7):
            u = (i - 3) / 3
            pts = [Vector((u * rx * 0.62, c.y - ry * 0.92 + 0.008 * k, c.z + rz * 0.86)), Vector((u * rx * 0.75 + 0.018 * k, c.y - ry * 1.04, c.z + rz * 0.60)), Vector((u * rx * 0.85 + 0.04 * k, c.y - ry * 1.02, c.z + rz * 0.42))]
            _strand_tube(bm, pts, [W(0.014), W(0.014), W(0.006)], W(0.008), 5)
    elif style == 'topknot':
        _blob(bm, top + Vector((0, 0.010 * k, W(0.028))), (W(0.024), W(0.022), W(0.030)))
    elif style == 'warrior_bun':
        _blob(bm, back_top + Vector((0, W(0.030), W(0.012))), (W(0.040), W(0.036), W(0.040)))
    elif style == 'tied_back':
        _strand_tube(bm, _path_on_chain(ch['b'], samples=5, length_k=0.4, y_off=0.0), [W(0.020), W(0.022), W(0.020), W(0.014), W(0.004)], W(0.014), 7)
    elif style in ('loose_long', 'wavy_long'):
        import random
        rnd = random.Random(11)
        wave = 0.022 * k if style == 'wavy_long' else 0.0
        strands = 13
        for i in range(strands):
            u = (i - (strands - 1) / 2) / ((strands - 1) / 2)
            chain = ch['l'] if u > 0.35 else ch['r'] if u < -0.35 else ch['b']
            L = 0.80 + 0.20 * rnd.random()
            n_s = 12
            pts = _path_on_chain(chain, samples=n_s, sway=wave, phase=i * 0.7, length_k=L)
            spread = rx * (0.40 + 0.55 * abs(u) ** 0.9) * (1 if u >= 0 else -1) * 1.05
            pts = [Vector((spread * (0.7 + 0.5 * (j / (n_s - 1))) + (pt.x * 0.0), pt.y + 0.004 * k * abs(u) + 0.006 * k * (j / n_s) * (1 - abs(u)), pt.z)) for j, pt in enumerate(pts)]
            widths = [W(0.030) * (1.0 - 0.92 * smoothstep(0.50, 1.0, j / (n_s - 1))) + W(0.002) for j in range(n_s)]
            _strand_tube(bm, pts, widths, W(0.013), 6)
        # face-framing locks with pointed tips
        for sg in (-1, 1):
            pts = [Vector((sg * rx * 0.98, c.y - ry * 0.62, c.z + rz * 0.18)), Vector((sg * rx * 1.04, c.y - ry * 0.42, c.z - rz * 0.25)), Vector((sg * rx * 1.02, c.y - ry * 0.28, c.z - rz * 0.85)),
                   Vector((sg * rx * 0.98, c.y - ry * 0.20, c.z - rz * 1.6)), Vector((sg * rx * 0.94, c.y - ry * 0.16, c.z - rz * 2.3))]
            _strand_tube(bm, pts, [W(0.012), W(0.016), W(0.015), W(0.009), W(0.002)], W(0.008), 6)
    elif style == 'hero_long':
        import random
        rnd = random.Random(23)
        strands = 25
        for i in range(strands):
            u = (i - (strands - 1) / 2) / ((strands - 1) / 2)
            chain = ch['l'] if u > 0.35 else ch['r'] if u < -0.35 else ch['b']
            L = 1.15 + 0.35 * rnd.random()
            n_s = 14
            pts = _path_on_chain(chain, samples=n_s, sway=0.030 * k, phase=i * 0.5, length_k=min(1.0, L))
            ext = max(0.0, L - 1.0)
            spread = rx * (0.30 + 0.62 * abs(u) ** 0.85) * (1 if u >= 0 else -1) * 1.08
            pts = [Vector((spread * (0.75 + 0.55 * (j / (n_s - 1))), pt.y + 0.006 * k * (j / n_s) + 0.004 * k * abs(u), pt.z - (ext * 0.34 * k * (j / (n_s - 1)) ** 1.5)) ) for j, pt in enumerate(pts)]
            widths = [W(0.036) * (1.0 - 0.94 * smoothstep(0.55, 1.0, j / (n_s - 1))) + W(0.002) for j in range(n_s)]
            _strand_tube(bm, pts, widths, W(0.014), 6)
        # straight fringe across the brow and two long framing locks
        for i in range(9):
            u = (i - 4) / 4
            pts = [Vector((u * rx * 0.62, c.y - ry * 0.86, c.z + rz * 0.92)), Vector((u * rx * 0.72, c.y - ry * 1.02, c.z + rz * 0.62)), Vector((u * rx * 0.76, c.y - ry * 1.03, c.z + rz * 0.34))]
            _strand_tube(bm, pts, [W(0.016), W(0.016), W(0.004)], W(0.007), 5)
        for sg in (-1, 1):
            pts = [Vector((sg * rx * 0.96, c.y - ry * 0.70, c.z + rz * 0.20)), Vector((sg * rx * 1.08, c.y - ry * 0.55, c.z - rz * 0.4)), Vector((sg * rx * 1.05, c.y - ry * 0.4, c.z - rz * 1.1)), Vector((sg * rx * 1.02, c.y - ry * 0.3, c.z - rz * 2.0)), Vector((sg * rx * 0.96, c.y - ry * 0.24, c.z - rz * 3.0)), Vector((sg * rx * 0.9, c.y - ry * 0.2, c.z - rz * 3.8))]
            _strand_tube(bm, pts, [W(0.013), W(0.018), W(0.018), W(0.014), W(0.008), W(0.002)], W(0.010), 6)
    elif style == 'braided':
        pts = _path_on_chain(ch['b'], samples=8, y_off=0.0)
        for i, pt in enumerate(pts):
            _blob(bm, pt + Vector((0.006 * k * (1 if i % 2 else -1), 0.004 * k, 0)), (W(0.020 - i * 0.0012), W(0.018 - i * 0.001), W(0.024)), 10, 7)
    elif style == 'twin_braid':
        for tag in ('l', 'r'):
            pts = _path_on_chain(ch[tag], samples=8, y_off=0.0)
            for i, pt in enumerate(pts):
                _blob(bm, pt + Vector((0.005 * k * (1 if i % 2 else -1), 0.0, 0)), (W(0.016 - i * 0.001), W(0.015 - i * 0.001), W(0.022)), 10, 7)
    elif style == 'updo_ornamented':
        _blob(bm, top + Vector((0, W(0.004), W(0.040))), (W(0.048), W(0.040), W(0.040)))
        _blob(bm, top + Vector((W(0.030), W(0.012), W(0.018))), (W(0.026), W(0.024), W(0.026)))
        _blob(bm, top + Vector((-W(0.030), W(0.012), W(0.018))), (W(0.026), W(0.024), W(0.026)))
    elif style == 'ponytail':
        start = Vector((0, c.y + ry * 0.62, c.z + rz * 0.55))
        pts = [start, start + Vector((0, W(0.045), W(0.030))), Vector((0, c.y + ry * 1.42, c.z - rz * 0.20)), ch['b'][2], ch['b'][3] + Vector((0, 0, -W(0.04)))]
        _strand_tube(bm, pts, [W(0.020), W(0.030), W(0.034), W(0.030), W(0.010)], W(0.020), 8)
    elif style == 'bob':
        # A bell: the shell already reaches the jaw; add a thick lower edge ring of hair.
        pass
    elif style == 'unkempt':
        import random
        rnd = random.Random(7)
        for i in range(14):
            a = rnd.random() * math.tau
            r0 = Vector((math.cos(a) * rx * 0.6, c.y + math.sin(a) * ry * 0.5, c.z + rz * 0.85))
            pts = [r0, r0 + Vector((math.cos(a) * W(0.03), math.sin(a) * W(0.03), W(0.03))), r0 + Vector((math.cos(a) * W(0.06), math.sin(a) * W(0.06), W(0.02)))]
            _strand_tube(bm, pts, [W(0.010), W(0.008), W(0.002)], W(0.006), 5)
    elif style == 'side_fringe':
        for i in range(8):
            u = (i - 3.5) / 3.5
            pts = [Vector((u * rx * 0.5, c.y - ry * 0.90, c.z + rz * 0.88)), Vector((u * rx * 0.7 + W(0.02), c.y - ry * 1.05, c.z + rz * 0.55)), Vector((u * rx * 0.9 + W(0.04), c.y - ry * 1.05, c.z + rz * 0.05)), Vector((u * rx * 0.95 + W(0.05), c.y - ry * 0.95, c.z - rz * 0.35))]
            _strand_tube(bm, pts, [W(0.016), W(0.016), W(0.013), W(0.004)], W(0.008), 5)
        for sg in (-1,):
            pts = [Vector((sg * rx * 0.97, c.y - ry * 0.3, c.z)), Vector((sg * rx * 1.0, c.y - ry * 0.1, c.z - rz * 0.7))]
            _strand_tube(bm, pts, [W(0.014), W(0.006)], W(0.008), 5)
    mesh = bpy.data.meshes.new(name or f'Hair_{style}')
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    m = bpy.data.materials.get('TV_Hair') or bpy.data.materials.new('TV_Hair')
    mesh.materials.append(m)
    obj['tv_part'] = 'hair'
    obj['tv_style'] = style
    # Root-to-tip gradient as a vertex colour (root dark, tip light).
    col = mesh.color_attributes.new(name='Color', type='BYTE_COLOR', domain='POINT')
    zs = [v.co.z for v in mesh.vertices] or [0]
    zmax, zmin = max(zs), min(zs)
    for i, v in enumerate(mesh.vertices):
        t = (zmax - v.co.z) / max(1e-4, zmax - zmin)
        g = 0.62 + 0.38 * smoothstep(0.0, 1.0, t)
        col.data[i].color = (g, g, g, 1.0)
    return obj


def weight_hair(obj, arm, d: Dims):
    """Head weight at the scalp, blending onto the chain bones by depth below the skull and by side."""
    c, rx, ry, rz = head_frame(d)
    ch = chains(d)
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    groups = {'head': obj.vertex_groups.new(name='head')}
    for tag in ch:
        for k in range(3):
            groups[f'hair_{tag}_{k + 1:02d}'] = obj.vertex_groups.new(name=f'hair_{tag}_{k + 1:02d}')
    z_root = c.z - rz * 0.25
    for v in obj.data.vertices:
        p = v.co
        below = max(0.0, z_root - p.z)
        if below <= 0.002 or p.y < c.y - ry * 0.35:
            groups['head'].add([v.index], 1.0, 'REPLACE')
            continue
        # side by x
        tag = 'l' if p.x > rx * 0.35 else 'r' if p.x < -rx * 0.35 else 'b'
        pts = ch[tag]
        total = pts[0].z - pts[3].z
        u = min(1.0, below / max(1e-4, total)) * 3.0
        seg = min(2, int(u))
        f = u - seg
        w_root = max(0.0, 1.0 - u)          # stays on the head near the top
        weights = {'head': smoothstep(0.0, 1.0, 1.0 - min(1.0, u / 0.6))}
        weights[f'hair_{tag}_{seg + 1:02d}'] = 1.0 - f if seg < 2 else 1.0
        if seg < 2:
            weights[f'hair_{tag}_{seg + 2:02d}'] = f
        s = sum(weights.values()) or 1.0
        for nme, w in weights.items():
            if w / s > 0.01:
                groups[nme].add([v.index], w / s, 'REPLACE')
    obj.parent = arm
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    mod.use_vertex_groups = True
