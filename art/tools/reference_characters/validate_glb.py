"""Read-only GLB contract check. Run with Blender's bundled Python.
Usage: validate_glb.py ASSET.glb REPORT.json
Does not certify likeness, garment clearance, or animation quality.
"""
import json, struct, sys
from pathlib import Path
root = Path(__file__).resolve().parents[3]
asset, report = map(Path, sys.argv[1:3])
data = asset.read_bytes()
magic, version, length = struct.unpack_from('<III', data)
assert magic == 0x46546C67 and version == 2 and length == len(data)
chunk_size, chunk_type = struct.unpack_from('<II', data, 12)
assert chunk_type == 0x4E4F534A
model = json.loads(data[20:20+chunk_size])
source = (root / 'src/web/actors/animator.ts').read_text()
import re
required = re.findall(r"'([^']+)'", source.split('const BONES = [',1)[1].split('];',1)[0])
nodes = model.get('nodes', [])
skins = model.get('skins', [])
joints = {nodes[i].get('name', '') for skin in skins for i in skin['joints']}
missing = sorted(set(required) - joints)
primitives = [p for mesh in model.get('meshes', []) for p in mesh['primitives']]
skinned_nodes = [n for n in nodes if 'mesh' in n and 'skin' in n]
skinned_primitives = [p for n in skinned_nodes for p in model['meshes'][n['mesh']]['primitives']]
errors = []
if not skins: errors.append('No skin')
if missing: errors.append('Missing animator bones: ' + ', '.join(missing))
if not skinned_primitives: errors.append('No skinned geometry')
for p in skinned_primitives:
    a = p['attributes']
    if not {'POSITION', 'JOINTS_0', 'WEIGHTS_0'} <= a.keys(): errors.append('Incomplete skin attributes')
    elif len({model['accessors'][a[k]]['count'] for k in ('POSITION','JOINTS_0','WEIGHTS_0')}) != 1: errors.append('Skin accessor counts differ')
result = {'asset': str(asset.resolve()), 'bytes': len(data), 'skin_count': len(skins),
          'joint_names': sorted(joints), 'missing_animator_bones': missing,
          'skinned_primitives': len(skinned_primitives), 'animation_names': [a.get('name') for a in model.get('animations', [])],
          'errors': errors, 'contract_pass': not errors,
          'remaining_visual_checks': ['metre scale and +Z glTF forward', 'rest pose', 'idle/walk/dodge/attack in browser', 'thigh/knee/elbow deformation', 'sleeve/leg clearance and backfaces', 'close/gameplay-distance turnaround']}
report.parent.mkdir(parents=True, exist_ok=True)
report.write_text(json.dumps(result, indent=2))
print(json.dumps({'contract_pass': not errors, 'missing_animator_bones': missing, 'report': str(report)}))
sys.exit(bool(errors))
