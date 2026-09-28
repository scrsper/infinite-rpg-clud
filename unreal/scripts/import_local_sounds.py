"""Import the synthesized sound set as local SoundWaves (/Game/TornVeil/Audio).

Run `node scripts/audio/synthesize-sounds.mjs` first (it writes .debug/audio/source), then this
inside the Unreal Editor Python environment (Run-EditorPython.ps1). Only the git-ignored
/Game/TornVeil/Audio folder is written. Ambience (SW_TV_Amb*) loops; the rest are one-shots.
TVSoundscape.cpp loads them by name.
"""
import json
import os

import unreal

ROOT = os.path.abspath(os.path.join(unreal.Paths.project_dir(), "../.."))
SOURCE = os.path.join(ROOT, ".debug/audio/source")
DEST = "/Game/TornVeil/Audio"
REPORT = os.path.join(ROOT, ".debug/unreal/local-sounds.json")

files = sorted(f for f in os.listdir(SOURCE) if f.endswith(".wav"))
if not files:
    raise RuntimeError("no synthesized sounds in " + SOURCE)
tasks = []
for name in files:
    task = unreal.AssetImportTask()
    task.filename = os.path.join(SOURCE, name)
    task.destination_path = DEST
    task.automated = True
    task.replace_existing = True
    task.save = False
    tasks.append(task)
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)
rows = []
for name in files:
    asset = DEST + "/" + os.path.splitext(name)[0]
    wave = unreal.load_asset(asset)
    if not wave:
        raise RuntimeError("import failed: " + asset)
    looping = name.startswith("SW_TV_Amb")
    wave.set_editor_property("looping", looping)
    unreal.EditorAssetLibrary.save_asset(asset, only_if_is_dirty=False)
    rows.append({"asset": asset, "looping": looping, "seconds": round(wave.get_editor_property("duration"), 2)})
os.makedirs(os.path.dirname(REPORT), exist_ok=True)
with open(REPORT, "w") as f:
    json.dump(rows, f, indent=1)
print("TV_SOUNDS " + json.dumps(rows))
