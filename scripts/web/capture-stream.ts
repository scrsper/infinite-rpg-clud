import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { WebSocket } from 'ws';
import { ALPHA_PROTOCOL, CLIENT_KINDS, H } from '../../src/server/protocol';

/**
 * Record one observer-filtered stream from a live environment so the web client can be developed
 * and compared offline (`?replay=<file>`) without a second controller.
 *
 *   tsx scripts/web/capture-stream.ts --profile web-preview --seconds 25 --out .debug/web/streams/arrival.json
 *        [--character auto|new] [--name "Stream Tester"] [--sex m|f]
 *
 * It connects the way the gateway does (client kind `web`, real account credential from the client
 * profile) and therefore takes over the account's controller like any other client. Do not aim it at
 * an account a person is playing. The credential is never written to the recording.
 */
const argv = process.argv.slice(2);
const flag = (n: string, d?: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const profile = flag('profile', 'web-preview')!;
const seconds = Number(flag('seconds', '20'));
const out = resolve(flag('out', `.debug/web/streams/${profile}-${Date.now()}.json`)!);
const path = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'TornVeil', 'Client', `${profile}.json`);
const cfg = JSON.parse(readFileSync(path, 'utf8'));
const [host, port] = String(cfg.server).split(':');

const headers: Record<string, string> = {
  [H.client]: CLIENT_KINDS.web, [H.protocol]: String(ALPHA_PROTOCOL), [H.region]: '2', [H.interaction]: '2',
  [H.account]: cfg.account, [H.token]: cfg.token, [H.character]: flag('character', 'auto')!,
};
if (flag('name')) headers[H.characterName] = flag('name')!;
if (flag('sex')) headers[H.characterSex] = flag('sex')!;
const ws = new WebSocket(`ws://${host}:${port}`, { headers, maxPayload: 8 * 1024 * 1024 });
const frames: { t: number; m: any }[] = [];
const start = Date.now();
const transfers = new Map<number, { count: number; parts: Buffer[] }>();
let closed: { code: number; reason: string } | null = null;
ws.on('message', raw => {
  let m: any; try { m = JSON.parse(raw.toString()); } catch { return; }
  const t = Date.now() - start;
  if (m.type === 'presentation_chunk') {
    ws.send(JSON.stringify({ version: 1, type: 'presentation_ack', transferId: m.transferId, index: m.index }));
    const tr = transfers.get(m.transferId) ?? { count: m.count, parts: [] }; transfers.set(m.transferId, tr);
    tr.parts[m.index] = Buffer.from(m.data, 'base64');
    if (tr.parts.filter(Boolean).length === tr.count) { frames.push({ t, m: { type: 'presentation', regionId: m.regionId, payload: JSON.parse(Buffer.concat(tr.parts).toString()) } }); transfers.delete(m.transferId); }
    return;
  }
  // Keep the recording bounded: every 4th snapshot after the first few is plenty for replay.
  if (m.type === 'snapshot') { const n = frames.filter(f => f.m.type === 'snapshot').length; if (n > 6 && n % 4) { frames.push({ t, m: { type: 'skip' } }); frames.pop(); return; } }
  frames.push({ t, m });
});
ws.on('close', (code, reason) => { closed = { code, reason: reason.toString() }; });
ws.on('error', () => {});
await new Promise(r => setTimeout(r, seconds * 1000));
try { ws.close(); } catch { /* closing */ }
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ recordedAtIso: new Date().toISOString(), profile, seconds, closed, frames }));
const kinds: Record<string, number> = {};
for (const f of frames) kinds[f.m.type] = (kinds[f.m.type] ?? 0) + 1;
process.stdout.write(JSON.stringify({ out, frames: frames.length, kinds, closed }) + '\n');
