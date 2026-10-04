/**
 * Foot-skate measurement: drives real locomotion keys and samples, every rendered frame, the hero's foot
 * world positions while the playing clip says that foot is planted. Reports mean planted-foot horizontal
 * speed (m/s, lower is better) with foot planting off and on. Dev server must be running.
 *   npx tsx scripts/web/arena-footskate.ts
 */
import { chromium, type Page } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
await page.goto('http://127.0.0.1:5180/?arena=1&seed=2');
await page.waitForFunction(() => !!(window as any).__arena, null, { timeout: 240_000 });
await page.evaluate(() => (window as any).__arena.world.setCompanions(false));
await page.mouse.click(550, 200);

const run = async (p: Page, lock: boolean) => {
  await p.evaluate(on => {
    const a = (window as any).__arena, w = a.world;
    w.footLock = on; (window as any).__sk = { sum: 0, n: 0, prev: [null, null], frames: 0 };
    if (!(window as any).__skObs) (window as any).__skObs = a.scene.onAfterRenderObservable.add(() => {
      const sk = (window as any).__sk, h = w.hero, d = h.anim.dominant(), tpl = d && w.assets.clips.get(d.name);
      const dt = a.scene.getEngine().getDeltaTime() / 1000; if (!dt) return;
      sk.frames++;
      ['foot_l', 'foot_r'].forEach((n, k) => {
        const f = h.inst.bones.get(n); const p = f.getAbsolutePosition().clone();
        const planted = p.y - h.y < h.ankleY + .035 * h.inst.root.scaling.x; void tpl; void d;
        const prev = sk.prev[k];
        if (planted && prev && h.state === 'move') { sk.sum += Math.hypot(p.x - prev.x, p.z - prev.z) / dt; sk.n++; }
        sk.prev[k] = planted ? p : null;
      });
    });
  }, lock);
  const hold = async (keys: string[], ms: number) => { for (const k of keys) await p.keyboard.down(k); await p.waitForTimeout(ms); for (const k of keys) await p.keyboard.up(k); };
  await hold(['KeyD'], 1800); await hold(['KeyA'], 1500); await hold(['KeyW', 'ShiftLeft'], 1800); await hold(['KeyS'], 1200); await hold(['KeyW', 'KeyD'], 1400); await p.waitForTimeout(600);
  return p.evaluate(() => { const sk = (window as any).__sk; return { planted_samples: sk.n, mean_skate_m_per_s: +(sk.sum / Math.max(1, sk.n) / 1.22).toFixed(3), frames: sk.frames }; });
};
const off = await run(page, false), on = await run(page, true);
console.log(JSON.stringify({ footLockOff: off, footLockOn: on }, null, 1));
await browser.close();
