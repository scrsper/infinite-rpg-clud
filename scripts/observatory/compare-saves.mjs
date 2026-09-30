import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
const [aPath, bPath, output] = process.argv.slice(2);
const read = async p => { const v = JSON.parse(gunzipSync(await readFile(p)).toString()); delete v.savedAt; return v; };
const a = await read(aPath), b = await read(bPath), rows = [], categories = {};
function compare(a, b, path = '$') {
  if (a === b) return;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) compare(a[key], b[key], `${path}.${key}`);
  } else { rows.push({ path, a, b }); const key = path.split('.')[1]; categories[key] = (categories[key] ?? 0) + 1; }
}
compare(a, b);
await writeFile(output, gzipSync(JSON.stringify({ aPath, bPath, differences: rows.length, categories, rows }), { level: 1 }));
console.log(JSON.stringify({ differences: rows.length, categories, first: rows.slice(0, 15) }, null, 2));
process.exitCode = rows.length ? 1 : 0;
