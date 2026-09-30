import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Observatory } from './runtime';
import { SCENARIOS } from './scenarios';
import { EVENT_FILTERS, eventGroups, eventRow, inspectEvent, inspectPerson, settlementMetrics } from './readers';

export function createObservatoryServer(runtime = new Observatory()) {
  const token = randomBytes(32).toString('hex');
  const server = createServer(async (req, res) => {
    const port = (server.address() as { port: number } | null)?.port;
    const origin = `http://127.0.0.1:${port}`;
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
    const send = (value: unknown, code = 200) => { res.writeHead(code, { ...headers, 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    try {
      if (req.headers.host !== `127.0.0.1:${port}`) return send({ error: 'Loopback host required' }, 403);
      if (req.headers.origin && req.headers.origin !== origin) return send({ error: 'Foreign origin rejected' }, 403);
      if (req.headers['sec-fetch-site'] === 'cross-site') return send({ error: 'Cross-site request rejected' }, 403);
      const url = new URL(req.url ?? '/', origin), path = url.pathname;
      if (req.method === 'GET' && path === '/health') return send({ service: 'torn-veil-observatory', isolated: true });
      if (req.method === 'GET' && path === '/favicon.ico') { res.writeHead(204, headers); res.end(); return; }
      if (req.method === 'GET' && ['/', '/app.js', '/style.css'].includes(path)) {
        const file = path === '/' ? 'index.html' : path.slice(1);
        const body = (await readFile(new URL(`./public/${file}`, import.meta.url), 'utf8')).replace('__SESSION_TOKEN__', token);
        res.writeHead(200, { ...headers, 'Content-Type': file.endsWith('html') ? 'text/html; charset=utf-8' : file.endsWith('js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' }); res.end(body); return;
      }
      if (req.headers['x-observatory-token'] !== token) return send({ error: 'Observatory session required' }, 403);
      const id = url.searchParams.get('id') ?? '';
      if (req.method === 'GET') {
        if (path === '/api/state') return send(runtime.snapshot());
        if (path === '/api/catalogue') return send({ scenarios: SCENARIOS, filters: EVENT_FILTERS });
        if (path === '/api/person') return send(inspectPerson(runtime.world, id));
        if (path === '/api/event') return send(inspectEvent(runtime.world, id));
        if (path === '/api/entity') return send(runtime.world.get(id) ?? runtime.world.resourceNodes.find(n => n.id === id) ?? null);
        if (path === '/api/metric') { const metric = settlementMetrics(runtime.world).find(m => m.key === id); return send(metric ?? null); }
        if (path === '/api/language') return send(runtime.latestLanguage);
        if (path === '/api/probe') return send(await runtime.client.probe());
        if (path === '/api/events') {
          const group = url.searchParams.get('group'), q = (url.searchParams.get('q') ?? '').slice(0, 100).toLowerCase();
          const offset = Math.max(0, Math.min(1000000, Number(url.searchParams.get('offset')) || 0));
          const events = runtime.world.events.filter(e => (!group || eventGroups(e).includes(group)) && (!q || e.summary.toLowerCase().includes(q) || e.type.includes(q) || e.id === q));
          return send({ total: events.length, offset, events: events.slice().reverse().slice(offset, offset + 80).map(eventRow) });
        }
      }
      if (req.method === 'POST' && req.headers['content-type']?.startsWith('application/json')) {
        let raw = ''; for await (const part of req) { raw += part.toString(); if (Buffer.byteLength(raw) > 8192) return send({ error: 'Request too large' }, 413); }
        const body = JSON.parse(raw || '{}');
        if (path === '/api/control') { runtime.control(body.paused, body.speed); return send({ ok: true }); }
        if (path === '/api/reset') { runtime.reset(body.scenario, body.seed); return send({ ok: true }); }
        if (path === '/api/advance') { runtime.requireIdle(); if (![3600, 86400, 604800, 2592000].includes(body.seconds)) throw new Error('Unsupported horizon'); void runtime.advance(body.seconds, body.noPlayer === true).catch(console.error); return send({ ok: true }); }
        if (path === '/api/cancel') { runtime.cancel(); return send({ ok: true }); }
        if (path === '/api/verify') return send(runtime.verify());
        if (path === '/api/checkpoint') return send(runtime.saveCheckpoint());
        if (path === '/api/restore') { runtime.loadCheckpoint(); return send({ ok: true }); }
        if (path === '/api/config') { runtime.configure(body); return send({ ok: true }); }
        if (path === '/api/ask') return send(await runtime.ask(body.npcId, body.speakerId, body.text));
        if (path === '/api/thought') return send(await runtime.thought(body.npcId));
      }
      send({ error: 'Not found' }, 404);
    } catch (e) { send({ error: e instanceof Error ? e.message : String(e) }, 400); }
  });
  server.on('close', () => runtime.close());
  server.requestTimeout = 150000; server.headersTimeout = 5000;
  return { server, runtime };
}
if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  const port = Number(process.env.TORN_VEIL_OBSERVATORY_PORT ?? 7480);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid Observatory port');
  const { server, runtime } = createObservatoryServer();
  runtime.configure({ ...runtime.client.config, baseUrl: process.env.TORN_VEIL_LLM_BASE_URL ?? runtime.client.config.baseUrl, model: process.env.TORN_VEIL_LLM_MODEL ?? runtime.client.config.model });
  server.listen(port, '127.0.0.1', () => { runtime.startLoop(); console.log(`Torn Veil Observatory: http://127.0.0.1:${port} — disposable in-memory development world`); });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { runtime.close(); server.close(); });
}
