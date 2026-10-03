/**
 * Pose sheet for retargeted arena clips: freezes the hero at fractions of each clip, close up.
 *   npx tsx scripts/web/arena-poses.ts [--name poses] [--clips a,b,c]
 * Writes .debug/arena/<name>/<clip>-<frac>.png. Dev server must be running (npm run web:dev).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const name = arg('name', 'poses');
const clips = arg('clips', 'Idle_Combat,Running_A,2H_Melee_Attack_Slice,2H_Melee_Attack_Chop,2H_Melee_Attack_Spin,1H_Melee_Attack_Slice_Diagonal,Blocking,Dodge_Forward,Hit_A,Death_A,2H_Ranged_Aiming').split(',');
const fracs = arg('fracs', '0,0.3,0.5,0.75').split(',').map(Number);
const out = join(process.cwd(), '.debug/arena', name); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--window-size=900,900'] });
const page = await (await browser.newContext({ viewport: { width: 760, height: 760 } })).newPage();
await page.addInitScript(() => { (window as unknown as { __name: (f: unknown) => unknown }).__name = f => f; });
await page.goto('http://127.0.0.1:5180/?arena=1&seed=5');
await page.waitForFunction(() => !!(window as unknown as { __arena?: unknown }).__arena, null, { timeout: 120_000 });
await page.evaluate(() => { const a = (window as any).__arena; a.hud.toggleHelp(); a.view(.22, Math.PI * .7); a.zoom(6.5); });
for (const c of clips) for (const f of fracs) {
  const ok = await page.evaluate(([c, f]) => (window as any).__arena.pose(c, f, 0), [c, f] as const);
  if (!ok) { console.log('missing', c); break; }
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(out, `${c}-${String(f).replace('.', '')}.png`) });
}
await browser.close();
console.log('poses ->', out);
