import {
  Color3, Color4, DirectionalLight, Matrix, DynamicTexture, FreeCamera, HemisphericLight, MeshBuilder, StandardMaterial, Vector3, type Scene,
} from '@babylonjs/core';
import { attachPipeline, createRenderer } from '../render/engine';
import { ArenaAssets } from './assets';
import { ArenaHud } from './hud';
import { BlobShadows } from './fx';
import { LOOK_IDS } from './looks';
import { strikeWindow } from './retarget';
import { usedClips } from './combat';
import { ArenaAudio } from './sfx';
import { ARENA, ArenaWorld, setArenaHalf, type HeroInput } from './world';
import { TowerRun } from './tower/tower';
import { ARSENAL_KEYS } from './tower/items';
import { loadCodex } from './tower/capability';
import type { Theme } from './tower/floorgen';
import type { WeaponId } from './combat';

/**
 * Combat Arena entry (`?arena=1`). A self-contained action-combat feel lab in the Babylon client:
 * no gateway, no canonical World. Reference: the user's combat-gym videos (top-down melee against
 * crowds, smashable furniture, combo meter, companions, level-up rewards).
 */
const TOWER_HELP = `<span class="x">✕</span><b>Tower of Chrysanthus</b><br>
  Clear each floor, then walk through the door at the far wall.<br>
  <b>WASD</b> move · <b>Shift</b> sprint · <b>Mouse</b> aim · <b>MMB drag</b> orbit · <b>Wheel</b> zoom<br><b>LMB</b> light (chain) · <b>RMB</b> heavy (hold to charge) · <b>F</b> guard/parry<br>
  <b>Space</b> dodge or roll · <b>Tab</b> weapon · <b>1-4</b> signs (learned from tomes) · <b>Q</b> flask<br><b>E</b> use a god's shrine · <b>K</b> Codex of classes<br>
  Loot drops from foes and chests: walk over it.<br>Every 5th floor a boss, every 10th a god.<br><b>R</b> new climb · <b>P</b> pause · <b>H</b> this help`;

