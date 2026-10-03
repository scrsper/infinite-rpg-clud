"""Derive a cookable copy of the CitySampleCrowd head material.

The vendor material /Game/CitySampleCrowd/.../M_Crowd_Head_v2 has "Used with Nanite" set, and its
Nanite base-pass permutation needs 66 shader resource views where SM6 allows 64. The cook therefore
fails the whole material and every crowd head renders with the default material (bald and grey).

Run inside the Unreal Editor Python environment (Run-EditorPython.ps1). Only the git-ignored
/Game/TornVeil/Materials/LocalPalette/Crowd folder is written; vendor assets are never edited.
The presentation layer (TVEmbodiment.cpp, RepairUncompilableMaterials) swaps heads onto the
mirrored instances of this copy.
"""
import json
import os

import unreal

ROOT = os.path.abspath(os.path.join(unreal.Paths.project_dir(), "../.."))
SOURCE = "/Game/CitySampleCrowd/Character/Shared/Materials/MetaHuman/M_Crowd_Head_v2"
OUT_DIR = "/Game/TornVeil/Materials/LocalPalette/Crowd"
OUT = OUT_DIR + "/M_TV_Crowd_Head"
REPORT = os.path.join(ROOT, ".debug/unreal/local-crowd-head-material.json")

MIRROR_ROOT = OUT_DIR
unreal.EditorAssetLibrary.make_directory(OUT_DIR)
# Earlier mirrors reference the copy, so they go first.
if unreal.EditorAssetLibrary.does_directory_exist(MIRROR_ROOT + "/CitySampleCrowd"):
    unreal.EditorAssetLibrary.delete_directory(MIRROR_ROOT + "/CitySampleCrowd")
if unreal.EditorAssetLibrary.does_asset_exist(OUT):
    unreal.EditorAssetLibrary.delete_asset(OUT)
copy = unreal.EditorAssetLibrary.duplicate_asset(SOURCE, OUT)
if not copy:
    raise RuntimeError("could not duplicate " + SOURCE)
copy.set_editor_property("used_with_nanite", False)
copy.set_editor_property("used_with_skeletal_mesh", True)
mel = unreal.MaterialEditingLibrary
mel.recompile_material(copy)
unreal.EditorAssetLibrary.save_asset(OUT, only_if_is_dirty=False)

# Every vendor head instance (per character, per LOD) chooses its skin through static switches --
# IsCrowd, UseAtlasSelection, Animated Albedo off -- which a runtime dynamic instance cannot carry.
# Mirror each one onto the cookable base, keeping its chain, so the face samples the skin atlas it
# was authored for. Mirror path = MIRROR_ROOT + vendor path without "/Game"; TVEmbodiment.cpp
# derives the same path.
reg = unreal.AssetRegistryHelpers.get_asset_registry()
flt = unreal.ARFilter(package_paths=["/Game/CitySampleCrowd"], recursive_paths=True,
                      class_paths=[unreal.TopLevelAssetPath("/Script/Engine", "MaterialInstanceConstant")])
source_base = unreal.load_asset(SOURCE)
vendor = {}
for data in reg.get_assets(flt):
    mi = data.get_asset()
    if mi and mi.get_base_material() == source_base:
        vendor[str(data.package_name)] = mi


def depth(mi):
    d = 0
    while isinstance(mi, unreal.MaterialInstance):
        mi = mi.get_editor_property("parent"); d += 1
    return d


switches = [str(n) for n in mel.get_static_switch_parameter_names(source_base)]
mirrors, mismatched = {}, []
for package in sorted(vendor, key=lambda p: depth(vendor[p])):
    mi = vendor[package]
    target = MIRROR_ROOT + package[len("/Game"):]
    mirrored = unreal.EditorAssetLibrary.duplicate_asset(package, target)
    if not mirrored:
        raise RuntimeError("could not mirror " + package)
    parent = mi.get_editor_property("parent")
    parent_package = parent.get_outermost().get_name()
    mel.set_material_instance_parent(mirrored, copy if parent == source_base else mirrors[parent_package])
    mel.update_material_instance(mirrored)
    for name in switches:
        if mel.get_material_instance_static_switch_parameter_value(mirrored, name) != mel.get_material_instance_static_switch_parameter_value(mi, name):
            mismatched.append(package + ":" + name)
    unreal.EditorAssetLibrary.save_asset(target, only_if_is_dirty=False)
    mirrors[package] = mirrored
if mismatched:
    raise RuntimeError("static switches not carried: " + ", ".join(mismatched[:10]))
report = {"source": SOURCE, "output": OUT, "usedWithNanite": bool(copy.get_editor_property("used_with_nanite")),
          "mirroredInstances": len(mirrors), "mirrorRoot": MIRROR_ROOT}
os.makedirs(os.path.dirname(REPORT), exist_ok=True)
with open(REPORT, "w") as f:
    json.dump(report, f, indent=1)
print("TV_CROWD_HEAD " + json.dumps(report))
