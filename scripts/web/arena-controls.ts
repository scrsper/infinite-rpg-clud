/**
 * Control check: holds real keys and measures the hero's on-screen motion.
 * Expect W up, S down, A left, D right; Shift faster; Space travels along the held direction.
 *   npx tsx scripts/web/arena-controls.ts   (dev server running)
 */
import { chromium, type Page } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
await page.goto(`${process.env.ARENA_HOST ?? 'http://127.0.0.1:5180'}/?arena=1&seed=3`);
await page.waitForFunction(() => !!(window as any).__arena, null, { timeout: 240_000 });
await page.mouse.click(640, 200);
await page.waitForTimeout(500);
const where = (p: Page) => p.evaluate(() => { const a = (window as any).__arena, h = a.world.hero.pos; return { s: a.screen(h.x, 1, h.z), w: { x: h.x, z: h.z } }; });
const results: Record<string, unknown> = {};
let ok = true;
const run = async (label: string, keys: string[], ms: number, tap?: string) => {
  const a = await where(page);
  for (const k of keys) await page.keyboard.down(k);
  if (tap) { await page.waitForTimeout(80); await page.keyboard.press(tap); }
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
  await page.waitForTimeout(350);
  const b = await where(page);
  // The camera follows, so measure world travel projected onto the screen axes.
  const dx = b.w.x - a.w.x, dz = b.w.z - a.w.z;
  const screenRight = (dx - dz) / Math.SQRT2, screenUp = -(dx + dz) / Math.SQRT2;
  results[label] = { right: +screenRight.toFixed(2), up: +screenUp.toFixed(2), dist: +Math.hypot(dx, dz).toFixed(2) };
  return { screenRight, screenUp, dist: Math.hypot(dx, dz) };
};
const W = await run('W', ['KeyW'], 600); ok &&= W.screenUp > 1 && Math.abs(W.screenRight) < W.screenUp * .3;
const S = await run('S', ['KeyS'], 600); ok &&= S.screenUp < -1;
const A = await run('A', ['KeyA'], 600); ok &&= A.screenRight < -1;
const D = await run('D', ['KeyD'], 600); ok &&= D.screenRight > 1;
const R = await run('D+Shift', ['KeyD', 'ShiftLeft'], 600); ok &&= R.screenRight > D.screenRight * 1.2;
const roll = await run('A+Space', ['KeyA'], 250, 'Space'); ok &&= roll.screenRight < -1;
console.log(JSON.stringify(results, null, 1));
console.log(ok ? 'CONTROLS OK' : 'CONTROLS WRONG');
await browser.close();
process.exit(ok ? 0 : 1);
