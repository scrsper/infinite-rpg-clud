"""Combat Arena people: realistic MPFB humans dressed in CC0 MakeHuman community assets (headless).

    blender -b --python art/tools/arena/build_arena_people.py -- <out_dir> [id ...]

Requires MPFB 2 (installed Blender extension) and these CC0 asset packs installed into MPFB's user data
directory: makehuman_system_assets, suits02, shoes01, hats02, hair01, skins02, pants01, shirts01, gloves01 (CC0)
and shirts02, shirts03, shoes03, hats04 (CC-BY)
(http://static.makehumancommunity.org/assets/assetpacks.html). Assets are CC0 except these CC-BY items (credit in web/public/arena/people/CREDITS.md):
mindfront_lusekofta, punkduck_medieval_boots, elvs_ruffle_sleeve_peasant_blouse_1, maciekg_leather_helmet, culturalibre_warrior_helmet_02.
Each person gets MPFB's 'game_engine' rig (UE-mannequin bone names), GAMEENGINE materials, textures
downscaled for the web, and is exported as <out_dir>/<id>.glb.
"""
import bpy, sys, os, json
from bl_ext.blender_org.mpfb.services import HumanService

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]; ONLY = set(argv[1:])
os.makedirs(OUT, exist_ok=True)
MAX_TEX = 1024


def body(gender, muscle=.5, weight=.5, height=.5, age=.5, race=(.33, .33, .33)):
    return {'gender': gender, 'age': age, 'muscle': muscle, 'weight': weight, 'height': height, 'proportions': .5, 'cupsize': .5, 'firmness': .5,
            'race': {'african': race[0], 'asian': race[1], 'caucasian': race[2]}}


a = lambda n, ext='mhclo': f'{n}/{n}.{ext}'
PEOPLE = {
    'hero': dict(phenotype=body(1, .75, .5, .6, .45, (.1, .1, .8)), skin='young_caucasian_male', hair='culturalibre_hair_02', brows='eyebrow001',
                 clothes=['rehmanpolanski_viking_tunic', 'rehmanpolanski_viking_pants', 'rehmanpolanski_viking_boots', 'toigo_gloves_short']),
    'brann': dict(phenotype=body(1, .9, .65, .58, .55, (.05, .05, .9)), skin='rehmanpolanski_skin_viking_tattoos', hair='rehmanpolanski_hair_bun_brown', brows='eyebrow005',
                  clothes=['rehmanpolanski_viking_tunic', 'rehmanpolanski_viking_pants', 'rehmanpolanski_viking_boots']),
    'wren': dict(phenotype=body(0, .55, .45, .52, .4, (.1, .1, .8)), skin='young_caucasian_female', hair='elvs_french_braid_variation', brows='eyebrow011',
                 clothes=['mindfront_lusekofta', 'toigo_wool_pants', 'punkduck_medieval_boots', 'toigo_gloves_short']),
    'raider': dict(phenotype=body(1, .6, .55, .5, .65, (.1, .1, .8)), skin='jartur69_middleage_slavic_male_with_genitals_and_beard', hair='short02', brows='eyebrow007',
                   clothes=['toigo_fisherman_sweater', 'toigo_wool_pants', 'culturalibre_male_boots', 'toigo_gloves_short']),
    'raider_f': dict(phenotype=body(0, .55, .5, .5, .45, (.2, .6, .2)), skin='young_asian_female', hair='braid01', brows='eyebrow010',
                     clothes=['elvs_ruffle_sleeve_peasant_blouse_1', 'toigo_wool_pants', 'punkduck_medieval_boots']),
    'soldier': dict(phenotype=body(1, .7, .55, .55, .5, (.8, .1, .1)), skin='young_african_male', hair='short04', brows='eyebrow003',
                    clothes=['rehmanpolanski_viking_tunic', 'rehmanpolanski_viking_pants', 'culturalibre_male_boots', 'toigo_gloves_short', 'javherre_casco_caballero_templario_templar_knight_helmet']),
    'knight': dict(phenotype=body(1, .8, .6, .62, .5, (.1, .1, .8)), skin='young_caucasian_male2', hair='short02', brows='eyebrow002',
                   clothes=['rehmanpolanski_viking_tunic', 'rehmanpolanski_viking_pants', 'rehmanpolanski_viking_boots', 'toigo_gloves_short', 'culturalibre_warrior_helmet_02']),
    'archer': dict(phenotype=body(1, .55, .45, .52, .4, (.1, .7, .2)), skin='young_asian_male', hair='short04', brows='eyebrow004',
                   clothes=['mindfront_lusekofta', 'toigo_wool_pants', 'punkduck_medieval_boots', 'maciekg_leather_helmet']),
    'mystic': dict(phenotype=body(0, .4, .45, .5, .55, (.1, .1, .8)), skin='young_caucasian_female2', hair='long01', brows='eyebrow012',
                   clothes=['donitz_monk_robe', 'culturalibre_male_boots']),
}

