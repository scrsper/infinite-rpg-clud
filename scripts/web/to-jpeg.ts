import { chromium } from 'playwright';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

/**
 * Re-encode screenshots as JPEG (quality 86) at their native size, so evidence images committed to the repository
 * stay small. Headless Chrome decodes the PNG and re-encodes it; nothing is resized, cropped or retouched.
 *
 *   tsx scripts/web/to-jpeg.ts <outDir> <in.png> [<in.png> ...]      (an input may be  path=newname  to rename)
 */
const [outArg, ...inputs] = process.argv.slice(2);
if (!outArg || !inputs.length) throw new Error('usage: to-jpeg.ts <outDir> <in.png>...');
const out = resolve(outArg); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
let before = 0, after = 0;
for (const spec of inputs) {
  const [path, rename] = spec.split('=');
  const png = readFileSync(resolve(path)); before += png.length;
  const b64 = png.toString('base64');
  const size = await page.evaluate(async (data: string) => {
    const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
    document.body.style.margin = '0'; document.body.replaceChildren(img); img.style.display = 'block';
    return { w: img.naturalWidth, h: img.naturalHeight };
  }, b64);
  await page.setViewportSize({ width: size.w, height: size.h });
  const jpg = await page.screenshot({ type: 'jpeg', quality: 86 }); after += jpg.length;
  const name = (rename ?? basename(path).replace(/\.png$/i, '')) + '.jpg';
  writeFileSync(join(out, name), jpg);
  void statSync;
}
console.log(JSON.stringify({ files: inputs.length, pngKB: Math.round(before / 1024), jpgKB: Math.round(after / 1024) }));
await browser.close();
