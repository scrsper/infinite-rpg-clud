"""Combat Arena props and weapons (Blender, headless).

    blender --background --python art/tools/arena/build_arena_props.py -- <kaykit_dir> <out_dir>

Writes <out_dir>/props.glb and <out_dir>/weapons.glb.

props.glb holds, for every breakable prop `key`, an intact object `P_key` with its origin at the
base centre, plus pre-fractured chunks `F_key_<n>` whose origins sit at each chunk's centre and whose
locations are relative to the prop base. Chunks are Voronoi cells cut with bisect planes; cut faces
get the `frag_inner` (or `frag_clay`) material so broken wood and pottery read as raw inside.
Loose table dressing is exported as `L_key` without chunks (it is knocked flying, not shattered).
The pots are lathe-turned here because the dungeon pack has none. Deterministic (fixed seeds).
"""
import bpy, bmesh, sys, os, random, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
DU = os.path.join(SRC, 'KayKit-Dungeon-Remastered-1.0', 'Assets', 'gltf')
AD = os.path.join(SRC, 'KayKit-Character-Pack-Adventures-1.0', 'Assets', 'gltf')
SK = os.path.join(SRC, 'KayKit-Character-Pack-Skeletons-1.0', 'Assets', 'gltf')
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, rgb, rough=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    return m


INNER = material('frag_inner', (0.78, 0.6, 0.38), 0.95)
CLAY_IN = material('frag_clay', (0.62, 0.36, 0.22), 0.95)
TERRACOTTA = material('terracotta', (0.21, 0.075, 0.05), 0.45)
TERRA_B = material('terracotta_light', (0.36, 0.15, 0.08), 0.5)


def import_joined(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    for o in meshes:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for o in new:
        if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = name; obj.data.name = name
    return obj


def rebase(obj, centre=False):
    """Move geometry so the origin is the base centre (or the volume centre); return the offset applied."""
    vs = [v.co for v in obj.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    c = (mn + mx) / 2
    if not centre: c.z = mn.z
    obj.data.transform(Matrix.Translation(-c))
    return c


def lathe(name, profile, mat, steps=28):
    bm = bmesh.new()
    prev = None
    verts = []
    for r, z in profile:
        verts.append(bm.verts.new((r, 0, z)))
    for a, b in zip(verts, verts[1:]):
        bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    obj = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(obj)
    me.materials.append(mat)
    return obj


def fracture(obj, key, count, seed, inner):
    rng = random.Random(seed)
    vs = [v.co.copy() for v in obj.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    size = mx - mn
    # Seeds drawn near the surface keep every cell populated on thin shells (pots, plank furniture).
    seeds = []
    while len(seeds) < count:
        v = rng.choice(vs)
        p = v + Vector((rng.uniform(-.15, .15) * size.x, rng.uniform(-.15, .15) * size.y, rng.uniform(-.15, .15) * size.z))
        if all((p - s).length > min(size) * 0.18 for s in seeds) or rng.random() < 0.05: seeds.append(p)
    mats = list(obj.data.materials)
    frags = []
    for i, p in enumerate(seeds):
        bm = bmesh.new(); bm.from_mesh(obj.data)
        for j, q in enumerate(seeds):
            if i == j or not bm.verts: continue
            no = (q - p).normalized(); co = (p + q) / 2
            res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=co, plane_no=no, clear_outer=True)
            cut = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge) and e.is_valid]
            if cut:
                filled = bmesh.ops.holes_fill(bm, edges=cut, sides=0)
                for f in filled['faces']: f.material_index = len(mats); f.smooth = False
        if len(bm.verts) < 4: bm.free(); continue
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
        me = bpy.data.meshes.new(f'F_{key}_{len(frags)}'); bm.to_mesh(me); bm.free()
        for m in mats: me.materials.append(m)
        me.materials.append(inner)
        o = bpy.data.objects.new(me.name, me); bpy.context.collection.objects.link(o)
        c = rebase(o, centre=True)
        o.location = c
        frags.append(o)
    return frags


# ---- breakable props -------------------------------------------------------------------------
PROPS = {  # key: (source file or lathe, chunk count)
    'barrel': ('barrel_large', 12), 'barrel_small': ('barrel_small', 9), 'keg': ('keg', 9),
    'crate': ('box_large', 12), 'crate_small': ('box_small', 8), 'trunk': ('trunk_small_A', 9),
    'table_long': ('table_long', 14), 'table': ('table_medium', 12), 'table_small': ('table_small', 9),
    'chair': ('chair', 9), 'stool': ('stool', 6), 'shelf': ('shelf_small', 9),
}
LOOSE = {'plate_a': 'plate_food_A', 'plate_b': 'plate_food_B', 'bottle_a': 'bottle_A_brown', 'bottle_b': 'bottle_B_green', 'coin': 'coin', 'candle': 'candle_lit'}

made = []
for i, (key, (src, n)) in enumerate(PROPS.items()):
    o = import_joined(os.path.join(DU, src + '.gltf.glb'), 'P_' + key)
    rebase(o)
    made.append(o); made += fracture(o, key, n, 9100 + i, INNER)
    print(f'[arena] {key}: {sum(1 for m in made if m.name.startswith("F_" + key + "_"))} chunks')

POT = [(0, 0), (.17, 0), (.22, .05), (.29, .25), (.31, .45), (.27, .66), (.17, .82), (.12, .9), (.12, .98), (.16, 1.02), (.15, 1.05), (.1, 1.04), (0, 1.0)]
JAR = [(0, 0), (.2, 0), (.27, .07), (.33, .26), (.32, .44), (.24, .58), (.15, .62), (.15, .68), (.19, .71), (.17, .74), (0, .72)]
for i, (key, prof, mat, n) in enumerate([('pot', POT, TERRACOTTA, 11), ('jar', JAR, TERRA_B, 9)]):
    o = lathe('P_' + key, prof, mat)
    made.append(o); made += fracture(o, key, n, 9300 + i, CLAY_IN)
    print(f'[arena] {key}: lathe + chunks')

for key, src in LOOSE.items():
    o = import_joined(os.path.join(DU, src + '.gltf.glb'), 'L_' + key); rebase(o); made.append(o)

bpy.ops.object.select_all(action='DESELECT')
for o in made: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'props.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
for o in made: bpy.data.objects.remove(o, do_unlink=True)

# ---- weapons: kept as authored (grip at origin, matching the characters' hand slots) ---------
WEAPONS = {
    'greatsword': (AD, 'sword_2handed'), 'greataxe': (AD, 'axe_2handed'), 'axe': (AD, 'axe_1handed'), 'sword': (AD, 'sword_1handed'),
    'shield_round': (AD, 'shield_round'), 'shield_badge': (AD, 'shield_badge'), 'crossbow': (AD, 'crossbow_2handed'), 'arrow': (AD, 'arrow'),
    'sk_axe': (SK, 'Skeleton_Axe'), 'sk_blade': (SK, 'Skeleton_Blade'), 'sk_shield_large': (SK, 'Skeleton_Shield_Large_A'),
    'sk_shield_small': (SK, 'Skeleton_Shield_Small_A'), 'sk_shield_small_b': (SK, 'Skeleton_Shield_Small_B'), 'sk_staff': (SK, 'Skeleton_Staff'),
    'sk_crossbow': (SK, 'Skeleton_Crossbow'), 'sk_arrow': (SK, 'Skeleton_Arrow'),
}
made = [import_joined(os.path.join(d, f + '.gltf'), 'W_' + k) for k, (d, f) in WEAPONS.items()]
bpy.ops.object.select_all(action='DESELECT')
for o in made: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'weapons.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('[arena] done')
