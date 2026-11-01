import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readTokens } from '../helpers/color';

// R-016 crit. 2: theme-color and manifest colours cannot be CSS variables, so they must equal the tokens.
const norm = (s: string) => s.trim().toLowerCase();

describe('PWA colours follow the tokens (R-016 crit. 2)', () => {
  const tokens = readTokens();

  it('index.html theme-color equals --color-theme', () => {
    const html = readFileSync('index.html', 'utf8');
    const tag = /<meta[^>]*name=["']theme-color["'][^>]*>/i.exec(html)?.[0];
    expect(tag, 'meta theme-color missing').toBeDefined();
    const content = /content=["']([^"']+)["']/i.exec(tag as string)?.[1];
    expect(norm(content ?? '')).toBe(norm(tokens['--color-theme']));
  });

  it('vite.config.ts manifest theme_color and background_color equal --color-theme and --color-bg', () => {
    const cfg = readFileSync('vite.config.ts', 'utf8');
    const theme = /theme_color:\s*['"]([^'"]+)['"]/.exec(cfg)?.[1];
    const bg = /background_color:\s*['"]([^'"]+)['"]/.exec(cfg)?.[1];
    expect(norm(theme ?? '')).toBe(norm(tokens['--color-theme']));
    expect(norm(bg ?? '')).toBe(norm(tokens['--color-bg']));
  });

  it('workbox precaches woff2 fonts (self-hosted fonts in the app shell)', () => {
    expect(readFileSync('vite.config.ts', 'utf8')).toMatch(/globPatterns:[^\]]*woff2/);
  });
});
