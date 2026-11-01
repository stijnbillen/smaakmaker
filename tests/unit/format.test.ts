import { describe, expect, it } from 'vitest';
import { formatDate } from '../../src/lib/format';

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
