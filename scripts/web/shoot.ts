import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

/**
 * Drive the web client in a real, visible, hardware-accelerated Chrome and capture evidence.
 *
 *   tsx scripts/web/shoot.ts --url "http://127.0.0.1:5180/?replay=/replays/arrival.json" \
 *       --out .debug/web/shots/a.png [--w 1920 --h 1080] [--wait 8000] [--eval "window.__tv.yaw=1"] [--perf 6000]
 *
 * `--eval` runs in the page after the world is ready; `--perf N` samples frame times for N ms
 * and prints median/p95/p99. Screenshots are evidence of what rendered, never of quality.
 */
const argv = process.argv.slice(2);
const flag = (n: string, d?: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const all = (n: string) => argv.flatMap((a, i) => (a === `--${n}` ? [argv[i + 1]] : []));
const url = flag('url', 'http://127.0.0.1:5180/')!;
const w = Number(flag('w', '1600')), h = Number(flag('h', '900'));
const out = resolve(flag('out', '.debug/web/shots/shot.png')!);
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch({
  channel: process.env.TV_BROWSER ?? 'chrome', headless: false,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', `--window-size=${w + 16},${h + 130}`],
});
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs: string[] = [];
page.on('console', m => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || /\[tv\]/.test(t)) logs.push(`${m.type()}: ${t.slice(0, 300)}`); });
page.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 400)}`));
if (flag('gateway')) {
  // Mint a one-time launch link from the running gateway (operator secret stays in the local state file), open it so the session cookie is set, then load the requested page.
  const st = JSON.parse(readFileSync(join(homedir(), 'TornVeilAlpha', process.env.TV_GW_DIR ?? 'web-gateway', 'gateway.json'), 'utf8')) as { origin: string; operator: string };
  const r = await fetch(`${st.origin}/api/operator/launch`, { method: 'POST', headers: { 'x-torn-veil-gateway-operator': st.operator } });
  const { url: launch } = await r.json() as { url: string };
  const front = flag('devhost') ?? st.origin;          // --devhost http://127.0.0.1:5180 reaches the gateway through Vite's proxy
  await page.goto(launch.replace(st.origin, front));
  await page.goto(`${front}${flag('gateway')}`);
} else await page.goto(url);
await page.waitForFunction(() => (window as any).__tv?.ready === true, undefined, { timeout: Number(flag('timeout', '90000')) }).catch(() => logs.push('timeout waiting for __tv.ready'));
await page.waitForTimeout(Number(flag('wait', '3000')));
for (const code of all('eval')) { try { await page.evaluate(code); } catch (e) { logs.push(`eval failed: ${String(e).slice(0, 200)}`); } await page.waitForTimeout(Number(flag('after', '1500'))); }
const printed: unknown[] = [];
for (const code of all('print')) { try { printed.push(await page.evaluate(code)); } catch (e) { printed.push(`print failed: ${String(e).slice(0, 200)}`); } }
let perf: unknown = null;
if (flag('perf')) { await page.evaluate(() => (window as any).__tv.perfReset?.()); await page.waitForTimeout(Number(flag('perf'))); perf = await page.evaluate(() => (window as any).__tv.perfReport?.()); }
await page.screenshot({ path: out });
const info = await page.evaluate(() => { const t = (window as any).__tv; return t ? { renderer: t.ctx?.kind, fallback: t.ctx?.fallbackReason, gpu: (t.ctx?.engine as any)?.getGlInfo?.() } : null; }).catch(() => null);
console.log(JSON.stringify({ out, info, perf, printed, logs: logs.slice(0, 12) }, null, 2));
await browser.close();
