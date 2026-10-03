import { chromium, type Page } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

/**
 * Drive the web client in a real Chrome with ordinary (browser-trusted) keyboard and mouse input,
 * from a step list, and capture screenshots and page state along the way.
 *
 *   tsx scripts/web/drive.ts --devhost http://127.0.0.1:5180 --path "/?autoplay=1" --steps steps.json --outdir .debug/web/drive
 *
 * A step is one of: {wait:ms} {key:"KeyW",hold:ms} {press:"KeyE"} {click:[x,y],button:"left|right",hold:ms}
 * {move:[dx,dy]} (relative mouse motion) {shot:"name"} {print:"js"} {eval:"js"} {expect:"js"} (js must return truthy).
 * Input is automated: it is evidence that the ordinary input path works, not a human playtest.
 */
const argv = process.argv.slice(2);
const flag = (n: string, d?: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const outdir = resolve(flag('outdir', '.debug/web/drive')!); mkdirSync(outdir, { recursive: true });
const steps = JSON.parse(readFileSync(resolve(flag('steps')!), 'utf8')) as Record<string, unknown>[];
const w = Number(flag('w', '1600')), h = Number(flag('h', '900'));
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', `--window-size=${w + 16},${h + 130}`] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs: string[] = [];
page.on('console', m => { if (m.type() === 'error') logs.push(`error: ${m.text().slice(0, 240)}`); });
page.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
const st = JSON.parse(readFileSync(join(homedir(), 'TornVeilAlpha', process.env.TV_GW_DIR ?? 'web-gateway', 'gateway.json'), 'utf8')) as { origin: string; operator: string };
const front = flag('devhost') ?? st.origin;
const { url: launch } = await (await fetch(`${st.origin}/api/operator/launch`, { method: 'POST', headers: { 'x-torn-veil-gateway-operator': st.operator } })).json() as { url: string };
await page.goto(launch.replace(st.origin, front));
await page.goto(`${front}${flag('path', '/')}`);
await page.waitForFunction(() => (window as any).__tv?.ready === true, undefined, { timeout: 90000 }).catch(() => logs.push('timeout waiting for ready'));
const results: unknown[] = [];
async function run(page: Page, s: Record<string, unknown>): Promise<void> {
  if ('wait' in s) await page.waitForTimeout(Number(s.wait));
  else if ('key' in s) { const k = String(s.key); await page.keyboard.down(k); await page.waitForTimeout(Number(s.hold ?? 200)); await page.keyboard.up(k); }
  else if ('press' in s) await page.keyboard.press(String(s.press));
  else if ('down' in s) await page.keyboard.down(String(s.down));
  else if ('up' in s) await page.keyboard.up(String(s.up));
  else if ('click' in s) { const [x, y] = s.click as number[]; await page.mouse.move(x, y); await page.mouse.down({ button: (s.button as 'left' | 'right') ?? 'left' }); await page.waitForTimeout(Number(s.hold ?? 60)); await page.mouse.up({ button: (s.button as 'left' | 'right') ?? 'left' }); }
  else if ('mdown' in s) await page.mouse.down({ button: (s.mdown as 'left' | 'right') });
  else if ('mup' in s) await page.mouse.up({ button: (s.mup as 'left' | 'right') });
  else if ('move' in s) { const [dx, dy] = s.move as number[]; const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 20)); const box = { x: w / 2, y: h / 2 }; await page.mouse.move(box.x, box.y); for (let i = 1; i <= steps; i++) await page.mouse.move(box.x + dx * i / steps, box.y + dy * i / steps); }
  else if ('shot' in s) await page.screenshot({ path: join(outdir, `${String(s.shot)}.png`) });
  else if ('print' in s) results.push({ print: String(s.print), value: await page.evaluate(String(s.print)) });
  else if ('eval' in s) await page.evaluate(String(s.eval));
  else if ('expect' in s) { const v = await page.evaluate(String(s.expect)); results.push({ expect: String(s.expect), ok: !!v, value: v }); }
}
for (const s of steps) { try { await run(page, s); } catch (e) { logs.push(`step failed ${JSON.stringify(s).slice(0, 120)}: ${String(e).slice(0, 160)}`); } }
console.log(JSON.stringify({ outdir, results, logs: logs.slice(0, 12) }, null, 1));
await browser.close();
