import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

/**
 * Frame-time evidence for the web client, measured in a real headed Chrome against the *production*
 * bundle served by the loopback gateway (the same path Play Torn Veil Web uses), with ordinary trusted
 * keyboard and mouse input. Each phase reports the frame-to-frame time of the page's own render loop.
 *
 *   tsx scripts/web/perf.ts [--renderer webgpu|webgl2] [--size 1920x1080] [--seconds 1.0] [--out .debug/web/perf/name.json]
 *
 * Targets (mandate): median <= 16.7 ms, p95 <= 25 ms, p99 <= 50 ms.
 * The world used is whichever preview gateway is running (never a live or staging world).
 */
const argv = process.argv.slice(2);
const flag = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const renderer = flag('renderer', 'webgpu');
const [w, h] = flag('size', '1920x1080').split('x').map(Number);
const scale = Number(flag('seconds', '1'));
const quality = flag('quality', '');
const uncapped = argv.includes('--uncapped');   // lift the display's frame-rate cap so frame time reflects real cost instead of the refresh rate
const newName = flag('name', '');   // begin a new life (arrives at the spawn point, in the village crowd) instead of resuming the last character
const throttle = Number(flag('throttle', '0'));   // CDP CPU throttling factor, to prove the quality governor reacts to a slow machine
const outFile = resolve(flag('out', `.debug/web/perf/${renderer}-${w}x${h}.json`));
mkdirSync(join(outFile, '..'), { recursive: true });

const st = JSON.parse(readFileSync(join(homedir(), 'TornVeilAlpha', 'web-gateway', 'gateway.json'), 'utf8')) as { origin: string; operator: string };
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(st.origin)) throw new Error('gateway must be loopback');
const args = ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', `--window-size=${w + 16},${h + 130}`];
if (uncapped) args.push('--disable-frame-rate-limit', '--disable-gpu-vsync');
if (renderer === 'webgpu') args.push('--enable-unsafe-webgpu', '--ignore-gpu-blocklist');
const browser = await chromium.launch({ channel: 'chrome', headless: false, args });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await page.addInitScript('window.__name = (f) => f;');
// Chrome's long-animation-frame entries say where a slow frame went (script, render, or waiting), with the invoking function.
await page.addInitScript(`window.__loaf = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__loaf.push({ at: Math.round(e.startTime), dur: Math.round(e.duration), block: Math.round(e.blockingDuration), renderStart: Math.round(e.renderStart - e.startTime), style: Math.round(e.styleAndLayoutStart ? e.styleAndLayoutStart - e.startTime : 0), scripts: (e.scripts || []).map(x => ({ d: Math.round(x.duration), inv: x.invoker, fn: x.sourceFunctionName, gc: Math.round(x.forcedStyleAndLayoutDuration || 0), pause: Math.round(x.pauseDuration || 0) })).slice(0, 4) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}`); // tsx wraps named closures; keep page.evaluate bodies self-contained
const logs: string[] = [];
page.on('console', m => { if (m.type() === 'error') logs.push(`error: ${m.text().slice(0, 240)}`); });
page.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
const { url: launch } = await (await fetch(`${st.origin}/api/operator/launch`, { method: 'POST', headers: { 'x-torn-veil-gateway-operator': st.operator } })).json() as { url: string };
await page.goto(launch);
await page.goto(`${st.origin}/?autoplay=1${newName ? `&name=${encodeURIComponent(newName)}` : ''}${renderer === 'webgl2' ? '&renderer=webgl2' : ''}${quality ? `&quality=${quality}` : ''}`);
await page.waitForFunction(() => (window as any).__tv?.ready === true, undefined, { timeout: 120000 });
await page.waitForTimeout(3000);
const info = await page.evaluate(async () => {
  const tv = (window as any).__tv;
  const eng = tv.ctx.engine;
  let adapter: unknown = null;
  try { const a = await (navigator as any).gpu?.requestAdapter(); adapter = a?.info ? { vendor: a.info.vendor, architecture: a.info.architecture, device: a.info.device, description: a.info.description } : null; } catch { /* no adapter info */ }
  return { engine: eng.description ?? eng.constructor.name, webgpu: !!eng.isWebGPU, quality: tv.ctx.quality ?? null, canvas: [eng.getRenderWidth(), eng.getRenderHeight()], adapter, ua: navigator.userAgent };
});
await page.mouse.move(w / 2, h / 2); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(500);
const tierStart = await page.evaluate('window.__tv.ctx.quality.tier') as string;
if (throttle > 1) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); }

