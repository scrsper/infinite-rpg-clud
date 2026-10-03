import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
const [input, output, actors, from, through, types] = process.argv.slice(2);
const ids = new Set(actors.split(',')), kinds = new Set(types.split(',')), rows = [];
for await (const line of createInterface({ input: createReadStream(input).pipe(createGunzip()), crlfDelay: Infinity })) {
  const r = JSON.parse(line), e = r.event;
  if (e.tick >= Number(from) && e.tick <= Number(through) && (ids.has(e.actor) || ids.has(e.target)) && kinds.has(e.type)) rows.push(r);
}
await writeFile(output, JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows.map(r => ({ event: r.event, goal: r.actorAtEmission?.goal })), null, 2));
