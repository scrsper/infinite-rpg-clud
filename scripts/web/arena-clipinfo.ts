/** Dump every baked arena clip's duration and measured strike window (dev server running). */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 400 } })).newPage();
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto('http://127.0.0.1:5180/?arena=1&allclips=1');
await page.waitForFunction(() => !!(window as any).__arena, null, { timeout: 240_000 });
const info = await page.evaluate(() => (window as any).__arena.clipInfo());
mkdirSync('.debug/arena', { recursive: true }); writeFileSync('.debug/arena/clipinfo.json', JSON.stringify(info, null, 1));
for (const c of info) if (c.name.startsWith(process.env.CLIPS ?? '')) console.log(c.name.padEnd(52), String(c.dur).padStart(5), "stance", c.stance, JSON.stringify(c.win), c.peak);
console.log('errors', errors);
await browser.close();
