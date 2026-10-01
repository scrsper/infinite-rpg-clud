/** Isolated isometric UI acceptance. Never uses a saved user world/profile. */
import { chromium } from 'playwright';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { LiveServer } from '../../src/server/live';
import { loadConfig, type ReleaseIdentity } from '../../src/server/config';
import { AccountRegistry } from '../../src/server/accounts';
import { WebGateway } from '../../src/webgate/gateway';
import { SAVE_VERSION } from '../../src/sim/persist/save';
import { createAnimal } from '../../src/sim/ecology/animals';
import { setExternalControl } from '../../src/sim/runtime/controllers';

const root = mkdtempSync(join(tmpdir(), 'tvo-dialogue-ui-')), out = resolve('.debug/isometric'); mkdirSync(out, { recursive: true });
const reserve = createServer(); await new Promise<void>(r => reserve.listen(0, '127.0.0.1', r));
const port = (reserve.address() as { port: number }).port; await new Promise<void>(r => reserve.close(() => r()));
const path = join(root, 'config.json');
writeFileSync(path, JSON.stringify({ env: 'dev', port, bind: ['127.0.0.1'], webGateway: true, seed: 918271, createWorldIfMissing: true, checkpointSeconds: 3600, backupMinutes: 600 }));
mkdirSync(join(root, 'credentials')); writeFileSync(join(root, 'credentials', 'admin.token'), 'isolated-dialogue-ui-admin-0123456789');
const token = new AccountRegistry(join(root, 'credentials', 'accounts.json')).add('dialogue-ui', 'Dialogue UI acceptance');
const release: ReleaseIdentity = { version: 'dialogue-ui', revision: 'test', dirty: false, builtAtIso: '', protocol: 1, saveSchema: SAVE_VERSION, generatorVersion: 'playable-1', node: process.version };
const server = new LiveServer(loadConfig(path), release, () => {});
const gateway = new WebGateway({ port: 0, upstream: { host: '127.0.0.1', port }, credentials: { account: 'dialogue-ui', token }, staticDir: resolve('.debug/isometric/bundle') });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [], modelRequests: string[] = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (/:(11434|1234)\b|chat\/completions/.test(r.url())) modelRequests.push(r.url()); });
await page.addInitScript('window.__name = (f) => f;');
const fetchBefore = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('No inference HTTP networking permitted'); };
try {
  await server.open(); await server.listen(); await gateway.listen();
  await page.goto(gateway.issueLaunchUrl()); await page.goto(`${gateway.url}/?autoplay=1&name=Traveler&view=isometric`);
  await page.waitForFunction(() => (window as any).__tv?.ready === true, undefined, { timeout: 120000 });
  await page.waitForTimeout(3000);
  const own = () => page.evaluate(() => { const tv = (window as any).__tv; return { pos: {...tv.predictor.predicted.pos}, yaw: tv.predictor.predicted.yaw, mode: tv.settings.viewMode, cameraMode: tv.camera.mode, wealth: tv.own()?.wealth }; });
  const checks: Record<string, unknown>[] = [];
  const note = (name: string, passed: boolean, evidence: unknown) => { checks.push({ name, passed, evidence }); console.log(JSON.stringify({name,passed,evidence})); };
  await page.screenshot({ path: join(out, '01-isometric-settlement.png') });
  const before = await own();
  await page.keyboard.down('w'); await page.waitForTimeout(1500); await page.keyboard.up('w'); await page.waitForTimeout(300);
  const walked = await own(); note('screen-up walking', walked.pos.x > before.pos.x + .2 && walked.pos.z < before.pos.z - .2, {before,after:walked});
  await page.keyboard.down('Shift'); await page.keyboard.down('s'); await page.waitForTimeout(1200); await page.keyboard.up('s'); await page.keyboard.up('Shift'); await page.waitForTimeout(300);
  const ran = await own(); note('screen-down running', ran.pos.x < walked.pos.x -.2 && ran.pos.z > walked.pos.z+.2, {before:walked,after:ran});
  await page.screenshot({ path: join(out, '02-after-movement.png') });
  for(const key of ['i','j']) { await page.keyboard.press(key); await page.waitForFunction(()=>(window as any).__tv.modal.isOpen); await page.keyboard.press('Escape'); await page.waitForFunction(()=>!(window as any).__tv.modal.isOpen); await page.waitForTimeout(300); }
  note('repeat interrupted menu flows', !(await page.evaluate(() => (window as any).__tv.modal.isOpen)), null);
  const playerId = await page.evaluate(() => (window as any).__tv.link.hello.playerId);
  const w = server.session.world, player = w.person(playerId)!, pb = w.primaryBody(playerId)!;
  const npc = w.livingPersons().filter(p => p.id !== playerId && !p.hostile && p.age > 20 && /baker|merchant/.test(p.occupation)).sort((a,b)=> { const aa=w.primaryBody(a.id)!,bb=w.primaryBody(b.id)!; return Math.hypot(aa.pos.x-pb.pos.x,aa.pos.z-pb.pos.z)-Math.hypot(bb.pos.x-pb.pos.x,bb.pos.z-pb.pos.z); })[0];
  const body = w.primaryBody(npc.id)!; const original = {...body.pos}; setExternalControl(npc, true);
  // Explicit bounded UI fixture only: natural world keeps running; ordinary input above is separate.
  pb.pos = {...body.pos, x:body.pos.x+1}; body.pose = 'stand';
  player.mind.percepts = [{ entityId: npc.id, bodyId: body.id, how: 'saw', pos: { ...body.pos }, tick: w.now, distance: 1 }];
  await page.waitForTimeout(3500);
  const pointFor = () => page.evaluate(id => {const tv=(window as any).__tv;const target=tv.snapshot.interactionTargets.find((t:any)=>t.kind==='person' && (t.targetId===id || false));const t=target??tv.snapshot.interactionTargets.find((t:any)=>t.kind==='person');if(!t)throw Error('No canonical nearby person interaction');const v=tv.camera.position.constructor.Project(tv.regions.toRender(t.pos),tv.camera.getWorldMatrix().constructor.Identity(),tv.ctx.scene.getTransformMatrix(),tv.camera.viewport.toGlobal(1600,1000));return {x:v.x,y:v.y};}, body.id);
  const targetPoint=await pointFor();
  await page.mouse.move(targetPoint.x,targetPoint.y); await page.waitForTimeout(300); await page.keyboard.press('e');
  const input = page.locator('.tv-speech-input'); await input.waitFor({ state: 'visible', timeout: 12000 });
  note('root dialogue options',true,await page.locator('button.tv-opt').allTextContents());
  await page.waitForTimeout(750);
  const bounds=await page.locator('.tv-talk').boundingBox();
  note('settled conversation fits viewport',!!bounds && bounds.x>=0 && bounds.x+bounds.width<=1601 && bounds.y>=0 && bounds.y+bounds.height<=1001,bounds);
  await page.screenshot({ path: join(out, '03-isometric-conversation.png') });
  const trade = page.getByRole('button', { name: /^Trade$/i });
  if (await trade.count()) await trade.first().click();
  const tradeOption=page.locator('button.tv-opt').filter({hasText:/Trade/}).first();
  if(await tradeOption.count()) { await tradeOption.click(); await page.waitForTimeout(500); }
  const buy = page.locator('button.tv-opt').filter({hasText:/Buy /i}).first();
  if (await buy.count()) {
    const wallet = (await own()).wealth; await buy.click(); await page.waitForTimeout(300);
    const confirmation = page.getByRole('button',{name:'Confirm',exact:true});
    await page.screenshot({path:join(out,'03b-trade-confirm.png')});
    note('trade confirmation shown',await confirmation.isVisible(),null);
    await page.getByRole('button',{name:'Not now',exact:true}).click();
    note('cancel purchase keeps wealth',(await own()).wealth===wallet,{wallet});
    await buy.click(); await confirmation.click(); await page.waitForTimeout(1000);
    note('canonical purchase reduces wealth',(await own()).wealth<wallet,{before:wallet,after:(await own()).wealth});
  } else note('canonical sale offer available',false,{occupation:npc.occupation});
  await page.getByRole('button',{name:/^Goodbye/}).click(); await page.waitForFunction(()=>!(window as any).__tv.dialogue.isOpen); await page.waitForTimeout(700);
  const repeatedPoint=await pointFor();
  await page.mouse.move(repeatedPoint.x,repeatedPoint.y); await page.keyboard.press('e'); await input.waitFor({state:'visible',timeout:12000}); await page.keyboard.press('Escape'); await page.waitForFunction(()=>!(window as any).__tv.dialogue.isOpen);
  note('conversation repeat and interruption', !(await page.evaluate(() => (window as any).__tv.dialogue.isOpen)), {fixture:'NPC co-location and direct observation, disclosed'});
  body.pos = original; setExternalControl(npc, false);
  const indoor = [...w.entities.values()].find((e: any) => e.kind === 'place' && e.indoor && e.inside && Math.hypot(e.inside.x-pb.pos.x,e.inside.z-pb.pos.z)<90) as any;
  if(indoor?.door) {
    // Explicit test start at the canonical doorway; keyboard travel through the actual collision follows.
    pb.pos = {...indoor.door,x:indoor.door.x+.5,z:indoor.door.z+.5}; await page.waitForTimeout(1500); await page.keyboard.press('e'); await page.waitForTimeout(300);
    const path = w.nav.findPath(pb.pos,indoor.inside) ?? [indoor.inside];
    let arrived = false;
    if(path) for(const point of path) {
      const deadline = Date.now()+4000;
      while(Date.now()<deadline) {
        const p=(await own()).pos, dx=point.x-p.x,dz=point.z-p.z;
        if(Math.hypot(dx,dz)<.45)break;
        const mx=dx+dz,my=dx-dz,keys:string[]=[];
        if(Math.abs(mx)>.22)keys.push(mx>0?'d':'a');if(Math.abs(my)>.22)keys.push(my>0?'w':'s');
        for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(100);for(const key of keys)await page.keyboard.up(key);
      }
    }
    await page.waitForTimeout(700);
    const at=(await own()).pos; arrived=Math.hypot(at.x-indoor.inside.x,at.z-indoor.inside.z)<1.2;
    const cut=await page.evaluate(()=>(window as any).__tv.ctx.scene.meshes.filter((m:any)=>m.metadata?.cutawayBounds && m.material?.clipPlane?.d>-100000).length);
    await page.screenshot({path:join(out,'04-isometric-cutaway.png')});note('keyboard entry and occupied cutaway',arrived&&cut>0,{arrived,at,goal:indoor.inside,path,clippedMeshes:cut,fixture:'test begins at canonical doorway; actual keys enter the physical building'});
  }
  // A high unarmed jab requires an upright human hurt volume, not a low boar's silhouette.
  // Both combatants are staged in the previously traversed open ground; actual commands resolve contact.
  pb.pos={...ran.pos}; body.pos={...ran.pos,x:ran.pos.x+.65,z:ran.pos.z-.65}; body.pose='stand'; setExternalControl(npc,true);
  const hpBefore=body.health;
  await page.waitForTimeout(1800); await page.keyboard.press('f'); await page.waitForTimeout(350);
  await page.keyboard.press('h'); await page.waitForTimeout(1200);
  note('canonical melee contact',body.health<hpBefore,{before:hpBefore,after:body.health,targetBodyId:body.id,action:pb.combatAction,fixture:'upright adult NPC staged nearby on traversed open ground in disposable validation world'});
  await page.keyboard.press('Space'); await page.waitForTimeout(800);
  body.pos=original; setExternalControl(npc,false);
  note('combat controls emit canonical commands', !!await page.evaluate(()=>(window as any).__tv.controller.lastCombat), await page.evaluate(()=>{const tv=(window as any).__tv;return {lastCombat:tv.controller.lastCombat,bodyAction:tv.own()?.combatAction}}));
  await page.screenshot({path:join(out,'05-isometric-action.png')});
  await page.evaluate(() => (window as any).__tv.updateSettings({viewMode:'third-person'})); await page.waitForTimeout(500);
  const third = await own(); const restored=await page.evaluate(()=>(window as any).__tv.ctx.scene.meshes.every((m:any)=>!m.metadata?.cutawayBounds || m.material.clipPlane.d===-1e8)); await page.evaluate(() => (window as any).__tv.updateSettings({viewMode:'isometric'})); await page.waitForTimeout(500);
  note('view switch round-trip',third.cameraMode===0 && (await own()).cameraMode===1 && restored,{cutawaysRestored:restored});
  writeFileSync(join(out,'browser-evidence.json'),JSON.stringify({checks,errors,fixture:'Only movement/menu checks are ordinary-input travel. Dialogue co-location and interior relocation are explicit UI/projection fixtures. No human/controller acceptance.',modelRequests},null,2));
  if(errors.length || checks.some(c=>c.passed===false)) throw Error('Browser checks failed; inspect evidence');
  console.log('Isometric browser checks passed.');
} finally { globalThis.fetch = fetchBefore; await browser.close(); await gateway.close(); await server.stopInProcess('dialogue UI complete'); rmSync(root, { recursive: true, force: true }); }
