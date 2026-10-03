import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createGunzip, constants } from 'node:zlib';
import { createInterface } from 'node:readline';
const [input, output, ...ids] = process.argv.slice(2), wanted = new Set(ids), events = [];
const lines = createInterface({ input: createReadStream(input).pipe(createGunzip({ finishFlush: constants.Z_SYNC_FLUSH })), crlfDelay: Infinity });
for await (const line of lines) {
  let row; try { row = JSON.parse(line); } catch { continue; }
  if (wanted.has(row.event.id)) events.push(row);
}
await writeFile(output, JSON.stringify(events, null, 2));
console.log(JSON.stringify(events.map(({ event, actorAtEmission: a }) => ({ event, goal: a?.goal })), null, 2));
