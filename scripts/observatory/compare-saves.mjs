import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
const [aPath, bPath, output] = process.argv.slice(2);
const read = async p => { const v = JSON.parse(gunzipSync(await readFile(p)).toString()); delete v.savedAt; return v; };
const a = await read(aPath), b = await read(bPath), rows = [], categories = {};
let valueDifferences = 0, propertyOrderDifferences = 0;
function record(row) { rows.push(row); const key = row.path.split('.')[1] ?? '$'; categories[key] = (categories[key] ?? 0) + 1; }
function compare(a, b, path = '$') {
  if (a === b) return;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    // Some canonical tables are enumerated during planning. Equal keyed contents
    // alone cannot certify that a reload preserved their iteration behavior.
    const aKeys = Object.keys(a), bKeys = Object.keys(b);
    if (!Array.isArray(a) && aKeys.length === bKeys.length && aKeys.every(key => Object.hasOwn(b, key))
      && aKeys.some((key, i) => key !== bKeys[i])) {
      propertyOrderDifferences++;
      record({ path, kind: 'property-order', a: aKeys, b: bKeys });
    }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) compare(a[key], b[key], `${path}.${key}`);
  } else { valueDifferences++; record({ path, kind: 'value', a, b }); }
}
compare(a, b);
await writeFile(output, gzipSync(JSON.stringify({ aPath, bPath, differences: rows.length, valueDifferences, propertyOrderDifferences, categories, rows }), { level: 1 }));
console.log(JSON.stringify({ differences: rows.length, valueDifferences, propertyOrderDifferences, categories, first: rows.slice(0, 15) }, null, 2));
process.exitCode = rows.length ? 1 : 0;
