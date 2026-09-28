// Add the pack-specific tags in unreal/scripts/city_sample_tags.json (face complexions, hair shapes)
// to an existing character catalogue, so the Foundry can match a face to a person's canonical skin
// tone and a hair to their style. audit_character_assets.py applies the same table on a fresh
// audit; this updates a catalogue already produced or installed, without re-auditing every mesh.
// Usage: node scripts/foundry/tag-catalogue.mjs <catalogue.json> [more.json ...]
import { readFileSync, writeFileSync } from 'node:fs';

const table = JSON.parse(readFileSync(new URL('../../unreal/scripts/city_sample_tags.json', import.meta.url), 'utf8'));
const files = process.argv.slice(2);
if (!files.length) { console.error('usage: tag-catalogue.mjs <catalogue.json> ...'); process.exit(2); }
for (const file of files) {
  const catalogue = JSON.parse(readFileSync(file, 'utf8'));
  const entries = Array.isArray(catalogue) ? catalogue : catalogue.entries;
  let tagged = 0;
  for (const entry of entries) {
    const tones = entry.package?.includes('/CitySampleCrowd/') && !entry.name.startsWith('_') ? table[entry.name] : undefined;
    if (!tones) continue;
    entry.tags = [...new Set([...(entry.tags ?? []), ...tones])].sort();
    tagged++;
  }
  writeFileSync(file, JSON.stringify(catalogue, null, 1));
  console.log(JSON.stringify({ file, tagged }));
}
