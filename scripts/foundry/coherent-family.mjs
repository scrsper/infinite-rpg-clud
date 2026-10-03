// Restrict a machine-local character catalogue to one coherent family.
//
//   node scripts/foundry/coherent-family.mjs <catalogue.json> [more.json ...]
//
// The installed packs mix realistic City Sample people with low-poly Polytope armour sets, modern
// Quantum military kit, bare mannequins and City Sample's own office clothes. The resolver picks
// whatever matches a description's tags, so a village could show a doll-faced Polytope peasant or
// a man in slacks beside everyone else. Consistency over variety: people are City Sample (body,
// head, hair, beard) and everything worn is the Ashford wardrobe. Entries of other slots
// (retargeters, animations, bindings) are untouched. Each file is backed up beside itself first.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const PEOPLE = new Set(['body', 'head', 'hair', 'facialHair']);
const WORN = new Set(['upperGarment', 'lowerGarment', 'footwear', 'accessory', 'armor']);
const family = (entry) => (entry.package ?? '').split('/')[2] ?? '';

function keep(entry) {
  const slot = entry.slot ?? entry.kind;
  if (PEOPLE.has(slot)) return family(entry) === 'CitySampleCrowd';
  if (WORN.has(slot)) return family(entry) === 'TornVeil';
  return true;
}

for (const file of process.argv.slice(2)) {
  const backup = file.replace(/\.json$/, '.before-coherent-family.json');
  if (!existsSync(backup)) copyFileSync(file, backup);
  const catalogue = JSON.parse(readFileSync(backup, 'utf8'));
  const before = catalogue.entries.length;
  catalogue.entries = catalogue.entries.filter(keep);
  writeFileSync(file, JSON.stringify(catalogue, null, 2));
  console.log(`${file}: ${before} -> ${catalogue.entries.length} entries (backup ${backup})`);
}
