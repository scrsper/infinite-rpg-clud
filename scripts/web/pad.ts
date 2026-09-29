import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

/**
 * Gamepad path check with an INJECTED controller. The page's `navigator.getGamepads()` is replaced by a
 * script-controlled standard-mapping pad, so this proves the client reads sticks and buttons and acts on
 * them: it is NOT a physical-controller test and does not certify how a real pad feels, its dead zones,
 * vibration, or a browser's own mapping of any particular device.
 *
 *   tsx scripts/web/pad.ts --out .debug/web/pad
 */
const argv = process.argv.slice(2);
const flag = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const out = resolve(flag('out', '.debug/web/pad')); mkdirSync(out, { recursive: true });
const [w, h] = flag('size', '1920x1080').split('x').map(Number);
const st = JSON.parse(readFileSync(join(homedir(), 'TornVeilAlpha', 'web-gateway', 'gateway.json'), 'utf8')) as { origin: string; operator: string };
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(st.origin)) throw new Error('gateway must be loopback');
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', `--window-size=${w + 16},${h + 130}`] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await page.addInitScript('window.__name = (f) => f;');
await page.addInitScript(`
  window.__pad = { connected: false, buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
  navigator.getGamepads = () => window.__pad.connected ? [{ id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: window.__pad.axes.slice(), buttons: window.__pad.buttons.map(b => ({ ...b })), vibrationActuator: null }] : [];
`);
const errors: string[] = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errors.push(`pageerror ${String(e).slice(0, 240)}`));
const results: { step: string; ok: boolean; detail?: unknown }[] = [];
const check = (step: string, ok: boolean, detail?: unknown) => { results.push({ step, ok, detail }); console.log(`${ok ? 'ok' : 'NO'} ${step}${detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 200) : ''}`); };
const shot = (n: string) => page.screenshot({ path: join(out, `${n}.png`) });

const { url } = await (await fetch(`${st.origin}/api/operator/launch`, { method: 'POST', headers: { 'x-torn-veil-gateway-operator': st.operator } })).json() as { url: string };
await page.goto(url);
await page.goto(`${st.origin}/?autoplay=1`);
await page.waitForFunction(() => (window as any).__tv?.ready === true, undefined, { timeout: 120000 });
await page.waitForTimeout(2500);

const pad = {
  connect: () => page.evaluate(() => { const p = (window as any).__pad; p.connected = true; const ev: any = new Event('gamepadconnected'); ev.gamepad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0 }; window.dispatchEvent(ev); }),
  axes: (a: number[]) => page.evaluate((v: number[]) => { (window as any).__pad.axes = v; }, a),
  hold: (i: number, on: boolean) => page.evaluate(([idx, o]) => { const b = (window as any).__pad.buttons[idx as number]; b.pressed = b.touched = !!o; b.value = o ? 1 : 0; }, [i, on] as [number, boolean]),
  tap: async (i: number, ms = 90) => { await pad.hold(i, true); await page.waitForTimeout(ms); await pad.hold(i, false); await page.waitForTimeout(120); },
};
const st0 = () => page.evaluate(() => { const tv = (window as any).__tv, p = tv.predictor.predicted; return { pos: [p.pos.x, p.pos.z], yaw: tv.rig.yaw, dev: tv.input.device, modal: !!tv.modal.isOpen, dialogue: !!tv.dialogue.isOpen, guard: tv.controller.guardHeld, last: tv.controller.lastCombat ? { kind: tv.controller.lastCombat.kind, weight: tv.controller.lastCombat.weight ?? null, defend: tv.controller.lastCombat.defend ?? null } : null, tab: tv.modal.currentTab ?? null }; });

await pad.connect(); await page.waitForTimeout(400);
let s = await st0();
await pad.tap(0); await page.waitForTimeout(300);   // a first button makes the client switch to pad prompts
s = await st0(); check('the client switches to controller prompts once a pad is used', s.dev === 'xbox', { device: s.dev });
await shot('01-pad-prompts');

const a = await st0();
await pad.axes([0, -1, 0, 0]); await page.waitForTimeout(2000); await pad.axes([0, 0, 0, 0]); await page.waitForTimeout(400);
const b = await st0(); const moved = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1]);
check('left stick walks the character', moved > 3, { metres: +moved.toFixed(1) });

