import { describe, expect, it } from 'vitest';
import { canDelete } from '../../src/lib/permissions';

// T-004 crit. 3 (R-017): an author or an administrator may delete, nobody else.
describe('canDelete (R-017 crit. 3)', () => {
  const item = { authorId: 'user-a' };

  it('is true for the author', () => {
    expect(canDelete(item, { userId: 'user-a', isAdmin: false })).toBe(true);
  });

  it('is true for an administrator who is not the author', () => {
    expect(canDelete(item, { userId: 'user-b', isAdmin: true })).toBe(true);
  });

  it('is false for another normal user', () => {
    expect(canDelete(item, { userId: 'user-b', isAdmin: false })).toBe(false);
  });

  it('is false when nobody is known (no id, not admin), even if the author is unknown too', () => {
    expect(canDelete(item, { userId: null as unknown as string, isAdmin: false })).toBe(false);
    expect(canDelete({ authorId: null as unknown as string }, { userId: null as unknown as string, isAdmin: false })).toBe(false);
  });
});