report = {}
for pid, spec in PEOPLE.items():
    if ONLY and pid not in ONLY: continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    info = HumanService._create_default_human_info_dict()
    info.update({
        'phenotype': spec['phenotype'], 'rig': 'game_engine',
        'skin_mhmat': a(spec['skin'], 'mhmat'), 'skin_material_type': 'GAMEENGINE', 'clothes_material_type': 'GAMEENGINE',
        'eyes': 'low-poly/low-poly.mhclo', 'eyebrows': a(spec['brows']), 'eyelashes': 'eyelashes01/eyelashes01.mhclo', 'hair': a(spec['hair']),
        'clothes': [a(c) for c in spec['clothes']], 'alternative_materials': {}, 'color_adjustments': {},
    })
    settings = HumanService.get_default_deserialization_settings()
    settings['subdiv_levels'] = 0
    basemesh = HumanService.deserialize_from_dict(info, settings)
    rig = basemesh.parent if basemesh.parent and basemesh.parent.type == 'ARMATURE' else next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    rig.name = 'Armature'
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        for m in o.modifiers:
            if m.type == 'SUBSURF': m.levels = 0; m.render_levels = 0
    # MPFB's game-engine materials all route texture alpha, so every glTF material would export as BLEND
    # (eyes showing through the skull, sorting noise on clothes). Only hair, brows and lashes need alpha.
    for m in bpy.data.materials:
        if not m.use_nodes or any(k in m.name.lower() for k in ('hair', 'eyebrow', 'eyelash', 'short0', 'long0', 'braid', 'bob0', 'afro', 'ponytail')): continue
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                for l in list(n.inputs['Alpha'].links): m.node_tree.links.remove(l)
                n.inputs['Alpha'].default_value = 1.0
        try: m.surface_render_method = 'DITHERED'
        except Exception: pass
    # Web-sized textures.
    for img in bpy.data.images:
        w, h = img.size
        if max(w, h) > MAX_TEX:
            k = MAX_TEX / max(w, h); img.scale(max(1, int(w * k)), max(1, int(h * k)))
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        if o.type in ('MESH', 'ARMATURE') and not o.hide_get(): o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = os.path.join(OUT, f'{pid}.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_animations=False, export_influence_nb=4, export_image_format='AUTO')
    meshes = [o.name for o in bpy.data.objects if o.type == 'MESH']
    report[pid] = {'meshes': meshes, 'bones': len(rig.data.bones), 'height_m': round(basemesh.dimensions.z, 3), 'bytes': os.path.getsize(path), 'assets': spec}
    print(f'[people] {pid}: {len(meshes)} meshes, {len(rig.data.bones)} bones, {os.path.getsize(path) / 1e6:.1f} MB')
json.dump(report, open(os.path.join(OUT, 'people.json'), 'w'), indent=1)
