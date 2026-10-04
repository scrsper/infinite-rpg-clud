/**
 * Movement + combat showcase with real keys and mouse, recorded close up (dev server running):
 * runs, hard reversals, sprint, stop, the full punch chain, kick, rolls. Video -> .debug/arena/<name>.
 *   npx tsx scripts/web/arena-showcase.ts [--name showcase] [--zoom 8]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const out = join(process.cwd(), '.debug/arena', arg('name', 'showcase')); mkdirSync(out, { recursive: true });
const W = 1280, H = 720;
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', `--window-size=${W + 16},${H + 130}`] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: out, size: { width: W, height: H } } });
const page = await ctx.newPage();
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
await page.goto(`http://127.0.0.1:5180/?arena=1&seed=11${process.argv.includes('--foes') ? '' : ''}`);
await page.waitForFunction(() => !!(window as any).__arena, null, { timeout: 240_000 });
await page.evaluate(z => { const a = (window as any).__arena; a.zoom(z); a.hud.toggleHelp(); }, Number(arg('zoom', '8')));
await page.mouse.click(W / 2 + 200, H / 2);
if (process.argv.includes('--foes')) { await page.keyboard.press('KeyN'); await page.waitForTimeout(300); }
const hold = async (keys: string[], ms: number) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of [...keys].reverse()) await page.keyboard.up(k); };
const aim = (dx: number, dy: number) => page.mouse.move(W / 2 + dx, H / 2 + dy);
const click = async (n: number, gap: number) => { for (let i = 0; i < n; i++) { await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(gap); } };
await page.waitForTimeout(600);
// Locomotion: run, reverse hard, strafe, sprint, stop dead.
await hold(['KeyD'], 1100); await hold(['KeyA'], 1100); await hold(['KeyW'], 900); await hold(['KeyS'], 900);
await hold(['KeyW', 'KeyD'], 800); await hold(['KeyW', 'KeyD', 'ShiftLeft'], 1300); await page.waitForTimeout(900);
// Brawling: full chain toward the cursor, a kick, then rolls in two directions.
await aim(220, 0); await click(5, 330); await page.waitForTimeout(500);
await page.mouse.down({ button: 'right' }); await page.waitForTimeout(120); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(900);
await page.keyboard.down('KeyA'); await page.waitForTimeout(150); await page.keyboard.press('Space'); await page.waitForTimeout(900); await page.keyboard.up('KeyA');
await page.keyboard.down('KeyD'); await page.waitForTimeout(150); await page.keyboard.press('Space'); await page.waitForTimeout(900); await page.keyboard.up('KeyD');
await aim(-220, 80); await click(3, 330);
// Heavy: hold RMB to charge, release; then guard, signs 1-4, flask, weapon cycle.
await page.mouse.down({ button: 'right' }); await page.waitForTimeout(1400); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(900);
await page.keyboard.down('KeyF'); await page.waitForTimeout(700); await page.keyboard.up('KeyF');
for (const k of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) { await aim(240, -40); await page.keyboard.press(k); await page.waitForTimeout(800); }
await page.keyboard.press('KeyQ'); await page.waitForTimeout(500);
await page.keyboard.press('Tab'); await page.waitForTimeout(500); await aim(200, 0); await click(3, 380);
await page.mouse.down({ button: 'right' }); await page.waitForTimeout(1300); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(1500);
await hold(['KeyS', 'KeyA'], 1200); await page.waitForTimeout(800);
await ctx.close(); await browser.close();
console.log('showcase ->', out);
