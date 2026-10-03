"""Rebuild only M_TV_AshfordCloth (the Ashford garments' shader) in place.

import_ashford_garments.py owns the one definition of the shader; this runs just that part, without
re-importing sixty-six garment meshes. Every region instance and mesh keeps referring to the same
material, because it is rebuilt in place. Local content only (/Game/TornVeil is git-ignored).
"""
import importlib.util
import os

import unreal

HERE = os.path.join(os.path.dirname(os.path.abspath(unreal.Paths.project_dir())), 'scripts')
spec = importlib.util.spec_from_file_location('import_ashford_garments', os.path.join(HERE, 'import_ashford_garments.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.build_material()
unreal.log('TV_ASHFORD_MATERIAL_REBUILT')