export async function startArena(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  const params = new URLSearchParams(location.search);
  const boot = document.createElement('div');
  boot.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;color:#e9dcc0;font:600 18px "Segoe UI",sans-serif;background:#0b0d12;z-index:50';
  boot.textContent = 'Building the Combat Gym…'; document.body.append(boot);

  const ctx = await createRenderer(canvas, { prefer: params.get('renderer') === 'webgpu' ? 'webgpu' : 'webgl2', quality: (params.get('quality') as 'high' | 'balanced' | 'low') ?? 'high' });
  const scene = ctx.scene;
  scene.clearColor = new Color4(.06, .07, .09, 1);
  scene.environmentIntensity = .35;   // low ambient so the faceted low-poly forms read
  const camera = new FreeCamera('arena-cam', new Vector3(0, 20, 16), scene);
  camera.fov = .72; camera.minZ = .5; camera.maxZ = 260; camera.inputs.clear();
  const pipeline = attachPipeline(ctx, camera);
  pipeline.imageProcessing.vignetteWeight = 1.1; pipeline.imageProcessing.exposure = 1.0; pipeline.bloomThreshold = .82; pipeline.bloomWeight = .22;

  const stage = buildStage(scene);
  const { shadow } = stage;
  const towerMode = params.has('tower');
  const assets = new ArenaAssets(scene);
  // The KayKit rig is only the animation source; every fighter is a Torn Veil human.
  const progress = (t: string) => { boot.textContent = t + '…'; };
  await assets.load(['skeleton_warrior'], progress);
  if (!params.has('allclips')) assets.used = usedClips();
  await assets.loadHumans([...LOOK_IDS], progress);
  progress('Unpacking the arsenal');
  await assets.loadArsenal([...new Set(['oathbreaker', 'widow-cleaver', 'raven-mechanism', 'serpent-tooth', 'bell-of-ruin', 'elderroot', 'execution-standard', 'briar-whisper', 'ashwood-sentinel', ...ARSENAL_KEYS])]);

  const hud = new ArenaHud();
  const audio = new ArenaAudio();
  const levels: number[] = [];
  let heroDown = false;
  const world = new ArenaWorld(scene, assets, shadow, {
    damage: (p, n, kind) => hud.number(p, n, kind),
    kill: f => tower?.onKill(f),
    levelUp: l => { levels.push(l); audio.play('level'); },
    wave: (n, count) => hud.announce(`WAVE ${n}`, `${count} raiders attack`),
    heroDown: () => { if (tower) tower.onHeroDown(); else heroDown = true; },
    sound: (k, g) => audio.play(k, g),
  });
  let seed = Number(params.get('seed') ?? 918271) || 918271;
  world.reset(seed);
  let tower: TowerRun | null = null;
  if (towerMode) { tower = new TowerRun(scene, world, hud, assets, stage, seed); tower.startFloor = Math.max(1, Math.min(100, Number(params.get('floor') ?? 1) || 1)); hud.tower = tower as never; tower.start(); }
  document.title = towerMode ? 'Tower of Chrysanthus' : document.title;
  // Classic isometric framing (~35 deg elevation), orbitable with the middle mouse button.
  let zoom = 15, paused = false, camYaw = Math.PI * .25, camPitch = .64, orbiting = false;
  // Automation hooks (scripts/web/arena-play.ts): read-only views plus a projector for aiming real mouse input.
  (window as unknown as { __arena: unknown }).__arena = {
    world, hud, scene, camera, get tower() { return tower; },
    screen: (x: number, y: number, z: number) => {
      const e = scene.getEngine(), v = Vector3.Project(new Vector3(x, y, z), Matrix.IdentityReadOnly, scene.getTransformMatrix(), camera.viewport.toGlobal(e.getRenderWidth(), e.getRenderHeight()));
      return { x: v.x * canvas.clientWidth / e.getRenderWidth(), y: v.y * canvas.clientHeight / e.getRenderHeight() };
    },
    /** Pose review: freeze the game and hold the hero at a fraction of a clip. */
    pose: (clip: string, frac: number, yaw = 0) => {
      paused = true; const h = world.hero; h.anim.stopAll(); h.yaw = yaw; h.inst.root.rotation.y = yaw;
      const g = h.inst.anims.get(clip); if (!g) return false;
      g.start(false, 1, g.from, g.to); g.setWeightForAllAnimatables(1); g.goToFrame(g.from + frac * (g.to - g.from)); g.pause(); return true;
    },
    zoom: (z: number) => { zoom = z; },
    clipInfo: () => [...assets.clips.values()].map(c => ({ name: c.name, dur: +(c.frames / c.fps).toFixed(2), win: strikeWindow(c).map(v => +v.toFixed(2)), peak: +Math.max(...c.swing).toFixed(1) })),
    view: (pitch: number, yaw: number) => { camPitch = pitch; camYaw = yaw; },
    summary: () => ({ time: world.time, wave: world.wave, kills: world.kills, smashed: world.smashed, level: world.level, combo: world.combo.hits, hp: world.hero.hp, heroState: world.hero.state,
      foes: world.fighters.filter(f => f.role === 'foe' && f.alive).map(f => ({ x: f.pos.x, z: f.pos.z, state: f.state, kind: f.foeKind })), hero: { x: world.hero.pos.x, z: world.hero.pos.z },
      debris: world.debris.count, props: world.props.filter(p => !p.broken && !p.loose).map(p => ({ x: p.pos.x, z: p.pos.z, key: p.key })) }),
  };

  // ---- input
  const keys = new Set<string>(); const pressed = new Set<string>();
  let lmb = false, rmb = false, lmbPressed = false;
  window.addEventListener('keydown', e => { if (hud.modalOpen) return; if (!keys.has(e.code)) pressed.add(e.code); keys.add(e.code); if (['Space', 'Tab'].includes(e.code)) e.preventDefault(); });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); lmb = rmb = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  let rmbPressed = false, rmbReleased = false;
  canvas.addEventListener('pointerdown', e => { audio.unlock(); canvas.focus(); if (e.button === 0) { lmb = true; lmbPressed = true; } if (e.button === 2) { rmb = true; rmbPressed = true; } if (e.button === 1) { orbiting = true; e.preventDefault(); } });
  window.addEventListener('pointerup', e => { if (e.button === 0) lmb = false; if (e.button === 2) { rmb = false; rmbReleased = true; } if (e.button === 1) orbiting = false; });
  window.addEventListener('pointermove', e => { if (!orbiting) return; camYaw -= e.movementX * .006; camPitch = Math.max(.32, Math.min(1.25, camPitch + e.movementY * .004)); });
  canvas.addEventListener('auxclick', e => e.preventDefault());
  window.addEventListener('keydown', () => audio.unlock(), { once: true });
  canvas.addEventListener('wheel', e => { zoom = Math.max(7, Math.min(32, zoom + Math.sign(e.deltaY) * 1.2)); e.preventDefault(); }, { passive: false });

  const camFocus = new Vector3();
  let padWeapon = 0, padPrev: boolean[] = [];

  const readInput = (): HeroInput => {
    const fwd = new Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw)), right = new Vector3(-fwd.z, 0, fwd.x);
    let mx = 0, mz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) { mx += fwd.x; mz += fwd.z; }
    if (keys.has('KeyS') || keys.has('ArrowDown')) { mx -= fwd.x; mz -= fwd.z; }
    // `right` is screen-right for this right-handed camera (forward x up).
    if (keys.has('KeyD') || keys.has('ArrowRight')) { mx += right.x; mz += right.z; }
    if (keys.has('KeyA') || keys.has('ArrowLeft')) { mx -= right.x; mz -= right.z; }
    // Mouse aim on the floor plane.
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const t = ray.direction.y < -1e-3 ? -ray.origin.y / ray.direction.y : 30;
    const aim = ray.origin.add(ray.direction.scale(t));
    let attack = lmb, attackPressed = lmbPressed, secondary = rmb, dodge = pressed.has('Space');
    let heavyPressed = rmbPressed, heavyReleased = rmbReleased; rmbPressed = rmbReleased = false;
    const cast = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].findIndex(k => pressed.has(k));
    let sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    // Diablo-style: 1-4 are skills; Tab cycles drawn weapons (F1-F4 pick one directly).
    let weapon: WeaponId | null = pressed.has('F1') ? 'fists' : pressed.has('F2') ? 'greatsword' : pressed.has('F3') ? 'axe' : pressed.has('F4') ? 'bow' : null;
    const cycle = pressed.has('Tab');
    const pad = navigator.getGamepads?.().find(p => p);
    if (pad) {
      const dz = (v: number) => Math.abs(v) < .18 ? 0 : v;
      const lx = dz(pad.axes[0]), ly = dz(pad.axes[1]), rx = dz(pad.axes[2]), ry = dz(pad.axes[3]);
      mx += -fwd.x * ly + right.x * lx; mz += -fwd.z * ly + right.z * lx;
      const b = pad.buttons.map(x => x.pressed), edge = (i: number) => b[i] && !padPrev[i];
      sprint ||= !!b[10];
      if (rx || ry) aim.copyFrom(world.hero.pos.add(fwd.scale(-ry * 6)).add(right.scale(rx * 6)));
      else if (lx || ly) aim.copyFrom(world.hero.pos.add(new Vector3(mx, 0, mz).normalize().scale(5)));
      attack ||= b[2] || b[7]; attackPressed ||= edge(2) || edge(7); secondary ||= b[6] || b[3]; dodge ||= edge(0) || edge(1);
      if (edge(4) || edge(5)) { padWeapon = (padWeapon + (edge(5) ? 1 : 3)) % 4; weapon = (['fists', 'greatsword', 'axe', 'bow'] as WeaponId[])[padWeapon]; }
      if (edge(9)) paused = !paused;
      padPrev = b;
    }
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    lmbPressed = false;
    return { move: { x: mx, z: mz }, aim, attack, attackPressed, secondary, heavyPressed, heavyReleased, cast, guard: keys.has('KeyF'), flask: pressed.has('KeyQ'), cycle, sprint, dodgePressed: dodge, interact: keys.has('KeyE'), weapon };
  };

  const rebuild = () => { if (tower) { hud.closeModal(); levels.length = 0; tower.start(); return; } hud.closeModal(); heroDown = false; levels.length = 0; world.reset(++seed); hud.announce('COMBAT GYM', 'rebuilt · seed ' + seed); };

  // ---- loop
  boot.remove(); ui.style.pointerEvents = 'none';
  if (!tower) hud.announce('COMBAT GYM', 'Sandbox · N spawns enemies · H for controls');
  else hud.setHelp(TOWER_HELP);
  let shakeT = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 1 / 20);
    if (pressed.has('KeyR')) rebuild();
    if (pressed.has('KeyP') || pressed.has('Escape')) paused = !paused;
    if (pressed.has('KeyH')) hud.toggleHelp();
    if (pressed.has('KeyL')) world.showLabels = !world.showLabels;
    if (pressed.has('KeyC') && !tower) { world.setCompanions(!world.companions); hud.announce(world.companions ? 'COMPANIONS JOIN' : 'FIGHTING ALONE'); }
    if (pressed.has('KeyN') && !tower) world.spawnNow();
    if (pressed.has('KeyK')) hud.toggleCodex(loadCodex());
    if (pressed.has('KeyM')) { world.autoWaves = !world.autoWaves; hud.announce(world.autoWaves ? 'WAVES ON' : 'SANDBOX', world.autoWaves ? 'enemies keep coming' : 'press N to spawn enemies'); }
    const input = readInput();
    pressed.clear();
    if (!paused && !hud.modalOpen) { world.step(dt, input); tower?.update(dt, input.interact); }
    else scene.animationTimeScale = 0;
    if (!hud.modalOpen && levels.length) {
      const l = levels.shift()!;
      void hud.chooseUpgrade(l, '+ attack, + health').then(u => { u.apply(world); hud.announce(u.name.toUpperCase()); });
    }
    if (heroDown && !hud.modalOpen) {
      heroDown = false;
      setTimeout(() => hud.message('You fell', `Wave ${world.wave} · ${world.kills} kills · ${world.smashed} smashed`, 'Get up and keep fighting', () => world.respawnHero()), 900);
    }
    // Camera: fixed high three-quarter view that follows the hero, like the reference.
    const h = world.hero.pos;
    const la = Math.min(3, Math.hypot(input.aim.x - h.x, input.aim.z - h.z) * .12), ld = Math.atan2(input.aim.x - h.x, input.aim.z - h.z);
    const fx = h.x + Math.sin(ld) * la, fz = h.z + Math.cos(ld) * la;
    camFocus.x += (fx - camFocus.x) * Math.min(1, dt * 5); camFocus.z += (fz - camFocus.z) * Math.min(1, dt * 5); camFocus.y = 1.1;
    shakeT += dt * 60;
    const s = world.fx.shake * world.fx.shake * .9;
    const off = new Vector3(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch)).scale(zoom);
    camera.position.set(camFocus.x + off.x + Math.sin(shakeT * 1.7) * s, camFocus.y + off.y + Math.sin(shakeT * 2.3) * s, camFocus.z + off.z + Math.cos(shakeT * 1.9) * s);
    camera.setTarget(camFocus);
    hud.update(dt, world, scene, camera);
  });
  scene.onAfterAnimationsObservable.add(() => world.solveGrips(Math.min(scene.getEngine().getDeltaTime() / 1000, .05)));
  ctx.engine.runRenderLoop(() => scene.render());
}

