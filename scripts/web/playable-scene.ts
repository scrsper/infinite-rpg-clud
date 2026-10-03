/** Disposable human-playable scene: existing village, canonical actors and mechanics. No retained save is opened. */
import { chromium } from 'playwright';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createServer } from 'node:net';
import { LiveServer } from '../../src/server/live';
import { loadConfig, type ReleaseIdentity } from '../../src/server/config';
import { AccountRegistry } from '../../src/server/accounts';
import { WebGateway } from '../../src/webgate/gateway';
import { appearanceFromTraits } from '../../src/sim/core/appearance';
import { CAST } from '../../src/sim/world/cast';
import { makePerson, makeBody } from '../../src/sim/world/factory';
import { seedStartingSkills } from '../../src/sim/core/skills';
import { SAVE_VERSION } from '../../src/sim/persist/save';

const root = mkdtempSync(join(tmpdir(), 'tvo-playable-scene-'));
const reserve = createServer(); await new Promise<void>(r => reserve.listen(0, '127.0.0.1', r));
const port = (reserve.address() as { port: number }).port; await new Promise<void>(r => reserve.close(() => r()));
const path = join(root, 'config.json');
writeFileSync(path, JSON.stringify({ env: 'dev', port, bind: ['127.0.0.1'], webGateway: true, seed: 918271, createWorldIfMissing: true, checkpointSeconds: 3600, backupMinutes: 600 }));
mkdirSync(join(root, 'credentials')); writeFileSync(join(root, 'credentials', 'admin.token'), 'isolated-dialogue-ui-admin-0123456789');
const token = new AccountRegistry(join(root, 'credentials', 'accounts.json')).add('dialogue-ui', 'Dialogue UI acceptance');
const release: ReleaseIdentity = { version: 'dialogue-ui', revision: 'test', dirty: false, builtAtIso: '', protocol: 1, saveSchema: SAVE_VERSION, generatorVersion: 'playable-1', node: process.version };
const server = new LiveServer(loadConfig(path), release, () => {});
const gateway = new WebGateway({ port: 0, upstream: { host: '127.0.0.1', port }, credentials: { account: 'dialogue-ui', token }, staticDir: resolve(process.env.TVO_PLAYABLE_BUNDLE ?? '.debug/orbit/visual-bundle') });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 },recordVideo:process.env.TVO_SCENE_VERIFY==='1'?{dir:join(root,'video'),size:{width:1280,height:800}}:undefined });

