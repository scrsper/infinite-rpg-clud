/**
 * Camera review for the Combat Gym arena and the Tower of Chrysanthus: real keys and mouse for movement, combat
 * and aiming; orbit/zoom through the same camera entry points MMB-drag and the wheel use. Screenshots and
 * camera telemetry -> .debug/arena/<name>. Serve dist-web (combat-gym server on :7505) or pass --host.
 *   npx tsx scripts/web/arena-camera.ts [--name arena-camera] [--host http://127.0.0.1:7505]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const out = join(process.cwd(), '.debug/arena', arg('name', 'arena-camera')); mkdirSync(out, { recursive: true });
const host = arg('host', 'http://127.0.0.1:7505'), only = new Set(arg('only', '').split(',').filter(Boolean));
const W = 1600, H = 900;
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', `--window-size=${W + 16},${H + 130}`] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors: string[] = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
const want = (n: string) => !only.size || only.has(n);

async function open(q: string): Promise<void> {
  await page.goto(`${host}/?arena=1${q}`);
  await page.waitForFunction(() => !!(window as any).__arena, null, { timeout: 240_000 });
  await page.evaluate(() => { const a = (window as any).__arena; a.hud.toggleHelp(); a.world.setCompanions?.(false); a.world.hero.maxHp = a.world.hero.hp = 1e7; });
  await page.mouse.move(W / 2, H * .42); await page.mouse.click(W / 2, H * .42); await page.waitForTimeout(900);
}
const telemetry = (p: Page) => p.evaluate(() => {
  const a = (window as any).__arena, h = a.world.hero, c = a.camera, foot = a.screen(h.pos.x, 0, h.pos.z), top = a.screen(h.pos.x, 1.75 * h.inst.root.scaling.x / 1.22 * 1.22, h.pos.z);
  return { ...a.cam.debug, camHeight: +(c.position.y).toFixed(2), playerShare: +((foot.y - top.y) / innerHeight).toFixed(3), footY: +(foot.y / innerHeight).toFixed(3),
    foes: a.world.fighters.filter((f: any) => f.role === 'foe' && f.alive).length };
});
const shots: Record<string, unknown> = {};
async function shot(n: string) { await page.screenshot({ path: join(out, `${n}.png`) }); shots[n] = await telemetry(page); console.log(n, JSON.stringify(shots[n])); }
const look = (dx: number, dy = 0) => page.evaluate(([x, y]) => (window as any).__arena.cam.addLook(x, y), [dx, dy]);
const hold = async (keys: string[], ms: number) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); };

if (want('gym')) {
  await open('&seed=5');
  await shot('a1-gym-default');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1400); await shot('a2-gym-walking'); await page.keyboard.up('KeyW');
  await hold(['KeyW', 'ShiftLeft'], 1300); await page.waitForTimeout(400);
  for (let i = 0; i < 14; i++) { await look(.12); await page.waitForTimeout(40); } await page.waitForTimeout(500); await shot('a3-gym-orbit');
  for (let i = 0; i < 20; i++) await page.evaluate(() => (window as any).__arena.cam.zoom(1)); await page.waitForTimeout(1600); await shot('a4-gym-max-zoom');
  for (let i = 0; i < 9; i++) await page.evaluate(() => (window as any).__arena.cam.zoom(-1)); await page.waitForTimeout(1400);
  // Bow aiming: draw the bow (F4) and hold RMB for the precision framing.
  await page.keyboard.press('F4'); await page.waitForTimeout(600); await page.mouse.down({ button: 'right' }); await page.waitForTimeout(900); await shot('a5-gym-bow-aim'); await page.mouse.up({ button: 'right' });
  await page.keyboard.press('F1'); await page.waitForTimeout(500);
  // A crowd: spawn a wave and fight it.
  await page.keyboard.press('KeyN'); await page.waitForTimeout(400); await page.keyboard.press('KeyN'); await page.waitForTimeout(2500); await shot('a6-gym-group');
  for (let i = 0; i < 8; i++) { await page.mouse.click(W / 2, H * .45); await page.waitForTimeout(260); } await shot('a7-gym-combat');
}
if (want('tower')) {
  // Floor 5: a boss floor (large foe framing) with ruin walls for obstruction.
  await open('&tower=1&seed=23&floor=5');
  await page.waitForTimeout(800); await shot('t1-tower-start');
  const wall = await page.evaluate(() => { const w = (window as any).__arena.world, h = w.hero.pos;
    const ws = w.props.filter((p: any) => p.key === 'wall' && !p.broken).sort((a: any, b: any) => Math.hypot(a.pos.x - h.x, a.pos.z - h.z) - Math.hypot(b.pos.x - h.x, b.pos.z - h.z));
    return ws[0] ? { x: ws[0].pos.x, z: ws[0].pos.z, h: ws[0].h } : null; });
  console.log('wall', JSON.stringify(wall));
  if (wall) {
    // Walk to the near side of the wall, then put the camera behind it.
    await page.evaluate(([x, z]) => { const a = (window as any).__arena, h = a.world.hero; const dx = x - h.pos.x, dz = z - h.pos.z, d = Math.hypot(dx, dz) || 1; h.pos.set(x - dx / d * 1.6, 0, z - dz / d * 1.6); a.cam.yaw = Math.atan2(dx, dz); a.cam.snap(); }, [wall.x, wall.z]);
    await page.waitForTimeout(700); await shot('t2-tower-wall-obstruct');
    for (let i = 0; i < 18; i++) { await look(.1); await page.waitForTimeout(60); } await page.waitForTimeout(1200); await shot('t3-tower-wall-recovered');
  }
  const boss = await page.evaluate(() => { const b = (window as any).__arena.world.fighters.find((f: any) => f.boss && f.alive); return b ? { x: b.pos.x, z: b.pos.z } : null; });
  if (boss) { await page.evaluate(([x, z]) => { const a = (window as any).__arena, h = a.world.hero; h.pos.set(x, 0, z + 6); a.cam.yaw = 0; }, [boss.x, boss.z]); await page.waitForTimeout(1800); await shot('t4-tower-boss'); }
}
writeFileSync(join(out, 'telemetry.json'), JSON.stringify({ shots, errors }, null, 1));
console.log(JSON.stringify({ errors: errors.slice(0, 5) }));
await browser.close();
