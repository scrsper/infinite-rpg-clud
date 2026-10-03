/** Repeatable visual inspection through the existing observer replay, never a live account.
 * Run: npx tsx scripts/web/visual-fidelity.ts --out docs/evidence/babylon-visual-fidelity-v1/before
 * Requires web:dev on 5186 and the existing local arrival2 recording. */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const args = process.argv.slice(2);
const flag = (key: string, fallback: string) => args[args.indexOf(`--${key}`) + 1] ?? fallback;
const value = (key: string, fallback: string) => args.includes(`--${key}`) ? flag(key, fallback) : fallback;
const out = resolve(value('out', 'docs/evidence/babylon-visual-fidelity-v1/iterations/current'));
const source = readFileSync(resolve(value('replay', '.debug/web/streams/arrival2.json')), 'utf8');
const recording = JSON.parse(source);
const frames = recording.frames.filter((f: any) => !['snapshot', 'local_state'].includes(f.m.type)).map((f: any) => ({ t: 0, m: f.m }));
for (const type of ['snapshot', 'local_state']) frames.push({ t: 0, m: recording.frames.filter((f: any) => f.m.type === type).at(-1).m });
frames.push({ t: 1e12, m: { type: 'hold' } });
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', e => { if (e.type() === 'error') errors.push(e.text().slice(0, 500)); });
try {
  await page.addInitScript('window.__name = f => f;');
  // Evidence must not reload midway if another presentation file is being edited.
  await page.routeWebSocket('**', socket => socket.close());
  await page.route('**/visual-fixture.json', route => route.fulfill({ json: { frames } }));
  await page.goto(`${value('url', 'http://127.0.0.1:5186')}/?replay=/visual-fixture.json&view=orbit&hour=16&quality=${value('quality', 'high')}&renderer=${value('renderer', 'webgl2')}`);
  await page.waitForFunction(() => (window as any).__tv?.ready && !(window as any).__tv.regions.pendingBuilds, undefined, { timeout: 120000 }).catch(async e => {
    console.error(JSON.stringify({ bootErrors: errors }));
    await page.screenshot({ path: join(out, 'boot-failed.png') }); throw e;
  });
  await page.waitForTimeout(4000);
  const views = [
    { name: '01-gameplay', hour: 16 },
    { name: '02-tavern', hour: 16, eye: [12032, 31, 20066], target: [12014, 29, 20041] },
    { name: '03-street', hour: 16, eye: [12039, 27.5, 20034], target: [12009, 28, 20016] },
    { name: '04-isometric', hour: 16, view: 'isometric' },
    { name: '05-blue-hour', hour: 18.6, eye: [12032, 31, 20066], target: [12014, 29, 20041] },
    { name: '06-forest-edge', hour: 10, eye: [12052, 29, 19977], target: [12063, 29, 19936] },
    { name: '07-night', hour: 22, eye: [12032, 31, 20066], target: [12014, 29, 20041] },
    { name: '08-rain', hour: 16, eye: [12032, 31, 20066], target: [12014, 29, 20041], weather: {kind:'rain',intensity:.85,wind:.7} },
    { name: '09-fields', hour: 16, eye: [12044, 31, 20116], target: [12022, 25, 20094] },
    { name: '10-civic-lane', hour: 16, eye: [11998, 30, 20004], target: [11972, 28, 20034] },
    { name: '11-mill', hour: 16, eye: [12153, 30, 20110], target: [12127, 29, 20092] },
    { name: '12-market', hour: 16, eye: [12116, 27.5, 19992], target: [12099, 25, 19980] },
    { name: '13-characters', hour: 16, eye: [12039.5, 26.3, 20012.5], target: [12035.5, 25, 20008.5] },
    { name: '14-tavern-interior', hour: 16, eye: [12018, 27, 20044], target: [12009, 26, 20039] },
    { name: '15-mill-exterior', hour: 16, eye: [12104, 29, 20112], target: [12124, 29, 20091] },
    { name: '16-woodland', hour: 10, eye: [12061, 29, 19906], target: [12068, 28, 19884] },
    { name: '17-people-night', hour: 22, eye: [12039.5, 26.3, 20012.5], target: [12035.5, 25, 20008.5] },
  ];
  const results: unknown[] = [];
  await page.evaluate(() => { const t = (window as any).__tv; (window as any).__visualRigUpdate = t.rig.update; });
  const selected = value('views', '').split(',').filter(Boolean);
  for (const view of views.filter(v => !selected.length || selected.includes(v.name))) {
    await page.evaluate(v => {
      const t = (window as any).__tv;
      t.regions.weather = v.weather ?? {kind:'clear',intensity:0,wind:.2};
      t.params.set('hour', String(v.hour));
      t.updateSettings({ viewMode: v.view ?? 'orbit' });
      t.rig.update = (window as any).__visualRigUpdate;
      if (v.eye && v.target) {
        // Only move the rendering camera. Canonical actor, geometry, and observation remain recorded.
        t.rig.update = () => {
          const o = t.regions.origin;
          t.camera.position.set(v.eye![0] - o.x, v.eye![1] - o.y, v.eye![2] - o.z);
          const target = t.camera.position.clone().set(v.target![0] - o.x, v.target![1] - o.y, v.target![2] - o.z);
          t.camera.mode = 0; t.camera.fov = .92; t.camera.setTarget(target);
          t.rig.forward.copyFrom(target.subtract(t.camera.position).normalize());
        };
      }
    }, view);
    await page.waitForTimeout(2200);
    await page.evaluate(() => (window as any).__tv.perfReset());
    await page.waitForTimeout(1600);
    await page.screenshot({ path: join(out, `${view.name}.png`) });
    results.push(await page.evaluate(v => {
      const t = (window as any).__tv;
      return { sky: ['clouds','sky','stars'].map(name=>{const m=t.ctx.scene.getMaterialByName(name);return {name,alpha:m?.alpha,color:m?.emissiveColor?.asArray(),texture:m?.emissiveTexture?.name,opacity:m?.opacityTexture?.name,mode:m?.transparencyMode};}), weather:t.regions.weather, hour:t.atmosphere.hour, view: v, perf: t.perfReport(), meshes: t.ctx.scene.meshes.length, activeMeshes: t.ctx.scene.getActiveMeshes().length, materials: t.ctx.scene.materials.length, triangles: t.ctx.scene.getActiveIndices()/3, regionBuildMs: Array.from(t.regions.regions.values(), (r:any) => ({id:r.id,ms:r.stats.buildMs,stages:r.stats.stageMs})), grass: t.grass.count, regions: t.regions.regions.size, pending: t.regions.pendingBuilds, renderer: t.ctx.kind, gpu: t.ctx.engine.getGlInfo?.(), camera: t.camera.position.asArray() };
    }, view));
  }
  writeFileSync(join(out, 'capture.json'), JSON.stringify({ recordingSha256: createHash('sha256').update(source).digest('hex'), fixture: 'Frozen recorded observer state; only presentation camera and hour change. Gameplay/isometric views use ordinary camera rig. No human playtest.', viewport: [1600, 900], results, errors }, null, 2));
  console.log(JSON.stringify({ out, views: results.length, errorCount: errors.length, firstError: errors[0] }));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
