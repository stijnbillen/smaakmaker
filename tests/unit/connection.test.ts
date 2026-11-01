import { describe, expect, it } from 'vitest';
import { isConnectionError } from '../../src/lib/connection';

// T-001 criterion 6: only "no answer" failures are connection errors; server answers are not.
describe('isConnectionError (R-001 crit. 6)', () => {
  it('treats TypeError: Failed to fetch as connection error', () => {
    expect(isConnectionError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('treats a Supabase error without HTTP status as connection error', () => {
    expect(isConnectionError({ message: 'FetchError: network down' })).toBe(true);
    expect(isConnectionError({ message: 'network down', status: 0 })).toBe(true);
  });

  it.each([502, 503, 504])('treats gateway status %i as connection error', (status) => {
    expect(isConnectionError({ message: 'Bad gateway', status })).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 422])('does not treat 4xx (%i) as connection error', (status) => {
    // e.g. a row-level-security rejection must show its own message, not "Geen verbinding"
    expect(isConnectionError({ message: 'new row violates row-level security policy', status })).toBe(false);
  });

  it('does not treat other server errors (500) as connection error', () => {
    expect(isConnectionError({ message: 'boom', status: 500 })).toBe(false);
  });

  it('does not treat null/undefined as connection error', () => {
    expect(isConnectionError(null)).toBe(false);
    expect(isConnectionError(undefined)).toBe(false);
  });
});