function buildStage(scene: Scene): { shadow: BlobShadows; key: DirectionalLight; setFloor: (half: number, theme: Theme | null, floor: number) => void } {
  const hemi = new HemisphericLight('arena-fill', new Vector3(.2, 1, .1), scene);
  hemi.intensity = .5; hemi.groundColor = new Color3(.38, .38, .42); hemi.specular = Color3.Black();
  const key = new DirectionalLight('arena-key', new Vector3(-.55, -1, -.35), scene);
  key.intensity = 2.6;
  const shadow = new BlobShadows(scene);
  let parts: { dispose(): void }[] = [];
  const wallMat = new StandardMaterial('gym-wall', scene); wallMat.specularColor = Color3.Black();

  /** Build (or rebuild) the floor slab, grid, lettering and perimeter for a given size and tier theme. */
  const setFloor = (half: number, theme: Theme | null, floor: number) => {
    for (const p of parts) p.dispose(); parts = [];
    setArenaHalf(half);
    const size = half * 2 + 8;
    const tex = new DynamicTexture('gym-floor', { width: 2048, height: 2048 }, scene, true);
    const c = tex.getContext() as CanvasRenderingContext2D;
    c.fillStyle = theme?.floor ?? '#cfd1d4'; c.fillRect(0, 0, 2048, 2048);
    c.strokeStyle = theme?.line ?? '#c3c6ca'; c.lineWidth = 3;
    const cell = 2048 / (size / 2);
    for (let i = 0; i <= 2048; i += cell) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 2048); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(2048, i); c.stroke(); }
    c.lineWidth = 6; c.globalAlpha = .8;
    for (let i = 0; i <= 2048; i += cell * 5) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 2048); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(2048, i); c.stroke(); }
    tex.update(); tex.anisotropicFilteringLevel = 8;
    const mat = new StandardMaterial('gym-floor', scene); mat.diffuseTexture = tex; mat.specularColor = new Color3(.05, .05, .05);
    const slab = MeshBuilder.CreateGround('gym-floor', { width: size, height: size }, scene); slab.material = mat; slab.isPickable = false;
    parts.push(slab, mat, tex);
    const label = (text: string, x: number, z: number, w: number, yaw: number, color = '#25282d') => {
      const t = new DynamicTexture('label', { width: 2048, height: 256 }, scene, true);
      t.hasAlpha = true; const g = t.getContext() as CanvasRenderingContext2D; g.clearRect(0, 0, 2048, 256);
      g.fillStyle = color; g.font = '900 200px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 1024, 136); t.update(); t.uScale = -1; t.uOffset = 1;
      const m = new StandardMaterial('label', scene); m.diffuseTexture = t; m.useAlphaFromDiffuseTexture = true; m.specularColor = Color3.Black(); m.zOffset = -2;
      const p = MeshBuilder.CreateGround('label', { width: w, height: w / 8 }, scene);
      p.position.set(x, .015, z); p.rotation.y = yaw; p.material = m; p.isPickable = false; parts.push(p, m, t);
    };
    if (theme) { label(`Floor ${floor}`, 0, half - 9, 14, Math.PI, '#00000055'); label(theme.name, 0, half - 12, 18, Math.PI, '#00000033'); }
    else { label('Combat Gym', -2, 4, 26, Math.PI * .25 + Math.PI); label('Combat Gym', 16, -6, 18, Math.PI * .75, '#2c3036'); label('[Prototype]', -18, -2, 12, Math.PI * 1.5, '#9aa0a8'); }
    wallMat.diffuseColor = theme ? new Color3(...theme.wall) : new Color3(.93, .94, .95);
    const wall = (x: number, z: number, w: number, d: number, h = theme ? 1.2 : .8) => {
      const b = MeshBuilder.CreateBox('wall', { width: w, depth: d, height: h }, scene);
      b.position.set(x, h / 2, z); b.material = wallMat; b.isPickable = false; parts.push(b);
    };
    const e = half + 2.5;
    wall(0, -e, e * 2 + 3, 3); wall(0, e, e * 2 + 3, 3); wall(-e, 0, 3, e * 2 + 3); wall(e, 0, 3, e * 2 + 3);
    if (theme) { key.diffuse = new Color3(...theme.light); }
  };
  setFloor(ARENA, null, 0);
  return { shadow, key, setFloor };
}
