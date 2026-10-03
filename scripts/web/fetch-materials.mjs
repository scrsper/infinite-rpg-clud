/** Bundled, pinned CC0 material inputs. No network is required when playing. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const ids = ['weathered_planks', 'plastered_wall', 'rock_wall_08', 'cobblestone_floor_08', 'forest_ground_04', 'reed_roof_04', 'roof_slates_02', 'brown_mud', 'grass_ground', 'bark_brown_02', 'mossy_rock'];
const root = resolve('web/public/textures/world');
await mkdir(root, { recursive: true });
const headers = { 'User-Agent': 'TornVeilAssetBuild/1.0 (local game material build)' };
const get = async url => { const r = await fetch(url, { headers }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r; };
const manifestPath = resolve('art/reference/web-rebirth/material-manifest.json');
let previous;
try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { /* first import */ }
const catalog = await (await get('https://api.polyhaven.com/assets?t=textures')).json();
const entries = [];
for (const id of ids) {
  const metadata = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  for (const [slot, map] of [['albedo', 'Diffuse'], ['normal', 'nor_gl'], ['arm', 'arm']]) {
    const file = metadata[map]?.['1k']?.jpg;
    if (!file || !file.url.startsWith('https://dl.polyhaven.org/file/ph-assets/')) throw new Error(`Missing known download: ${id}/${map}`);
    const path = `textures/world/${id}-${slot}.jpg`;
    const old = previous?.assets?.find(a => a.path === path);
    const expected = old?.md5 ?? file.md5;
    let bytes;
    try { bytes = await readFile(resolve('web/public', path)); } catch { /* missing bundled input */ }
    if (!bytes || createHash('md5').update(bytes).digest('hex') !== expected) bytes = Buffer.from(await (await get(old?.url ?? file.url)).arrayBuffer());
    const md5 = createHash('md5').update(bytes).digest('hex');
    if (md5 !== expected) throw new Error(`Material input changed: ${path}`);
    await writeFile(resolve('web/public', path), bytes);
    entries.push({ id, slot, path, url: old?.url ?? file.url, md5, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, source: `https://polyhaven.com/a/${id}`, authors: catalog[id]?.authors ?? {}, license: 'CC0-1.0' });
  }
  console.log(`Bundled ${id}`);
}
await writeFile(manifestPath, JSON.stringify({ license: 'https://polyhaven.com/license', resolution: '1k', assets: entries }, null, 2) + '\n');
