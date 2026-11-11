export type TemperatureUnit = 'C' | 'F';

/** Round to 9 decimals first (kills float noise such as 0.4999999999), then halves up; never returns -0. */
function roundHalfUp(x: number): number {
  const cleaned = Math.round(x * 1e9) / 1e9;
  const result = Math.floor(cleaned + 0.5);
  return result === 0 ? 0 : result;
}

export const toFahrenheit = (c: number): number => roundHalfUp((c * 9) / 5 + 32);
export const toCelsius = (f: number): number => roundHalfUp(((f - 32) * 5) / 9);

// One pass, no nested quantifiers. The lookbehind stops a match inside a word or a longer number (also
// keeps the scan linear on long digit runs). Only a dash without spaces makes a range ("Stap 2 - 200 °C" stays text).
const NUM = '[-\\u2212]?\\d+(?:[.,]\\d+)?';
const PATTERN = new RegExp(
  `(?<![\\p{L}\\d.,])(${NUM})(?:[-\\u2013](${NUM}))?[ \\t\\u00a0]*\\u00b0[ \\t\\u00a0]*([CFcf])(?![\\p{L}\\d])`,
  'gu',
);

const parse = (s: string): number => Number(s.replace('−', '-').replace(',', '.'));

/** Display-only conversion of every "<number> °C/°F" in the text to the chosen unit. Pure; the input is untouched. */
export function convertTemperatures(text: string, unit: TemperatureUnit): string {
  return text.replace(PATTERN, (match: string, a: string, b: string | undefined, letter: string) => {
    if (letter.toUpperCase() === unit) return match;
    const convert = unit === 'F' ? toFahrenheit : toCelsius;
    const from = convert(parse(a));
    const value = b === undefined ? String(from) : `${from}–${convert(parse(b))}`;
    return `${value} °${unit}`;
  });
}
