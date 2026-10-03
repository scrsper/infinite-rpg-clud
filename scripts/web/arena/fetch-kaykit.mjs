// Fetch the CC0 KayKit source files the Combat Arena is built from (Kay Lousberg, www.kaylousberg.com).
// Sources land in art/source/kaykit (ignored); build-arena.mjs turns them into web/public/arena.
// Usage: node scripts/web/arena/fetch-kaykit.mjs
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = join(repo, 'art/source/kaykit');
const raw = (pack, path) => `https://raw.githubusercontent.com/KayKit-Game-Assets/${pack}/main/${path}`;

const SK = ['KayKit-Character-Pack-Skeletons-1.0', 'addons/kaykit_character_pack_skeletons'];
const AD = ['KayKit-Character-Pack-Adventures-1.0', 'addons/kaykit_character_pack_adventures'];
const DU = ['KayKit-Dungeon-Remastered-1.0', 'addons/kaykit_dungeon_remastered'];

const gltf = (name) => [`${name}.gltf`, `${name}.bin`];
const files = [
  [SK, 'LICENSE.txt'], [AD, 'LICENSE.txt'], [DU, 'Assets/LICENSE.txt'],
  ...['Skeleton_Warrior', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Mage'].map(n => [SK, `Characters/gltf/${n}.glb`]),
  ...['Skeleton_Axe', 'Skeleton_Blade', 'Skeleton_Shield_Large_A', 'Skeleton_Shield_Small_A', 'Skeleton_Shield_Small_B', 'Skeleton_Staff', 'Skeleton_Crossbow', 'Skeleton_Arrow']
    .flatMap(gltf).map(f => [SK, `Assets/gltf/${f}`]),
  [SK, 'Assets/gltf/skeleton_texture.png'],
  ...['Knight', 'Barbarian', 'Rogue_Hooded'].map(n => [AD, `Characters/gltf/${n}.glb`]),
  ...['sword_2handed', 'axe_2handed', 'axe_1handed', 'sword_1handed', 'shield_round', 'shield_badge', 'crossbow_2handed', 'arrow']
    .flatMap(gltf).map(f => [AD, `Assets/gltf/${f}`]),
  ...['knight_texture.png', 'barbarian_texture.png', 'rogue_texture.png'].map(f => [AD, `Assets/gltf/${f}`]),
  ...['barrel_large', 'barrel_small', 'keg', 'box_large', 'box_small', 'table_long', 'table_medium', 'table_small', 'chair', 'stool',
    'plate_food_A', 'plate_food_B', 'bottle_A_brown', 'bottle_B_green', 'trunk_small_A', 'shelf_small', 'coin', 'candle_lit']
    .map(n => [DU, `Assets/gltf/${n}.gltf.glb`]),
];

let fetched = 0, kept = 0;
for (const [[pack, base], path] of files) {
  const dest = join(out, pack, path);
  if (existsSync(dest)) { kept++; continue; }
  const r = await fetch(raw(pack, `${base}/${path}`));
  if (!r.ok) throw new Error(`${r.status} ${pack}/${path}`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  fetched++;
}
console.log(`KayKit sources: ${fetched} fetched, ${kept} already present -> ${out}`);
