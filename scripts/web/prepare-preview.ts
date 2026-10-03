/** First-launch initial conditions for the isolated human-play candidate, never a live migration. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BridgeSession } from '../../src/bridge/session';
import { AccountRegistry } from '../../src/server/accounts';
import { loadConfig, loadRelease } from '../../src/server/config';
import { WorldStore, WriterLock } from '../../src/server/store';
import { GENERATOR_VERSION, playableBaselineFingerprint } from '../../src/server/fingerprint';
import { SAVE_VERSION } from '../../src/sim/persist/save';
import { makeItem } from '../../src/sim/world/factory';
import { createAnimal } from '../../src/sim/ecology/animals';

// No arbitrary root argument: this command cannot select a live/staging directory or old preview.
const root = join(homedir(), 'TornVeilAlpha', 'web-quality');
const profileDir = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'TornVeil', 'Client');
const profile = join(profileDir, 'web-quality.json');
const cfgPath = join(root, 'config.json');
if (existsSync(cfgPath)) {
  const existing = loadConfig(cfgPath);
  if (existing.root !== root || existing.env !== 'dev' || existing.port !== 7490 || !existing.webGateway)
    throw Error('The isolated preview identity differs. Refusing to change or replace it.');
  if (!existsSync(profile) || !new WorldStore(existing.stateDir).identity()) throw Error('Incomplete preview setup; existing files preserved for diagnosis.');
  console.log('Existing isolated playtest preserved.');
} else {
  if (existsSync(profile)) throw Error('Preview profile already exists without its world; refusing to replace the credential.');
  mkdirSync(root, { recursive: true }); mkdirSync(profileDir, { recursive: true });
  writeFileSync(cfgPath, JSON.stringify({ env: 'dev', root, port: 7490, bind: ['127.0.0.1'], seed: 918271,
    webGateway: true, createWorldIfMissing: false, checkpointSeconds: 60, disconnectGraceSeconds: 120 }, null, 2), { flag: 'wx' });
  const cfg = loadConfig(cfgPath);
  mkdirSync(cfg.credentialsDir, { recursive: true }); mkdirSync(cfg.stateDir, { recursive: true });
  writeFileSync(join(cfg.credentialsDir, 'admin.token'), randomBytes(32).toString('base64url'), { flag: 'wx' });
  const account = 'jacob-preview';
  const token = new AccountRegistry(join(cfg.credentialsDir, 'accounts.json')).add(account, 'Isolated playtest');
  const session = new BridgeSession(cfg.seed, { playable: true, defaultPlayer: false });
  const player = session.createCharacter(`acct:${account}`, 'Aria', { gender: 'f', age: 25, look: {
    presentation: 'feminine', skinTone: 'porcelain', faceShape: 'heart', hairStyle: 'loose_long', hairColor: 'silver',
    eyeColor: 'blue', stature: 'average', frame: 'lean', garmentSilhouette: 'layered_kimono', garmentPalette: 'snow_moon',
    accessories: ['hair_ornament', 'ear_drops'], culturalTags: ['ashford', 'snow_moon'], grooming: .95, wear: .08,
  } });
  // Declared starting possessions, made through the ordinary item factory. No periodic grants.
  for (const [type, name, quantity] of [['sword', 'Traveler’s sword', 1], ['bread', 'Travel bread', 2], ['lantern', 'Travel lantern', 1]] as const)
    makeItem(session.world, type, name, { holder: player, owner: player, quantity });
  const spawn = session.world.primaryBody(player)!.pos;
  let boar: string | null = null;
  // An ordinary mature woodland boar beside the settlement's outskirts, using its real controller.
  for (let i = 0; i < 96; i++) {
    const a = i*.618, x = Math.floor(spawn.x+Math.cos(a)*55)+.5, z = Math.floor(spawn.z+Math.sin(a)*55)+.5;
    const y = session.world.nav.floorY(Math.floor(x), Math.floor(z));
    if (y < 0 || session.world.nav.walkCost(Math.floor(x),Math.floor(z)) >= 3 || session.world.nearbyPhysicalBodies({x,y,z},12).length) continue;
    boar = createAnimal(session.world, 'woodland_boar', {x,y,z}, {ageDays: 900}).id; break;
  }
  const release = loadRelease(process.argv[1]);
  const generator = { kind: 'playable' as const, seed: cfg.seed, version: GENERATOR_VERSION, fingerprint: playableBaselineFingerprint(cfg.seed) };
  const worldId = `tvo-dev-${randomUUID()}`, store = new WorldStore(cfg.stateDir);
  const fence = new WriterLock(cfg.stateDir, { release: release.version, env: 'dev' }); fence.acquire();
  try {
    store.createIdentity({ format: 1, worldId, env: 'dev', createdAtIso: new Date().toISOString(), generator, createdByRelease: release.version });
    await store.commit(session.save(), { worldId, savedAtIso: new Date().toISOString(), reason: 'isolated player-experience initial conditions',
      physicalTime: session.world.physicalTime, worldNow: session.world.now, saveSchema: SAVE_VERSION, generator,
      release: { version: release.version, revision: release.revision }, ownership: { [account]: [player] } }, fence);
  } finally { fence.release(); }
  writeFileSync(profile, JSON.stringify({ server: '127.0.0.1:7490', account, token }, null, 2), { flag: 'wx' });
  writeFileSync(join(root, 'initial-conditions.json'), JSON.stringify({ version: 1, worldId, seed: cfg.seed, player, spawn,
    boar, startingItems: ['sword ×1', 'bread ×2', 'lantern ×1'], wealth: session.world.person(player)!.wealth,
    population: session.world.livingPersons().length, weather: session.world.weather, source: release,
    rules: 'Ordinary canonical factories and mechanics. No scripts keep residents outdoors, resources replenished or the creature nearby.' }, null, 2));
  console.log('Created isolated web-quality world and private client profile; no live/staging files opened.');
}