const y0 = (await st0()).yaw;
await pad.axes([0, 0, 1, 0]); await page.waitForTimeout(700); await pad.axes([0, 0, 0, 0]); await page.waitForTimeout(200);
const y1 = (await st0()).yaw; check('right stick turns the camera', Math.abs(Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0))) > 0.5, { radians: +(y1 - y0).toFixed(2) });

await pad.axes([0.08, -0.06, 0.05, 0.04]); await page.waitForTimeout(600);
const dz = await st0(); await pad.axes([0, 0, 0, 0]);
check('stick drift inside the dead zone does nothing', Math.hypot(dz.pos[0] - (await st0()).pos[0], dz.pos[1] - (await st0()).pos[1]) < 0.3 && Math.abs(dz.yaw - (await st0()).yaw) < 0.05);

await pad.tap(2); await page.waitForTimeout(300);
s = await st0(); check('X strikes (light attack sent)', s.last?.kind === 'attack' && s.last?.weight === 'light', s.last);
await page.waitForTimeout(700);
await pad.tap(3); await page.waitForTimeout(300);
s = await st0(); check('Y strikes heavy', s.last?.kind === 'attack' && s.last?.weight === 'heavy', s.last);
await page.waitForTimeout(900);
await pad.hold(4, true); await page.waitForTimeout(400);
s = await st0(); check('LB holds the guard', s.guard === true); await shot('02-pad-guard');
await pad.hold(4, false); await page.waitForTimeout(300);
s = await st0(); check('releasing LB drops the guard', s.guard === false);
await pad.axes([-1, 0, 0, 0]); await page.waitForTimeout(150); await pad.tap(1); await page.waitForTimeout(250); await pad.axes([0, 0, 0, 0]);
s = await st0(); check('B with the stick to one side sends a directional dodge', s.last?.kind === 'defend', s.last);
await page.waitForTimeout(900);

await pad.tap(14); await page.waitForTimeout(700);
s = await st0(); check('D-pad opens Items', s.modal && s.tab === 'items', { tab: s.tab }); await shot('03-pad-items');
await pad.tap(5); await page.waitForTimeout(500); s = await st0(); check('RB switches to the next tab', s.modal && s.tab !== 'items', { tab: s.tab });
await pad.tap(4); await page.waitForTimeout(500); s = await st0(); check('LB switches back', s.modal && s.tab === 'items', { tab: s.tab });
await pad.tap(13); await page.waitForTimeout(250); await pad.tap(0); await page.waitForTimeout(500);   // move focus and press A on whatever is there
await pad.tap(1); await page.waitForTimeout(700); s = await st0(); check('B closes the menu', !s.modal);
await pad.tap(9); await page.waitForTimeout(700); s = await st0(); check('Menu opens the pause menu', s.modal && s.tab === 'pause', { tab: s.tab }); await shot('04-pad-pause');
await pad.tap(1); await page.waitForTimeout(600); s = await st0(); check('B resumes', !s.modal);
await pad.tap(8); await page.waitForTimeout(700); s = await st0(); check('View opens the Journal', s.modal && s.tab === 'journal', { tab: s.tab }); await pad.tap(1); await page.waitForTimeout(500);

// Disconnect: held input must not stick, and prompts fall back to keyboard.
await pad.axes([0, -1, 0, 0]); await page.waitForTimeout(300);
await page.evaluate(() => { (window as any).__pad.connected = false; (window as any).__pad.axes = [0, 0, 0, 0]; window.dispatchEvent(new Event('gamepaddisconnected')); });
await page.waitForTimeout(500);
const d0 = await st0(); await page.waitForTimeout(800); const d1 = await st0();
check('unplugging the pad while the stick is held stops movement', Math.hypot(d1.pos[0] - d0.pos[0], d1.pos[1] - d0.pos[1]) < 0.4 && d1.dev === 'keyboard', { device: d1.dev });

writeFileSync(join(out, 'report.json'), JSON.stringify({ at: new Date().toISOString(), label: 'INJECTED gamepad (script-controlled navigator.getGamepads); not a physical controller test', results, errors: errors.slice(0, 20) }, null, 1));
console.log(JSON.stringify({ passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, errors: errors.length }));
await browser.close();
