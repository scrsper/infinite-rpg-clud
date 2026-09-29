import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

/**
 * UI legibility at 720p / 1080p / 1440p with ordinary input: the title screen, the HUD in play, the Items,
 * Abilities and Journal menus, and the pause/settings menu. For every screen it records the smallest rendered
 * text (the mandate wants body text of 16–18 px), whether anything overflows its box, and saves a screenshot.
 *
 *   tsx scripts/web/uicheck.ts --out .debug/web/ui
 */
const argv = process.argv.slice(2);
const flag = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const out = resolve(flag('out', '.debug/web/ui')); mkdirSync(out, { recursive: true });
const st = JSON.parse(readFileSync(join(homedir(), 'TornVeilAlpha', 'web-gateway', 'gateway.json'), 'utf8')) as { origin: string; operator: string };
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(st.origin)) throw new Error('gateway must be loopback');
const sizes: [number, number][] = [[1280, 720], [1920, 1080], [2560, 1440]];
const rows: unknown[] = [];

const measure = () => {
  const ui = document.getElementById('ui'); if (!ui) return null;
  let min = 1e9, minText = '', count = 0; const small: { px: number; text: string }[] = []; const overflow: string[] = [];
  const walker = document.createTreeWalker(ui, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.textContent ?? '').trim(); if (!t) continue;
    const el = n.parentElement; if (!el) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0 || r.width === 0 || r.height === 0) continue;
    if (el.closest('[style*="display: none"], [style*="display:none"]')) continue;
    const px = parseFloat(cs.fontSize); count++;
    if (px < min) { min = px; minText = t.slice(0, 40); }
    if (px < 15.5 && small.length < 6) small.push({ px: +px.toFixed(1), text: t.slice(0, 36) });
  }
  for (const el of ui.querySelectorAll<HTMLElement>('.tv-panel, .tv-dialog, .tv-opt, button')) {
    const r = el.getBoundingClientRect(); if (r.width === 0) continue;
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el).overflowX !== 'scroll') overflow.push(`${el.className || el.tagName}:${el.scrollWidth}>${el.clientWidth}`);
    if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1) overflow.push(`offscreen ${el.className || el.tagName}`);
  }
  return { minPx: min === 1e9 ? null : +min.toFixed(1), minText, textNodes: count, under155: small, overflow: overflow.slice(0, 6), root: getComputedStyle(document.documentElement).fontSize };
};

for (const [w, h] of sizes) {
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', `--window-size=${w + 16},${h + 130}`] });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.addInitScript('window.__name = (f) => f;');
  const { url } = await (await fetch(`${st.origin}/api/operator/launch`, { method: 'POST', headers: { 'x-torn-veil-gateway-operator': st.operator } })).json() as { url: string };
  await page.goto(url); await page.goto(`${st.origin}/`);
  await page.waitForTimeout(3500);
  const tag = `${w}x${h}`;
  const take = async (name: string) => { await page.waitForTimeout(600); await page.screenshot({ path: join(out, `${tag}-${name}.png`) }); rows.push({ size: tag, screen: name, ...(await page.evaluate(measure)) }); console.log(tag, name, JSON.stringify(rows[rows.length - 1]).slice(0, 230)); };
  await take('title');
  const clickText = (t: RegExp) => page.evaluate((src: string) => { const re = new RegExp(src, 'i'); const b = [...document.querySelectorAll('#ui button')].find(x => re.test(x.textContent ?? '')) as HTMLElement | undefined; if (b) { b.click(); return true; } return false; }, t.source);
  if (await clickText(/^(play|continue|begin)/)) { await page.waitForTimeout(800); await take('after-play-click'); }
  await page.waitForFunction(() => (window as any).__tv?.phase === 'playing', undefined, { timeout: 90000 }).catch(() => undefined);
  await page.waitForTimeout(2500);
  await page.mouse.move(w / 2, h / 2); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(400);
  await take('hud');
  for (const [key, name] of [['KeyI', 'items'], ['Tab', 'abilities'], ['KeyJ', 'journal']] as const) { await page.keyboard.press(key); await page.waitForTimeout(500); await take(name); await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
  await page.mouse.move(w / 2, h / 2); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(300);
  await page.keyboard.press('Escape'); await page.waitForTimeout(700); await take('pause');
  for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyE'); await page.waitForTimeout(500); }
  await take('settings-tab');
  await browser.close();
}
writeFileSync(join(out, 'report.json'), JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
const bad = (rows as { minPx: number | null; overflow: string[] }[]).filter(r => (r.minPx ?? 99) < 15.5 || r.overflow.length);
console.log(JSON.stringify({ screens: rows.length, flagged: bad.length }));
