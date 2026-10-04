/**
 * Creature lineup: spawns one of each monster kind in the sandbox in a row, lets them settle into their
 * idle (posture layered over the capture), then lets them walk at the camera. Screenshots and a video ->
 * .debug/arena/<name>. Dev server must be running.
 *   npx tsx scripts/web/arena-creatures.ts [--name creatures] [--kinds goblin,orc,skeleton]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const out = join(process.cwd(), '.debug/arena', arg('name', 'creatures')); mkdirSync(out, { recursive: true });
const kinds = arg('kinds', 'goblin,goblin_archer,orc,skeleton,skeleton_mage,skeleton_brute').split(',');
const W = 1400, H = 760;
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', `--window-size=${W + 16},${H + 130}`] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: out, size: { width: W, height: H } } });
const page = await ctx.newPage();
const errors: string[] = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
await page.goto('http://127.0.0.1:5180/?arena=1&seed=3');
await page.waitForFunction(() => !!(window as any).__arena, null, { timeout: 240_000 });
await page.evaluate(() => { const a = (window as any).__arena; a.hud.toggleHelp(); a.world.setCompanions(false); });
await page.evaluate(k => {
  const a = (window as any).__arena, w = a.world, h = w.hero;
  h.maxHp = h.hp = 1e9; h.pos.set(0, 0, -7.5); h.yaw = 0;
  k.forEach((kind: string, i: number) => { const f = w.spawnFoe(kind, (i - (k.length - 1) / 2) * 2.6, 0); f.cd = 1e9; f.yaw = Math.PI; f.think = 1e9; });
  a.zoom(10);
}, kinds);
// Pick the orbit yaw that puts the camera on the hero's side (-z), looking at the lineup's faces.
for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
  await page.evaluate(y => (window as any).__arena.view(.3, y), yaw); await page.waitForTimeout(250);
  if (await page.evaluate(() => { const a = (window as any).__arena; return a.camera.position.z < a.world.hero.pos.z - 2 && Math.abs(a.camera.position.x - a.world.hero.pos.x) < 3; })) break;
}
await page.waitForTimeout(2200);
// Hold them in their idle, facing the camera: posture off, then on.
await page.evaluate(() => { const w = (window as any).__arena.world; w.freezeFoes = true; for (const f of w.fighters) if (f.role === 'foe') { f.state = 'idle'; f.yaw = Math.PI; f.anim.play(w.ms(f).idle, { loop: true, fade: .2 }); } });
await page.evaluate(() => { (window as any).__arena.world.postureOn = false; }); await page.waitForTimeout(900);
await page.screenshot({ path: join(out, 'idle-raw.png') });
await page.evaluate(() => { (window as any).__arena.world.postureOn = true; }); await page.waitForTimeout(500);
await page.screenshot({ path: join(out, 'idle.png') });
await page.evaluate(() => { (window as any).__arena.world.freezeFoes = false; });
// Then let them walk toward the hero (slowly) for gait shots.
await page.evaluate(() => { const w = (window as any).__arena.world; for (const f of w.fighters) if (f.role === 'foe') { f.speed = 2.2; f.think = 0; } });
for (let i = 0; i < 3; i++) { await page.waitForTimeout(700); await page.screenshot({ path: join(out, `walk${i}.png`) }); }
console.log(JSON.stringify({ out, errors }, null, 1));
await ctx.close(); await browser.close();
