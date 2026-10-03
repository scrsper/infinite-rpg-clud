// Build the Combat Arena's runtime assets in web/public/arena from the CC0 KayKit sources.
//   node scripts/web/arena/fetch-kaykit.mjs     (once)
//   node scripts/web/arena/build-arena.mjs      (characters; add --props to re-run Blender for props/weapons)
// Characters are copied with only the animation clips the arena plays, and the binary is compacted.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const src = join(repo, 'art/source/kaykit'), out = join(repo, 'web/public/arena');
mkdirSync(out, { recursive: true });

export const CLIPS = [
  'Idle', 'Idle_Combat', '2H_Melee_Idle', 'Unarmed_Idle', 'Walking_A', 'Walking_Backwards', 'Walking_D_Skeletons', 'Running_A', 'Running_B',
  'Running_Strafe_Left', 'Running_Strafe_Right',
  '2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin', '2H_Melee_Attack_Spinning', '2H_Melee_Attack_Stab',
  '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Stab', '1H_Melee_Attack_Jump_Chop',
  'Dualwield_Melee_Attack_Chop', 'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick',
  'Block', 'Blocking', 'Block_Hit', 'Block_Attack', 'Dodge_Forward', 'Dodge_Backward', 'Dodge_Left', 'Dodge_Right',
  'Hit_A', 'Hit_B', 'Death_A', 'Death_B', 'Death_C_Skeletons', 'Lie_StandUp',
  '2H_Ranged_Aiming', '2H_Ranged_Shoot', '2H_Ranged_Reload', '1H_Ranged_Aiming', '1H_Ranged_Shoot', 'Spellcast_Shoot', 'Spellcasting',
  'Spawn_Ground_Skeletons', 'Skeletons_Awaken_Floor', 'Taunt', 'Cheer', 'Jump_Full_Short', 'Throw',
];
const CHARACTERS = [
  // Animation source only: its clips are retargeted at runtime onto the Torn Veil human kits (src/web/arena/retarget.ts).
  ['KayKit-Character-Pack-Skeletons-1.0/Characters/gltf', ['Skeleton_Warrior']],
];

function readGlb(file) {
  const b = readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  return { json, bin: b.subarray(binStart, binStart + b.readUInt32LE(20 + jsonLen)) };
}
function writeGlb(file, json, bin) {
  const j = Buffer.from(JSON.stringify(json)); const jp = Buffer.alloc((4 - j.length % 4) % 4, 0x20);
  const bp = Buffer.alloc((4 - bin.length % 4) % 4);
  const total = 12 + 8 + j.length + jp.length + 8 + bin.length + bp.length;
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
  const c = (len, type) => { const x = Buffer.alloc(8); x.writeUInt32LE(len, 0); x.writeUInt32LE(type, 4); return x; };
  writeFileSync(file, Buffer.concat([h, c(j.length + jp.length, 0x4e4f534a), j, jp, c(bin.length + bp.length, 0x004e4942), bin, bp]));
}

/** Keep `keep` animations; drop accessors/bufferViews nothing references any more and repack the binary. */
function prune({ json, bin }, keep) {
  json.animations = (json.animations ?? []).filter(a => keep.has(a.name));
  const usedAcc = new Set();
  for (const m of json.meshes ?? []) for (const p of m.primitives) {
    if (p.indices !== undefined) usedAcc.add(p.indices);
    for (const a of Object.values(p.attributes)) usedAcc.add(a);
    for (const t of p.targets ?? []) for (const a of Object.values(t)) usedAcc.add(a);
  }
  for (const s of json.skins ?? []) if (s.inverseBindMatrices !== undefined) usedAcc.add(s.inverseBindMatrices);
  for (const a of json.animations) for (const s of a.samplers) { usedAcc.add(s.input); usedAcc.add(s.output); }
  const accMap = new Map(), accessors = [];
  json.accessors.forEach((a, i) => { if (usedAcc.has(i)) { accMap.set(i, accessors.length); accessors.push(a); } });
  const usedView = new Set(accessors.map(a => a.bufferView).filter(v => v !== undefined));
  for (const im of json.images ?? []) if (im.bufferView !== undefined) usedView.add(im.bufferView);
  const viewMap = new Map(), views = [], parts = []; let off = 0;
  json.bufferViews.forEach((v, i) => {
    if (!usedView.has(i)) return;
    const pad = (4 - off % 4) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
    parts.push(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
    viewMap.set(i, views.length); views.push({ ...v, byteOffset: off }); off += v.byteLength;
  });
  for (const a of accessors) if (a.bufferView !== undefined) a.bufferView = viewMap.get(a.bufferView);
  for (const im of json.images ?? []) if (im.bufferView !== undefined) im.bufferView = viewMap.get(im.bufferView);
  const ra = i => accMap.get(i);
  for (const m of json.meshes ?? []) for (const p of m.primitives) {
    if (p.indices !== undefined) p.indices = ra(p.indices);
    for (const k of Object.keys(p.attributes)) p.attributes[k] = ra(p.attributes[k]);
    for (const t of p.targets ?? []) for (const k of Object.keys(t)) t[k] = ra(t[k]);
  }
  for (const s of json.skins ?? []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = ra(s.inverseBindMatrices);
  for (const a of json.animations) for (const s of a.samplers) { s.input = ra(s.input); s.output = ra(s.output); }
  json.accessors = accessors; json.bufferViews = views;
  const packed = Buffer.concat(parts); json.buffers = [{ byteLength: packed.length }];
  return { json, bin: packed };
}

const keep = new Set(CLIPS);
for (const [dir, names] of CHARACTERS) for (const n of names) {
  const file = join(src, dir, n + '.glb');
  if (!existsSync(file)) throw new Error(`Missing ${file}; run fetch-kaykit.mjs first.`);
  const before = readFileSync(file).length;
  const g = prune(readGlb(file), keep);
  writeGlb(join(out, n.toLowerCase() + '.glb'), g.json, g.bin);
  console.log(`${n}: ${g.json.animations.length} clips, ${(before / 1e6).toFixed(1)} MB -> ${(readFileSync(join(out, n.toLowerCase() + '.glb')).length / 1e6).toFixed(1)} MB`);
}

if (process.argv.includes('--props')) {
  const candidates = [process.env.BLENDER, ...['5.2', '5.1', '5.0', '4.5', '4.4', '4.3', '4.2'].map(v => `C:\\Program Files\\Blender Foundation\\Blender ${v}\\blender.exe`)].filter(Boolean);
  const blender = candidates.find(p => existsSync(p));
  if (!blender) throw new Error('Blender not found; set BLENDER.');
  const r = spawnSync(blender, ['--background', '--python', join(repo, 'art/tools/arena/build_arena_props.py'), '--', src, out], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
