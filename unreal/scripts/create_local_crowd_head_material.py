"""Derive a cookable copy of the CitySampleCrowd head material.

The vendor material /Game/CitySampleCrowd/.../M_Crowd_Head_v2 has "Used with Nanite" set, and its
Nanite base-pass permutation needs 66 shader resource views where SM6 allows 64. The cook therefore
fails the whole material and every crowd head renders with the default material (bald and grey).

Run inside the Unreal Editor Python environment (Run-EditorPython.ps1). Only the git-ignored
/Game/TornVeil/Materials/LocalPalette/Crowd folder is written; the vendor asset is never edited.
The presentation layer (TVEmbodiment.cpp, RepairUncompilableMaterials) swaps heads onto this copy.
"""
import json
import os

import unreal

ROOT = os.path.abspath(os.path.join(unreal.Paths.project_dir(), "../.."))
SOURCE = "/Game/CitySampleCrowd/Character/Shared/Materials/MetaHuman/M_Crowd_Head_v2"
OUT_DIR = "/Game/TornVeil/Materials/LocalPalette/Crowd"
OUT = OUT_DIR + "/M_TV_Crowd_Head"
REPORT = os.path.join(ROOT, ".debug/unreal/local-crowd-head-material.json")

unreal.EditorAssetLibrary.make_directory(OUT_DIR)
if unreal.EditorAssetLibrary.does_asset_exist(OUT):
    unreal.EditorAssetLibrary.delete_asset(OUT)
copy = unreal.EditorAssetLibrary.duplicate_asset(SOURCE, OUT)
if not copy:
    raise RuntimeError("could not duplicate " + SOURCE)
copy.set_editor_property("used_with_nanite", False)
copy.set_editor_property("used_with_skeletal_mesh", True)
unreal.MaterialEditingLibrary.recompile_material(copy)
unreal.EditorAssetLibrary.save_asset(OUT, only_if_is_dirty=False)
report = {"source": SOURCE, "output": OUT, "usedWithNanite": bool(copy.get_editor_property("used_with_nanite"))}
os.makedirs(os.path.dirname(REPORT), exist_ok=True)
with open(REPORT, "w") as f:
    json.dump(report, f, indent=1)
print("TV_CROWD_HEAD " + json.dumps(report))
