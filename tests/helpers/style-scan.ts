// Test-only scanner for hard-coded style values (T-002 crit. 2).
export interface Finding {
  kind: 'color' | 'font-family' | 'spacing';
  line: number;
  text: string;
}

const COLOR_PROPS =
  'color|background|background-color|border(?:-[a-z-]+)?|outline(?:-[a-z-]+)?|fill|stroke|box-shadow|text-decoration-color|caret-color|accent-color';
const SPACING_PROPS = '(?:margin|padding)(?:-[a-z]+)*|gap|row-gap|column-gap|inset(?:-[a-z]+)*';
const NAMED = [
  'white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'brown', 'gray', 'grey',
  'silver', 'gold', 'navy', 'teal', 'maroon', 'olive', 'lime', 'aqua', 'cyan', 'magenta', 'beige', 'ivory',
  'tomato', 'salmon', 'coral', 'crimson', 'khaki', 'tan', 'indigo', 'violet',
];
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/i;
const COLOR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;

function colorValueOk(value: string): boolean {
  // var(--x) is allowed; strip it first so token names like --color-red cannot trigger the scan.
  const v = value.replace(/var\(--[a-z0-9-]+\)/gi, ' ').replace(/!important/g, '');
  if (HEX.test(v) || COLOR_FN.test(v)) return false;
  const words = v.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return !words.some((w) => NAMED.includes(w));
}

function spacingValueOk(value: string): boolean {
  let v = value.replace(/!important/g, '');
  v = v.replace(/var\(--space-[a-z0-9-]+\)/gi, ' ');
  v = v.replace(/env\(safe-area-inset-[a-z]+(?:\s*,[^)]*)?\)/gi, ' ');
  v = v.replace(/calc\(|[()+*/]|\s-\s/g, ' ').replace(/\b(auto|inherit|initial|unset)\b/g, ' ');
  // What remains may only be 0 (unitless).
  return v
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => tok === '0');
}

/** Scans CSS-like text (also works on .ts/.tsx: only `prop: value` shapes are matched). */
export function scanStyles(text: string): Finding[] {
  const findings: Finding[] = [];
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const colorProp = new RegExp(`^(?:${COLOR_PROPS})$`, 'i');
  const spacingProp = new RegExp(`^(?:${SPACING_PROPS})$`, 'i');
  const decl = /(?:^|[\s;{'"`,])(-?[a-zA-Z][a-zA-Z-]*)\s*:\s*([^;{}`]+)/g;
  stripped.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(decl)) {
      const prop = m[1];
      const value = m[2].replace(/['",\s]+$/, '').trim();
      if (colorProp.test(prop)) {
        if (!colorValueOk(value)) findings.push({ kind: 'color', line: i + 1, text: `${prop}: ${value}` });
      } else if (/^font-family$/i.test(prop)) {
        if (!/^(?:var\(--font-[a-z0-9-]+\)|inherit)$/i.test(value)) {
          findings.push({ kind: 'font-family', line: i + 1, text: `${prop}: ${value}` });
        }
      } else if (spacingProp.test(prop)) {
        if (!spacingValueOk(value)) findings.push({ kind: 'spacing', line: i + 1, text: `${prop}: ${value}` });
      }
    }
  });
  return findings;
}
