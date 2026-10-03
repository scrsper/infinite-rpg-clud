import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Build every web GLB headless with Blender from the scripts in art/tools/web_characters, into
 * web/public/models, and record a manifest (size + SHA-256) beside them. The GLBs are generated,
 * git-ignored files; this is how they are reproduced.
 *
 *   npm run web:assets            build the ones that are missing
 *   npm run web:assets -- --all   rebuild everything
 *   npm run web:assets -- --list  print the manifest of what is present
 *
 * Blender is found from $BLENDER, else the standard Windows install locations.
 */
const root = resolve(import.meta.dirname, '..', '..');
const tools = join(root, 'art', 'tools', 'web_characters');
const out = join(root, 'web', 'public', 'models');
mkdirSync(out, { recursive: true });
const args = process.argv.slice(2);

const jobs = [
  ...['f', 'm', 'c'].map(sex => ({ file: `kit_${sex}.glb`, script: 'build_kit.py', args: [sex] })),
  ...['roe_deer', 'woodland_boar', 'field_hare'].map(n => ({ file: `creature_${n}.glb`, script: 'build_creature.py', args: [n] })),
  ...['void_stag', 'rift_hawk', 'veil_wraith', 'shattered_colossus'].map(n => ({ file: `preview_${n}.glb`, script: 'build_previews.py', args: [n] })),
];

function manifest() {
  return readdirSync(out).filter(f => f.endsWith('.glb')).sort().map(f => ({ file: f, bytes: statSync(join(out, f)).size, sha256: createHash('sha256').update(readFileSync(join(out, f))).digest('hex') }));
}
if (args.includes('--list')) { console.log(JSON.stringify(manifest(), null, 1)); process.exit(0); }

function findBlender() {
  const candidates = [process.env.BLENDER, ...['5.2', '5.1', '5.0', '4.5', '4.4', '4.3', '4.2'].map(v => `C:\\Program Files\\Blender Foundation\\Blender ${v}\\blender.exe`)].filter(Boolean);
  return candidates.find(p => existsSync(p));
}
const blender = findBlender();
const todo = jobs.filter(j => args.includes('--all') || !existsSync(join(out, j.file)));
if (!todo.length) { console.log('All web models are present. Use --all to rebuild.'); process.exit(0); }
if (!blender) { console.error('Blender was not found. Set BLENDER to blender.exe (5.x recommended) and re-run.'); process.exit(1); }
for (const j of todo) {
  const target = join(out, j.file); // Blender needs an absolute output path
  console.log(`building ${j.file} ...`);
  const r = spawnSync(blender, ['--background', '--python', join(tools, j.script), '--', ...j.args, target], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0 || !existsSync(target)) { console.error(`failed: ${j.file}`); process.exit(1); }
}
const m = manifest();
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ builtAtIso: new Date().toISOString(), blender, files: m }, null, 1));
console.log(`built ${todo.length}; manifest written (${m.length} models).`);
