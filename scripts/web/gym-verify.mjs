import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = '.debug/combat-gym', base = 'http://127.0.0.1:7505'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist', '--window-size=1456,940'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 810 }, recordVideo: { dir: out, size: { width: 1440, height: 810 } } });
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', e => errors.push(String(e)));
const note = (step, ok, detail) => { checks.push({ step, ok, detail }); console.log(JSON.stringify(checks.at(-1))); if (!ok) throw new Error(step); };
const canon = () => fetch(base + '/api/gym/state').then(r => r.json());
const pos = () => page.evaluate(() => window.__tv.own().pos);
const wait = () => page.waitForFunction(() => window.__tv?.phase === 'playing' && window.__tv.link.playable, null, { timeout: 90000 });
async function keys(want) { for (const k of held) if (!want.includes(k)) await page.keyboard.up(k); for (const k of want) if (!held.includes(k)) await page.keyboard.down(k); held = want; }
let held = [];
async function walk(x,z,stop=1.3) {
  const end = Date.now()+20000;
  while(Date.now()<end) {
    const r=await page.evaluate(([x,z])=>{const tv=window.__tv,p=tv.predictor.predicted.pos,y=tv.rig.yaw,dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz)||1;return{d,f:dx/d*-Math.sin(y)+dz/d*-Math.cos(y),r:dx/d*Math.cos(y)+dz/d*-Math.sin(y)}},[x,z]);
    if(r.d<stop){await keys([]);return true;}
    const k=[];if(r.f>.38)k.push('KeyW');else if(r.f<-.38)k.push('KeyS');if(r.r>.38)k.push('KeyD');else if(r.r<-.38)k.push('KeyA');await keys(k);await page.waitForTimeout(150);
  } await keys([]);return false;
}
try {
  await fetch(base+'/api/gym/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reset',seed:918271})});
  await page.goto(base+'/?gym=1&autoplay=1&view=orbit&renderer=webgl2'); await wait(); await page.waitForTimeout(1500);
  const digest=(await canon()).fixtureDigest;
  await page.screenshot({path:out+'/02-arena-final.png'});
  note('gym entered with six canonical bodies',(await canon()).bodies.length===6);
  await page.keyboard.press('KeyF'); await page.waitForTimeout(400);
  const before=(await canon()).bodies[1].health; await page.keyboard.press('KeyH'); await page.waitForTimeout(1200);
  const hit=await canon(); note('ordinary keyboard strike causes canonical damage',hit.bodies[1].health<before,{before,after:hit.bodies[1].health,events:hit.events.map(e=>e.type)});
  await page.screenshot({path:out+'/03-hit.png'});
  await page.keyboard.press('KeyF'); const p0=await pos(); await keys(['KeyS']); await page.waitForTimeout(1000); await keys([]); const p1=await pos();
  note('ordinary movement changes canonical position',Math.hypot(p1.x-p0.x,p1.z-p0.z)>1,{p0,p1});
  await keys(['KeyA']); await page.keyboard.press('Space'); await page.waitForTimeout(650); await keys([]);
  note('dodge resolves through canonical defensive action',(await canon()).events.some(e=>e.type==='combat_action'&&e.data.kind==='sidestep'&&e.data.phase==='complete'),(await canon()).events.map(e=>e.type));
  // Blur while a movement key is held: the input boundary must release it.
  await keys(['KeyW']); await page.waitForTimeout(200); await page.evaluate(()=>window.dispatchEvent(new Event('blur'))); await keys([]); await page.waitForTimeout(400);
  const stopped=await pos(); await page.waitForTimeout(700); const afterStop=await pos(); note('interrupted input stops movement',Math.hypot(afterStop.x-stopped.x,afterStop.z-stopped.z)<.2,{stopped,afterStop});
  note('walk to friendly guide',await walk(22,40,1.6));
  await page.keyboard.press('KeyE'); await page.waitForTimeout(700);
  note('ordinary NPC interaction opens canonical dialogue',await page.evaluate(()=>window.__tv.dialogue.isOpen));
  await page.screenshot({path:out+'/04-dialogue.png'}); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  note('walk to interaction chest',await walk(26,39,1.3));
  await page.keyboard.press('KeyE'); await page.waitForTimeout(650);
  const objects=await canon(); note('object interaction emits a canonical event',objects.events.some(e=>e.type==='container_opened'),objects.events.map(e=>e.type));
  await page.screenshot({path:out+'/05-object.png'});
  if(await page.evaluate(()=>window.__tv.modal.isOpen)) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await page.getByRole('button',{name:'Reset seed',exact:true}).click(); await wait(); await page.waitForTimeout(300);
  const reset=await canon(); note('reset restores exact fixture digest',reset.fixtureDigest===digest,{digest,reset:reset.fixtureDigest}); note('reset repopulates health and start position',reset.bodies[1].health===80&&reset.bodies[0].pos.x===29,reset.bodies.slice(0,2));
  await page.getByRole('button',{name:'Pause simulation',exact:true}).click(); await page.waitForTimeout(400); note('pause disables gameplay stepping',(await canon()).paused===true);
  await page.getByRole('button',{name:'Resume simulation',exact:true}).click(); await page.waitForTimeout(400); note('resume restores gameplay stepping',(await canon()).paused===false);
  await page.getByRole('button',{name:'Switch to Town',exact:true}).click(); await wait(); await page.waitForTimeout(500);
  const town=await page.evaluate(()=>({id:window.__tv.own().bodyId,pos:window.__tv.own().pos,wealth:window.__tv.own().wealth,carried:window.__tv.snapshot.carried}));
  await page.screenshot({path:out+'/06-town.png'});
  await page.getByRole('button',{name:'Switch to Combat Gym',exact:true}).click(); await wait(); await page.getByRole('button',{name:'Reset seed',exact:true}).click(); await wait();
  await page.getByRole('button',{name:'Switch to Town',exact:true}).click(); await wait();
  const townAgain=await page.evaluate(()=>({id:window.__tv.own().bodyId,pos:window.__tv.own().pos,wealth:window.__tv.own().wealth,carried:window.__tv.snapshot.carried}));
  note('town identity, position, purse and inventory survive gym switch/reset',JSON.stringify(town)===JSON.stringify(townAgain),{town,townAgain});
  await page.getByRole('button',{name:'Switch to Combat Gym',exact:true}).click(); await wait();
  note('repeat switch returns to playable gym',(await canon()).scenario==='gym');
} catch(e) { checks.push({step:'browser run',ok:false,error:String(e)}); await page.screenshot({path:out+'/verification-failure.png'}); console.log(String(e)); }
writeFileSync(out+'/browser-report.json',JSON.stringify({checks,errors},null,2));
await context.close();await browser.close();
if(checks.some(c=>!c.ok))process.exitCode=1;

