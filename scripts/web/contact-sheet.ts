import { chromium } from 'playwright';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Tile a folder of PNGs into one labelled contact sheet:  tsx scripts/web/contact-sheet.ts <dir> <out.png> [--match regex] [--cols 6] [--w 300] */
const argv = process.argv.slice(2);
const dir = resolve(argv[0]), out = resolve(argv[1]);
const flag = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const match = new RegExp(flag('match', '\.png$')), cols = Number(flag('cols', '6')), w = Number(flag('w', '300'));
const files = readdirSync(dir).filter(f => match.test(f)).sort();
mkdirSync(dirname(out), { recursive: true });
const html = `<body style="margin:0;background:#161a22;color:#ddd;font:12px sans-serif"><div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:4px;padding:4px">${files.map(f => `<figure style="margin:0"><img src="${pathToFileURL(join(dir, f)).href}" style="width:${w}px;display:block"><figcaption>${basename(f, '.png')}</figcaption></figure>`).join('')}</div></body>`;
const tmp = join(dirname(out), '_sheet.html'); writeFileSync(tmp, html);
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: cols * (w + 4) + 8, height: 800 } });
await p.goto(pathToFileURL(tmp).href); await p.waitForLoadState('load'); await p.waitForTimeout(500);
await p.screenshot({ path: out, fullPage: true }); await b.close();
console.log(JSON.stringify({ out, files: files.length }));
