import { describe, expect, it } from 'vitest';
import { canDelete, canEdit } from '../../src/lib/permissions';

// T-005 crit. 6 (R-003): only the author edits; an administrator may delete but not edit.
describe('canEdit (R-003 crit. 6)', () => {
  const item = { authorId: 'user-a' };

  it('is true for the author', () => {
    expect(canEdit(item, { userId: 'user-a' })).toBe(true);
  });

  it('is false for another user', () => {
    expect(canEdit(item, { userId: 'user-b' })).toBe(false);
  });

  it('is false for an administrator who is not the author, even when isAdmin is passed', () => {
    expect(canEdit(item, { userId: 'user-b', isAdmin: true } as never)).toBe(false);
  });

  it('is false when nobody is known', () => {
    expect(canEdit(item, { userId: null as unknown as string })).toBe(false);
    expect(canEdit({ authorId: null as unknown as string }, { userId: null as unknown as string })).toBe(false);
  });
});

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
