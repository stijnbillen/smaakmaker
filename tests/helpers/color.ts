// Test-only colour helpers (WCAG 2.x contrast). Kept out of src/ on purpose.
import { readFileSync } from 'node:fs';

export interface Rgba {
  r: number; // 0-255
  g: number;
  b: number;
  a: number; // 0-1
}

/** Parses #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() (comma or space syntax). Throws on anything else. */
export function parseColor(input: string): Rgba {
  const v = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) {
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(v);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const num = (s: string) => (s.endsWith('%') ? (parseFloat(s) / 100) * 255 : parseFloat(s));
      const alpha =
        parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
      return { r: num(parts[0]), g: num(parts[1]), b: num(parts[2]), a: alpha };
    }
  }
  throw new Error(`Kleur niet ondersteund door de test: "${input}" (gebruik hex of rgb())`);
}

export function relativeLuminance(c: Rgba): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG contrast ratio between two colour strings. Translucent colours are refused with a clear message. */
export function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (ca.a < 1 || cb.a < 1) {
    throw new Error(`Kleur met transparantie (alfa < 1) niet toegelaten in contrasttest: "${a}" / "${b}"`);
  }
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Reads custom properties from top-level :root blocks of a CSS file; resolves simple var(--x) aliases. */
export function readTokens(path = 'src/styles/tokens.css'): Record<string, string> {
  const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens: Record<string, string> = {};
  const rootRe = /(^|\})\s*:root\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rootRe.exec(css))) {
    for (const d of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) tokens[d[1]] = d[2].trim();
  }
  const resolve = (val: string, depth = 0): string => {
    const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(val);
    if (!ref || depth > 10) return val;
    const next = tokens[ref[1]];
    return next === undefined ? val : resolve(next, depth + 1);
  };
  for (const k of Object.keys(tokens)) tokens[k] = resolve(tokens[k]);
  return tokens;
}
