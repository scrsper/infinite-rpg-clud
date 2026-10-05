/**
 * Ontology creator bodies in the Tower, end to end (dev server running):
 *   npx tsx scripts/web/tower-creator.ts [--name tower-creator]
 * A fresh, isolated browser context; storage persists across its reloads only.
 * A. Two creator-male actors with different identities at once: independent jaw morph and palettes, and disposal of one
 *    frees only its own cloned materials and morph managers (the source container and the other actor are untouched).
 * B. The female body reports "no authored appearance variants" instead of an imitation.
 * C. Body choice through the real Codex panel (K, then the Female button), then a real new climb (R, "New climb"
 *    card) draws the female creator body; a reload keeps the choice.
 * Writes .debug/arena/<name>/report.json and screenshots; exits non-zero on a failed check or page error.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const name = arg('name', 'tower-creator'), out = join(process.cwd(), '.debug/arena', name); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } }), page = await ctx.newPage();
const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
const checks: { step: string; ok: boolean; detail?: unknown }[] = [];
const check = (step: string, ok: boolean, detail?: unknown) => { checks.push({ step, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${ok ? '' : ' ' + JSON.stringify(detail)}`); };
const ready = () => page.waitForFunction(() => { const a = (window as any).__arena; return !!a?.tower?.plan && !a.hud.modalOpen; }, null, { timeout: 300_000 });
const report: Record<string, unknown> = {};
try {
  // ---- A/B: identities and ownership, on the Proving Hall (never persistent).
  await page.goto('http://127.0.0.1:5180/?arena=1&tower=1&hall=1&seed=918271&body=male');
  await page.waitForFunction(() => (window as any).__arena?.tower?.plan?.kind === 'hall', null, { timeout: 300_000 });
  const iso = await page.evaluate(() => {
    const a = (window as any).__arena, as = a.world.assets, sc = a.scene;
    const look = (inst: any) => {
      let jaw: number | null = null; const mats: Record<string, number[]> = {};
      for (const m of inst.meshes) {
        const mg = m.morphTargetManager; if (mg) for (let i = 0; i < mg.numTargets; i++) if (mg.getTarget(i).name === 'TV_JawWidth') jaw = mg.getTarget(i).influence;
        const list = m.material?.subMaterials ?? [m.material]; for (const x of list) if (x && /linen shirt|brown leather/.test(x.name)) mats[x.name.replace(/^.*\.(TV )/, '$1')] = [x.albedoColor.r, x.albedoColor.g, x.albedoColor.b];
      }
      return { jaw, mats };
    };
    const p = as.human('creator_male', 'qa-a'), q = as.human('creator_male', 'qa-b');
    const ap = as.applyCreatorAppearance(p, 'creator_male', { id: 'climber-a', appearanceSeed: 0 }), aq = as.applyCreatorAppearance(q, 'creator_male', { id: 'climber-b', appearanceSeed: 0 });
    const A = look(p), Bq = look(q);
    const ownedP = p.root.metadata.owned, ownedQ = q.root.metadata.owned;
    const srcMats = new Set(as.people.get('creator_male').materials), srcMorphs = new Set(as.people.get('creator_male').meshes.map((m: any) => m.morphTargetManager).filter(Boolean));
    const shareMat = [...ownedP.materials].some((m: any) => ownedQ.materials.has(m) || srcMats.has(m)), shareMorph = [...ownedP.morphs].some((m: any) => ownedQ.morphs.has(m) || srcMorphs.has(m));
    const pMats = [...ownedP.materials], pMorphs = [...ownedP.morphs];
    const before = { materials: sc.materials.length, morphs: sc.morphTargetManagers?.length ?? null };
    p.dispose();
    const after = { materials: sc.materials.length, morphs: sc.morphTargetManagers?.length ?? null };
    const freed = pMats.every((m: any) => !sc.materials.includes(m)), morphsFreed = pMorphs.every((m: any) => !(sc.morphTargetManagers ?? []).includes(m));
    // The source container (never added to the scene) stays usable: its textures keep their GPU data, its morph
    // managers keep their targets, and a fresh actor made after the disposal gets the jaw morph and textured clones.
    const qStill = look(q);
    const texLive = (m: any) => (m.getActiveTextures?.() ?? []).every((t: any) => !!t.getInternalTexture?.());
    const r = as.human('creator_male', 'qa-c'), rLook = look(r);
    const rTextured = r.meshes.some((m: any) => (m.material?.getActiveTextures?.() ?? []).some((t: any) => !!t.getInternalTexture?.()));
    const srcIntact = { textures: [...srcMats].every(texLive), morphs: [...srcMorphs].every((g: any) => g.numTargets > 0), freshActor: rLook.jaw !== null && rTextured };
    r.dispose();
    const fem = as.human('creator_female', 'qa-f'), af = as.applyCreatorAppearance(fem, 'creator_female', { id: 'climber-a', appearanceSeed: 0 });
    q.dispose(); fem.dispose();
    return { applied: { a: ap, b: aq, female: af }, A, B: Bq, shareMat, shareMorph, owned: { materials: pMats.length, morphs: pMorphs.length }, before, after, freed, morphsFreed, qAfterPDisposed: qStill, srcIntact };
  });
  report.isolation = iso;
  check('A1 two creator identities get different jaw and palettes', iso.A.jaw !== null && iso.A.jaw !== iso.B.jaw && JSON.stringify(iso.A.mats) !== JSON.stringify(iso.B.mats), iso);
  check('A2 each actor owns its materials and morph managers (none shared with the other or the source)', !iso.shareMat && !iso.shareMorph && iso.owned.materials > 0 && iso.owned.morphs > 0, iso.owned);
  check('A3 disposing one actor frees only its owned objects; the other keeps its appearance', iso.freed && iso.morphsFreed && JSON.stringify(iso.qAfterPDisposed) === JSON.stringify(iso.B) && iso.srcIntact.textures && iso.srcIntact.morphs && iso.srcIntact.freshActor, { before: iso.before, after: iso.after, srcIntact: iso.srcIntact });
  check('B1 the female body reports no authored variants and gets nothing applied', iso.applied.female.length === 1 && /unsupported/.test(iso.applied.female[0]), iso.applied.female);
  // ---- C: real menu choice, then a real new climb.
  await page.goto('http://127.0.0.1:5180/?arena=1&tower=1&seed=918271');
  await ready();
  const bodyNow = () => page.evaluate(() => { const w = (window as any).__arena.world; return { look: w.hero.inst.root.metadata?.look, heroBody: w.heroBody, meshes: w.hero.inst.meshes.slice(0, 3).map((m: any) => m.name) }; });
  const first = await bodyNow();
  check('C1 default climb draws the creator male body', first.look === 'creator_male' && first.heroBody?.drawn === 'creator_male', first);
  await page.mouse.click(550, 200); await page.keyboard.press('KeyK');
  await page.waitForSelector('[data-body="female"]', { timeout: 10_000 });
  await page.screenshot({ path: join(out, 'codex-body-choice.png') });
  await page.locator('[data-body="female"]').click();
  const still = await bodyNow();
  check('C2 the choice is deferred: the current hero keeps its body', still.look === 'creator_male', still);
  await page.locator('#codex-close').click();
  await page.keyboard.press('KeyR');
  await page.waitForSelector('.ar-modal.on .ar-card', { timeout: 30_000 });
  await page.locator('.ar-modal.on .ar-card').nth(1).click();   // "New climb"
  await ready(); await page.waitForTimeout(500);
  const next = await bodyNow();
  check('C3 the next climb draws the chosen creator female body', next.look === 'creator_female' && next.heroBody?.drawn === 'creator_female', next);
  await page.screenshot({ path: join(out, 'new-climb-female.png') });
  await page.reload(); await page.waitForFunction(() => !!(window as any).__arena?.tower, null, { timeout: 300_000 });
  if (await page.locator('.ar-modal.on .ar-card').count()) await page.locator('.ar-modal.on .ar-card').first().click();
  await ready();
  const reloaded = await bodyNow();
  check('C4 a reload keeps the chosen body', reloaded.look === 'creator_female', reloaded);
} catch (e) {
  await page.screenshot({ path: join(out, 'fail-aborted.png') }).catch(() => undefined);
  check('harness completed every step', false, String((e as Error).message));
}
report.checks = checks; report.errors = errors;
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
await ctx.close().catch(() => undefined); await browser.close().catch(() => undefined);
console.log(`tower creator -> ${out} (${checks.filter(c => c.ok).length}/${checks.length} checks, ${errors.length} page errors)`);
process.exit(checks.every(c => c.ok) && !errors.length ? 0 : 1);
