import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseColor } from '../helpers/color';
import { readTokens } from '../helpers/color';
import { decodePng, pixelAt, readPngSize, solidPng, type Png } from '../helpers/png';

// T-026 / R-025: chef's hat app icon.
const tokens = readTokens();
const HAT = tokens['--color-bg']; // cream
const BACKGROUND = tokens['--color-accent']; // tomato red
const TOLERANCE = 8;

const ICON_DIR = 'public/icons';
const PNGS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-32.png', size: 32 },
];

function near(px: [number, number, number, number], color: string): boolean {
  const c = parseColor(color);
  return (
    px[3] === 255 &&
    Math.abs(px[0] - c.r) <= TOLERANCE &&
    Math.abs(px[1] - c.g) <= TOLERANCE &&
    Math.abs(px[2] - c.b) <= TOLERANCE
  );
}

function hatShare(png: Png): number {
  let n = 0;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) if (near(pixelAt(png, x, y), HAT)) n++;
  return n / (png.width * png.height);
}

describe('icon.svg (R-025 crit. 1)', () => {
  const path = join(ICON_DIR, 'icon.svg');
  it('exists in the repo with a 512 viewBox', () => {
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toMatch(/viewBox=["']0 0 512 512["']/);
  });

  it('contains only flat shapes: no text, images, gradients, filters or external references', () => {
    const svg = readFileSync(path, 'utf8');
    const allowed = new Set(['svg', 'rect', 'circle', 'ellipse', 'path', 'g', 'title', 'desc']);
    const tags = [...svg.matchAll(/<([a-zA-Z][\w:-]*)/g)].map((m) => m[1]);
    expect(tags.length).toBeGreaterThan(0);
    for (const t of tags) expect(allowed.has(t), `element <${t}> not allowed`).toBe(true);
    expect(svg).not.toMatch(/<(text|image|use|filter|linearGradient|radialGradient|style|script|foreignObject)\b/i);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/i);
    expect(svg).not.toMatch(/data:/i);
    expect(svg).not.toMatch(/stroke=["'](?!none)/i);
  });

  it('has at least one flat shape for the hat', () => {
    const svg = readFileSync(path, 'utf8');
    expect(svg.match(/<(circle|ellipse|path)\b/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe('icon colours follow the tokens (R-025 crit. 2)', () => {
  it('every fill is --color-bg (hat) or --color-accent (background)', () => {
    const svg = readFileSync(join(ICON_DIR, 'icon.svg'), 'utf8');
    const fills = [...svg.matchAll(/\bfill=["']([^"']+)["']/gi)].map((m) => m[1].trim().toLowerCase());
    expect(fills.length).toBeGreaterThan(0);
    const allowed = [HAT, BACKGROUND].map((c) => c.toLowerCase());
    for (const f of fills) expect(allowed, `fill ${f}`).toContain(f);
    expect(fills).toContain(allowed[0]);
    expect(fills).toContain(allowed[1]);
  });

  it('hat colour equals manifest background_color, background equals theme_color', () => {
    const cfg = readFileSync('vite.config.ts', 'utf8');
    const theme = /theme_color:\s*['"]([^'"]+)['"]/.exec(cfg)?.[1] ?? '';
    const bg = /background_color:\s*['"]([^'"]+)['"]/.exec(cfg)?.[1] ?? '';
    expect(BACKGROUND.toLowerCase()).toBe(theme.toLowerCase());
    expect(HAT.toLowerCase()).toBe(bg.toLowerCase());
  });
});

describe('generated PNG files (R-025 crit. 3)', () => {
  it.each(PNGS)('$file exists and is $size x $size', ({ file, size }) => {
    const p = join(ICON_DIR, file);
    expect(existsSync(p)).toBe(true);
    expect(readPngSize(p)).toEqual({ w: size, h: size });
  });

  it('maskable icon: every pixel outside the 40% circle has the background colour', () => {
    const png = decodePng(join(ICON_DIR, 'icon-maskable-512.png'));
    const r = 0.4 * 512;
    let outside = 0;
    const bad: string[] = [];
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const d = Math.hypot(x + 0.5 - 256, y + 0.5 - 256);
        if (d <= r) continue;
        outside++;
        if (!near(pixelAt(png, x, y), BACKGROUND) && bad.length < 5) bad.push(`(${x},${y})`);
      }
    }
    expect(outside).toBeGreaterThan(0);
    expect(bad, 'hat pixels outside safe zone').toEqual([]);
  });
});

describe('index.html icon links (R-025 crit. 4)', () => {
  const html = readFileSync('index.html', 'utf8');
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag: string, name: string) => new RegExp(`\\s${name}=["']([^"']*)["']`, 'i').exec(tag)?.[1];
  const file = (href: string) => join('public', href.replace(/^\//, ''));

  it('has rel=icon to the SVG with type image/svg+xml', () => {
    const l = links.find((t) => attr(t, 'rel') === 'icon' && attr(t, 'type') === 'image/svg+xml');
    expect(l, 'svg icon link').toBeDefined();
    expect(attr(l!, 'href')).toBe('/icons/icon.svg');
    expect(existsSync(file(attr(l!, 'href')!))).toBe(true);
  });

  it('has rel=icon to favicon-32.png with sizes 32x32, file has those dimensions', () => {
    const l = links.find((t) => attr(t, 'rel') === 'icon' && attr(t, 'sizes') === '32x32');
    expect(l, 'png favicon link').toBeDefined();
    expect(attr(l!, 'href')).toBe('/icons/favicon-32.png');
    expect(readPngSize(file(attr(l!, 'href')!))).toEqual({ w: 32, h: 32 });
  });

  it('has rel=apple-touch-icon to apple-touch-icon.png (180x180)', () => {
    const l = links.find((t) => attr(t, 'rel') === 'apple-touch-icon');
    expect(l, 'apple-touch-icon link').toBeDefined();
    expect(attr(l!, 'href')).toBe('/icons/apple-touch-icon.png');
    expect(readPngSize(file(attr(l!, 'href')!))).toEqual({ w: 180, h: 180 });
  });

  it('no longer points rel=icon at icon-192.png', () => {
    expect(links.some((t) => attr(t, 'rel') === 'icon' && /icon-192\.png/.test(attr(t, 'href') ?? ''))).toBe(false);
  });
});

describe('pixel check (R-025 crit. 5)', () => {
  it.each(PNGS)('$file: centre pixel is hat colour, corner pixel is background', ({ file }) => {
    const png = decodePng(join(ICON_DIR, file));
    const centre = pixelAt(png, Math.floor(png.width / 2), Math.floor(png.height / 2));
    expect(near(centre, HAT), `centre ${centre}`).toBe(true);
    const corner = pixelAt(png, 0, 0);
    expect(near(corner, BACKGROUND), `corner ${corner}`).toBe(true);
  });

  it('favicon-32.png: at least 20% of pixels have the hat colour', () => {
    const png = decodePng(join(ICON_DIR, 'favicon-32.png'));
    expect(png.width * png.height).toBe(1024);
    expect(hatShare(png)).toBeGreaterThanOrEqual(0.2);
  });

  it('counter-proof: a solid red 32x32 PNG does not reach 20%', () => {
    const red = decodePng(solidPng(32, 32, [255, 0, 0, 255]));
    expect(red.width).toBe(32);
    expect(hatShare(red)).toBeLessThan(0.2);
  });

  it('counter-proof: a solid hat-coloured PNG counts as 100%', () => {
    const c = parseColor(HAT);
    expect(hatShare(decodePng(solidPng(32, 32, [c.r, c.g, c.b, 255])))).toBe(1);
  });
});

describe('no new packages, script uses only existing ones (R-025 crit. 6)', () => {
  const EXPECTED_DEPS = [
    '@fontsource/figtree',
    '@fontsource/fraunces',
    '@supabase/supabase-js',
    'heic-to',
    'react',
    'react-dom',
    'react-router-dom',
  ];
  const EXPECTED_DEV_DEPS = [
    '@playwright/test',
    '@types/node',
    '@types/pg',
    '@types/react',
    '@types/react-dom',
    '@vitejs/plugin-react',
    'pg',
    'supabase',
    'typescript',
    'vite',
    'vite-plugin-pwa',
    'vitest',
  ];
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  it('dependencies and devDependencies equal the list from before T-026', () => {
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([...EXPECTED_DEPS].sort());
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([...EXPECTED_DEV_DEPS].sort());
  });

  it('scripts/make-icons.mjs imports only node:* or existing packages', () => {
    const src = readFileSync('scripts/make-icons.mjs', 'utf8');
    const specs = [
      ...[...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]),
      ...[...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
      ...[...src.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
    ];
    const known = new Set([...EXPECTED_DEPS, ...EXPECTED_DEV_DEPS]);
    for (const s of specs) {
      if (s.startsWith('node:') || s.startsWith('.')) continue;
      const name = s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0];
      expect(known.has(name), `import "${s}" is not in package.json`).toBe(true);
    }
  });
});