type Stat = { frames: number; medianMs: number; p95Ms: number; p99Ms: number; maxMs: number; over33: number; over50: number; over100: number; fpsMedian: number; meters?: unknown };
const phases: Record<string, Stat> = {};
const allSamples: number[] = [];
const mark = () => page.evaluate('window.__tv.perfReset()'); // the page keeps a rolling 4000-frame window; each phase starts it empty
const readRaw = () => page.evaluate(() => {
  const tv = (window as any).__tv;
  return { samples: (tv.frameMs as number[]).slice(), meters: { regions: tv.regions.regions.size, actors: [...tv.actors.all()].length, activeMeshes: tv.ctx.scene.getActiveMeshes().length } };
});
function stats(raw: number[], meters?: unknown): Stat {
  const a = [...raw].sort((x, y) => x - y);
  const q = (p: number) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0), med = q(0.5);
  return { frames: a.length, medianMs: +med.toFixed(2), p95Ms: +q(0.95).toFixed(2), p99Ms: +q(0.99).toFixed(2), maxMs: +(a[a.length - 1] ?? 0).toFixed(1), over33: a.filter(x => x > 33.4).length, over50: a.filter(x => x > 50).length, over100: a.filter(x => x > 100).length, fpsMedian: +(1000 / (med || 1)).toFixed(1), ...(meters ? { meters } : {}) };
}
async function phase(name: string, body: () => Promise<void>) { await mark(); await body(); const r = await readRaw(); allSamples.push(...r.samples); phases[name] = stats(r.samples, r.meters); }
await phase('idle', async () => { await page.waitForTimeout(6000 * scale); });
await phase('walk', async () => { await page.keyboard.down('KeyW'); await page.waitForTimeout(14000 * scale); await page.keyboard.up('KeyW'); });
await phase('sprint_and_turn', async () => {
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
  for (let i = 0; i < 20 * scale; i++) { await page.mouse.move(w / 2, h / 2); for (let s = 1; s <= 10; s++) await page.mouse.move(w / 2 + (i % 2 ? -1 : 1) * 24 * s, h / 2); await page.waitForTimeout(700); }
  await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
});
await phase('combat_motions', async () => {
  for (let i = 0; i < 8 * scale; i++) { await page.mouse.click(w / 2, h / 2); await page.waitForTimeout(500); await page.mouse.click(w / 2, h / 2, { button: 'right' }); await page.waitForTimeout(500); await page.keyboard.press('Space'); await page.waitForTimeout(400); }
});
await page.screenshot({ path: outFile.replace(/\.json$/, '.png') });
const overall = stats(allSamples);
const loaf = await page.evaluate('window.__loaf') as unknown[];
const slow = await page.evaluate('window.__tv.slowEvents') as { label: string; ms: number; at: number }[];
const tierEnd = await page.evaluate('window.__tv.ctx.quality.tier') as string;
const result = { at: new Date().toISOString(), renderer, uncapped, throttle, tierStart, tierEnd, requested: { width: w, height: h }, info, phases, overall, slow: slow.sort((a, b) => b.ms - a.ms).slice(0, 25), longFrames: (loaf as { dur: number }[]).filter(x => x.dur >= 50).slice(0, 40), logs: logs.slice(0, 8), note: 'Automated ordinary-input run against the isolated preview world; not a human playtest.' };
writeFileSync(outFile, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ renderer, size: `${w}x${h}`, engine: info.engine, phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, `${v.medianMs} / ${v.p95Ms} / ${v.p99Ms} ms (max ${v.maxMs}, >50: ${v.over50}, n=${v.frames})`])), logs: logs.slice(0, 4) }, null, 1));
await browser.close();
