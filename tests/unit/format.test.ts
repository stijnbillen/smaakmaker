import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../../src/i18n/language';
import { formatDate, formatDateTime, formatDuration } from '../../src/lib/format';

// Fixed zone: the expected text must not depend on the machine running the test.
process.env.TZ = 'Europe/Brussels';

// T-003 crit. 8 (R-002): date shown with the author, in Dutch.
describe('formatDate (R-002 crit. 8)', () => {
  it('formats 2026-11-01T10:00:00Z as "1 november 2026"', () => {
    expect(formatDate('2026-11-01T10:00:00Z')).toBe('1 november 2026');
  });

  it('has no leading zero and uses the Dutch month name', () => {
    expect(formatDate('2026-03-05T12:00:00Z')).toBe('5 maart 2026');
    expect(formatDate('2026-12-24T12:00:00Z')).toBe('24 december 2026');
  });

  it('uses the Brussels day, not the UTC day', () => {
    // 23:30 UTC is already 2 November in Brussels (UTC+1).
    expect(formatDate('2026-11-01T23:30:00Z')).toBe('2 november 2026');
  });
});

// T-004 crit. 2 (R-017): the expiry sits on the second, so the invite screen shows date and hour.
describe('formatDateTime (R-017 crit. 2)', () => {
  it('formats 2026-11-09T13:05:00Z as "9 november 2026 om 14:05" (winter, UTC+1)', () => {
    expect(formatDateTime('2026-11-09T13:05:00Z')).toBe('9 november 2026 om 14:05');
  });

  it('uses Brussels summer time (UTC+2) in July', () => {
    expect(formatDateTime('2026-07-09T13:05:00Z')).toBe('9 juli 2026 om 15:05');
  });

  it('rolls over to the Brussels day, not the UTC day', () => {
    expect(formatDateTime('2026-11-01T23:30:00Z')).toBe('2 november 2026 om 00:30');
  });
});

// T-018 / R-023 crit. 6: dates, times and durations follow the language (nl-BE / en-GB).
describe('format per language (R-023 crit. 6)', () => {
  afterEach(() => {
    setLanguage('nl');
    vi.unstubAllGlobals();
  });
  const useLanguage = (lang: 'nl' | 'en') => {
    vi.stubGlobal('document', { documentElement: { lang: '' }, title: '' });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    setLanguage(lang);
  };

  it.each([
    ['nl', '1 november 2026'],
    ['en', '1 November 2026'],
  ] as const)('formatDate in %s is "%s"', (lang, text) => {
    useLanguage(lang);
    expect(formatDate('2026-11-01T12:00:00Z')).toBe(text);
  });

  it.each([
    ['nl', '9 november 2026 om 14:05'],
    ['en', '9 November 2026 at 14:05'],
  ] as const)('formatDateTime in %s is "%s"', (lang, text) => {
    useLanguage(lang);
    expect(formatDateTime('2026-11-09T13:05:00Z')).toBe(text);
  });

  it('keeps the Brussels day in English too', () => {
    useLanguage('en');
    expect(formatDate('2026-11-01T23:30:00Z')).toBe('2 November 2026');
  });

  it.each([
    [0, '0 min', '0 min'],
    [45, '45 min', '45 min'],
    [60, '1 u', '1 h'],
    [90, '1 u 30 min', '1 h 30 min'],
    [4320, '72 u', '72 h'],
  ])('formatDuration(%s) is "%s" (nl) and "%s" (en)', (minutes, nlText, enText) => {
    useLanguage('nl');
    expect(formatDuration(minutes)).toBe(nlText);
    useLanguage('en');
    expect(formatDuration(minutes)).toBe(enText);
  });

  it('switches back to Dutch without leftovers (cache per locale)', () => {
    useLanguage('en');
    formatDate('2026-11-01T12:00:00Z');
    useLanguage('nl');
    expect(formatDate('2026-11-01T12:00:00Z')).toBe('1 november 2026');
  });
});

// T-006 / R-007 crit. 3: duration as "1 u 30 min"; the units come from nl.json.
describe('formatDuration (R-007 crit. 3)', () => {
  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [60, '1 u'],
    [90, '1 u 30 min'],
    [4320, '72 u'],
    [61, '1 u 1 min'],
    [59, '59 min'],
  ])('%s minutes is shown as "%s"', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});
