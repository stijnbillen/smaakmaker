// Generates the app icons (chef's hat, cream on tomato) from one hand-drawn shape definition.
// Needs the Playwright browser: run `npx playwright install chromium` once, then `node scripts/make-icons.mjs`.
// Colours come from src/styles/tokens.css so there is no second source; the hex values in the
// generated files are output only. Re-run this script after changing --color-bg or --color-accent.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = 'public/icons';

// --- Tokens -----------------------------------------------------------------
const css = readFileSync('src/styles/tokens.css', 'utf8');
const raw = Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
function token(name, depth = 0) {
  const v = raw[name];
  if (v === undefined || depth > 10) throw new Error(`token ${name} not found`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? token(ref[1], depth + 1) : v;
}
const HAT = token('--color-bg');
const BACKGROUND = token('--color-accent');

// --- Drawing (512 grid, hat spans x 96..416, y 55..430, vertical centre 243) --
const hat = `
    <circle cx="176" cy="190" r="80" fill="${HAT}"/>
    <circle cx="336" cy="190" r="80" fill="${HAT}"/>
    <circle cx="256" cy="150" r="95" fill="${HAT}"/>
    <rect x="150" y="190" width="212" height="160" fill="${HAT}"/>
    <rect x="150" y="360" width="212" height="70" rx="18" fill="${HAT}"/>
    <rect x="218" y="250" width="10" height="90" rx="5" fill="${BACKGROUND}"/>
    <rect x="284" y="250" width="10" height="90" rx="5" fill="${BACKGROUND}"/>`;

// Scale around the centre; the hat's vertical middle (243) lands on 256 so (256,256) is hat body.
function svg(scale) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <title>Smaakmaker</title>
  <rect width="512" height="512" fill="${BACKGROUND}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -243)">${hat}
  </g>
</svg>
`;
}

const SCALE = {
  normal: 1.1, // about 70% of the width
  maskable: 0.82, // whole hat inside the 0.4 x width safe circle, with margin for anti-aliasing
  favicon: 1.2, // bigger so at least 20% of a 32 px icon is hat
};

const targets = [
  { file: 'icon-192.png', size: 192, scale: SCALE.normal },
  { file: 'icon-512.png', size: 512, scale: SCALE.normal },
  { file: 'icon-maskable-512.png', size: 512, scale: SCALE.maskable },
  { file: 'apple-touch-icon.png', size: 180, scale: SCALE.normal },
  { file: 'favicon-32.png', size: 32, scale: SCALE.favicon },
];

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/icon.svg`, svg(SCALE.normal));

const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
try {
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;overflow:hidden">${svg(t.scale)}</body></html>`,
    );
    await page.screenshot({ path: `${OUT}/${t.file}`, type: 'png' });
    await page.close();
  }
} finally {
  await browser.close();
}