const done = new Promise<void>(resolveDone => {
  process.once('SIGINT', () => resolveDone());
  browser.once('disconnected', () => resolveDone());
});
try {
  await page.addInitScript('window.__name = (f) => f;');
  await server.open(); await server.listen(); await gateway.listen();
  await page.goto(gateway.issueLaunchUrl());
  await page.goto(`${gateway.url}/?autoplay=1&name=Traveler&view=orbit&hour=16&look=key:1.05,fill:1.35,exposure:1.20,fog:1.1`);
  await page.waitForFunction(() => (window as any).__tv?.ready === true, undefined, { timeout: 120000 });
  const playerId = await page.evaluate(() => (window as any).__tv.link.hello.playerId);
  const w = server.session.world, playerBody = w.primaryBody(playerId)!;
  const player=w.person(playerId)!;
  const originalAppearance=player.appearance.description;
  if(originalAppearance) {
    // Disclosed initial scene wardrobe, using existing canonical appearance tokens and kits.
    // Physiology, wealth and gameplay capabilities remain the ordinary player's.
    const description={...originalAppearance,garmentSilhouette:player.gender==='f'?'formal_kimono' as const:'hakama_set' as const,
      garmentPalette:'festival_crimson',hairColor:'honey' as const,hairStyle:'wavy_long' as const,
      accessories:['hair_ornament','ear_drops'],culturalTags:[...new Set([...originalAppearance.culturalTags,'festival_silk','blossom_motif'])],grooming:.85,wear:.08};
    player.appearance={...appearanceFromTraits(description),description,height:player.appearance.height,build:player.appearance.build};
    // Wait for canonical projection, then use the existing presentation reset to realise its tokens.
    await page.waitForFunction(()=>(window as any).__tv.own()?.appearance?.description?.garmentPalette==='festival_crimson');
    await page.evaluate(()=>(window as any).__tv.actors.clear());
    await page.waitForTimeout(500);
  }

  const place = [...w.entities.values()].filter((e:any)=>e.kind==='place' && e.indoor && e.door && e.inside)
    .sort((a:any,b:any)=>(a.type==='tavern'?0:1)-(b.type==='tavern'?0:1)||Math.hypot(a.door.x-playerBody.pos.x,a.door.z-playerBody.pos.z)-Math.hypot(b.door.x-playerBody.pos.x,b.door.z-playerBody.pos.z))[0] as any;
  if(!place) throw Error('Existing canonical interior unavailable');
  const doorway = {...place.door,x:place.door.x+.5,z:place.door.z+.5};
  const outward={x:place.door.x-place.inside.x,z:place.door.z-place.inside.z};
  const length=Math.hypot(outward.x,outward.z)||1;
  const starts=[3,4,2].map(distance=>({x:Math.floor(doorway.x+outward.x/length*distance)+.5,y:doorway.y,z:Math.floor(doorway.z+outward.z/length*distance)+.5}));
  const start=starts.find(pos=>w.nav.findPath(doorway,pos)?.length && [-.35,.35].every(x=>[-.35,.35].every(z=>[.1,1.1].every(y=>!w.grid.isSolidAt(pos.x+x,pos.y+y,pos.z+z)))))??doorway;
  let enemy = w.livingPersons().filter(p=>p.hostile && w.primaryBody(p.id)).sort((a,b)=>a.id.localeCompare(b.id))[0];
  let castFallback = false;
  // Scenario initial conditions only; no damage, events, cognition, collision or combat are scripted.
  const candidates=[];
  for(let dx=-12;dx<=12;dx++)for(let dz=-12;dz<=12;dz++) {
    const distance=Math.hypot(dx,dz);if(distance<8||distance>12)continue;
    const pos={...start,x:start.x+dx,z:start.z+dz};
    if(pos.x>=place.bounds.x0-1&&pos.x<=place.bounds.x1+2&&pos.z>=place.bounds.z0-1&&pos.z<=place.bounds.z1+2)continue;
    if(![-.35,.35].every(x=>[-.35,.35].every(z=>[.1,1.1].every(y=>!w.grid.isSolidAt(pos.x+x,pos.y+y,pos.z+z)))))continue;
    const route=w.nav.findPath(start,pos);if(route?.length)candidates.push({pos,route});
  }
  const ground=candidates.sort((a,b)=>a.route.length-b.route.length)[0];
  if(!ground)throw Error('No clear canonical outdoor combat ground');
  if(!enemy) {
    const cast = CAST.find(p=>p.key==='skarn')!;
    enemy=makePerson(w,{name:cast.name,gender:cast.gender,age:cast.age,occupation:cast.occupation,traits:cast.traits,appearance:cast.look,bio:'An outlaw encountered beside the settlement.',wealth:cast.wealth,hostile:cast.hostile,slug:'camera-scene-skarn'});
    seedStartingSkills(enemy);const body=makeBody(w,enemy.id,ground.pos,'humanoid',110);enemy.bodies.push(body.id);castFallback=true;
  }
  const enemyBody=w.primaryBody(enemy.id)!;
  playerBody.pos=start;enemyBody.pos=ground.pos;enemyBody.pose='stand';
  const initialHealth=playerBody.health;
  await page.waitForTimeout(2500);
  await page.evaluate((position)=>{const tv=(window as any).__tv;const p=tv.predictor.predicted.pos;tv.rig.yaw=Math.atan2(-(position.x-p.x),-(position.z-p.z));tv.rig.pitch=.62;tv.hud.toast('Tavern courtyard · F locks the nearby hostile · H / click strikes · Space dodges. Middle drag orbits.', 'info',12000);},ground.pos);
  console.log('Playable local courtyard ready. Canonical hostile actor and tavern staged in a disposable world. Close Chrome or press Ctrl+C to stop.');
  if (process.env.TVO_SCENE_VERIFY === '1') {
    const evidence=resolve(process.env.TVO_SCENE_EVIDENCE_DIR ?? 'docs/evidence/orbit-combat-scene');mkdirSync(evidence,{recursive:true});
    await page.waitForTimeout(3000);
    await page.screenshot({path:join(evidence,'06-playable-courtyard.png')});
    const rendering=await page.evaluate(enemyBodyId=>{const tv=(window as any).__tv;return {view:tv.settings.viewMode,playerBodyId:tv.snapshot.controlledBodyId,projectedWardrobe:tv.own()?.appearance?.description,playerMeshes:tv.actors.get(tv.snapshot.controlledBodyId)?.visual.root.getChildMeshes().map((m:any)=>m.name),playerActor:!!tv.actors.get(tv.snapshot.controlledBodyId),enemyActor:!!tv.actors.get(enemyBodyId),camera:{x:tv.camera.position.x,y:tv.camera.position.y,z:tv.camera.position.z},meshes:tv.ctx.scene.meshes.length,materials:tv.ctx.scene.materials.length,fps:tv.ctx.engine.getFps(),pendingBuilds:tv.regions.pendingBuilds};},enemyBody.id);
    writeFileSync(join(evidence,'playable-scene.json'),JSON.stringify({rendering,wardrobe:player.appearance.description,lighting: {key:1.05,fill:1.35,exposure:1.20,fog:1.1},initialHealth,playerHealth:playerBody.health,enemyAction:enemyBody.combatAction,castFallback,placeId:place.id,enemyId:enemy.id,enemyBodyId:enemyBody.id,start,combatGround:ground.pos,fixture:'Disposable initial placement of player and hostile actor outside an existing canonical interior; absent hostiles use the existing Skarn cast via ordinary canonical factories. Ordinary autonomous simulation continues. No human acceptance.'},null,2));
    if(!rendering.playerActor||!rendering.enemyActor||rendering.pendingBuilds||rendering.playerBodyId!==playerBody.id||rendering.projectedWardrobe?.garmentPalette!=='festival_crimson')throw Error('Scene actors or region not ready');
    await page.keyboard.press('f');await page.keyboard.press('h');await page.waitForTimeout(800);await page.keyboard.press('Space');await page.waitForTimeout(500);await page.keyboard.press('f');
    await page.mouse.wheel(0,-400);await page.waitForTimeout(800);
    await page.mouse.move(500,400);await page.mouse.down({button:'middle'});await page.mouse.move(1000,420,{steps:15});await page.mouse.up({button:'middle'});await page.waitForTimeout(700);
    await page.screenshot({path:join(evidence,'07-character-readability.png')});

  } else await done;
} finally {
  const videoPath=process.env.TVO_SCENE_VERIFY==='1'?await page.video()?.path():null;
  await browser.close();
  try {if(videoPath)copyFileSync(videoPath,join(resolve(process.env.TVO_SCENE_EVIDENCE_DIR ?? 'docs/evidence/orbit-combat-scene'),'scene-visual-playthrough.webm'));}
  finally {
  await gateway.close(); await server.stopInProcess('playable scene closed');
  const ownedRelative=relative(resolve(tmpdir()),resolve(root));
  if(!ownedRelative || ownedRelative.startsWith('..') || isAbsolute(ownedRelative))throw Error('Refusing cleanup outside owned temporary root');
  rmSync(root,{recursive:true,force:true});
  }
}
