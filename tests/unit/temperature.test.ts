import { describe, expect, it } from 'vitest';
import { convertTemperatures, toCelsius, toFahrenheit } from '../../src/lib/temperature';

// T-031 / R-031: pure conversion of temperatures in displayed text. Every test names the criterion it protects.

describe('crit. 2: recognised forms, converted to °F', () => {
  it.each([
    ['180 °C', '356 °F'],
    ['180°C', '356 °F'],
    ['180 ° C', '356 °F'],
    ['180,5 °C', '357 °F'],
    ['180.5 °C', '357 °F'],
    ['-18 °C', '0 °F'],
    ['−18 °C', '0 °F'], // U+2212 minus
    ['180–200 °C', '356–392 °F'],
    ['180-200 °C', '356–392 °F'],
    ['Bak op 180 °C, daarna 200°C.', 'Bak op 356 °F, daarna 392 °F.'],
    ['180 °c', '356 °F'], // lower-case unit letter
  ])('%j -> %j', (input, expected) => {
    expect(convertTemperatures(input, 'F')).toBe(expected);
  });

  it.each([
    ['350 ° F', '177 °C'],
    ['350°F', '177 °C'],
    ['325-350 °F', '163–177 °C'],
  ])('to °C: %j -> %j', (input, expected) => {
    expect(convertTemperatures(input, 'C')).toBe(expected);
  });

  it('a hyphen with spaces is text, not a range ("Stap 2 - 200 °C")', () => {
    expect(convertTemperatures('Stap 2 - 200 °C', 'F')).toBe('Stap 2 - 392 °F');
  });
});

describe('crit. 3: formulas and rounding', () => {
  it.each([
    [180, 356],
    [0, 32],
    [100, 212],
    [-18, 0],
    [2.5, 37], // 36.5 rounds half up
  ])('toFahrenheit(%d) = %d', (c, f) => {
    expect(toFahrenheit(c)).toBe(f);
  });

  it('never returns -0', () => {
    expect(Object.is(toFahrenheit(-18), 0)).toBe(true);
    expect(Object.is(toCelsius(31.1), 0)).toBe(true);
  });

  it.each([
    [350, 177],
    [32, 0],
    [0, -18],
    [32.9, 1], // 0.5 exactly; naive float maths gives 0.4999...
    [31.1, 0], // -0.5 rounds up to 0
  ])('toCelsius(%d) = %d', (f, c) => {
    expect(toCelsius(f)).toBe(c);
  });

  it('"31,1 °F" shows "0 °C", not "-0 °C"', () => {
    expect(convertTemperatures('31,1 °F', 'C')).toBe('0 °C');
  });

  it('negative result uses a hyphen-minus', () => {
    expect(convertTemperatures('0 °F', 'C')).toBe('-18 °C');
  });
});

describe('crit. 4: already in the chosen unit stays exactly as written', () => {
  it.each(['180°C', '180 ° C', '180,0 °C', '180-200°C', '−18 °C'])('C stays %j', (s) => {
    expect(convertTemperatures(s, 'C')).toBe(s);
  });

  it('F stays "350 ° F"', () => {
    expect(convertTemperatures('350 ° F', 'F')).toBe('350 ° F');
  });

  it('text without a temperature in the other unit comes back identical', () => {
    const s = 'Bak 20 minuten op 350 °F met 200 g bloem.';
    expect(convertTemperatures(s, 'F')).toBe(s);
  });
});

describe('crit. 5: no °C/°F means no change', () => {
  it.each(['180', '20 minuten', '200 g', '180 graden', '180 °', '180 °Celsius', '180 °CF', 'a180 °C'])(
    '%j unchanged with F',
    (s) => {
      expect(convertTemperatures(s, 'F')).toBe(s);
    },
  );

  it('only a hyphen makes a range: "180 tot 200 °C" -> "180 tot 392 °F"', () => {
    expect(convertTemperatures('180 tot 200 °C', 'F')).toBe('180 tot 392 °F');
  });
});

describe('crit. 6: pure', () => {
  it('does not touch the input', () => {
    const s = 'Bak op 180 °C';
    const copy = `${s}`;
    convertTemperatures(s, 'F');
    expect(s).toBe(copy);
  });
});

describe('crit. 7: many temperatures, hostile text', () => {
  it('50 temperatures in one call', () => {
    expect(convertTemperatures('180 °C, '.repeat(50), 'F')).toBe('356 °F, '.repeat(50));
  });

  it('100,000 almost-matching characters convert in < 50 ms (no catastrophic backtracking)', () => {
    const unit = '12345 ° - 1,2,3 -- 4.5.6 °  ';
    const text = unit.repeat(Math.ceil(100_000 / unit.length)).slice(0, 100_000);
    const start = performance.now();
    convertTemperatures(text, 'F');
    expect(performance.now() - start).toBeLessThan(50);
  });

  it('"<" and "&" are not escaped or interpreted', () => {
    expect(convertTemperatures('<b>180 °C</b> & 200°C', 'F')).toBe('<b>356 °F</b> & 392 °F');
  });
});
