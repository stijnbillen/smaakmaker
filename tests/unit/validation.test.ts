import { describe, expect, it } from 'vitest';
import { isSixDigitCode, isValidDisplayName, isValidEmail } from '../../src/lib/validation';

// T-003 crit. 4 (R-002): invalid e-mail addresses are refused.
describe('isValidEmail (R-002 crit. 4)', () => {
  it.each(['a@b.be', 'piet.peeters@example.com', 'piet+smaak@mail.example.be', 'a@sub.b.be'])('accepts %s', (v) => {
    expect(isValidEmail(v)).toBe(true);
  });

  it.each(['a@b', 'a b@c.be', '@c.be', 'piet@', '', '   ', 'piet.be', 'a@@b.be'])('refuses "%s"', (v) => {
    expect(isValidEmail(v)).toBe(false);
  });

  it('ignores spaces around a good address (pasted from a mail client)', () => {
    expect(isValidEmail(' a@b.be ')).toBe(true);
  });
});

// T-003 crit. 3 (R-002): display name is 2 to 40 characters, counted after trimming.
describe('isValidDisplayName (R-002 crit. 3)', () => {
  it('refuses 1 character, accepts 2', () => {
    expect(isValidDisplayName('a')).toBe(false);
    expect(isValidDisplayName('ab')).toBe(true);
  });

  it('accepts 40 characters, refuses 41', () => {
    expect(isValidDisplayName('a'.repeat(40))).toBe(true);
    expect(isValidDisplayName('a'.repeat(41))).toBe(false);
  });

  it('counts after trimming spaces at both ends', () => {
    expect(isValidDisplayName('  a  ')).toBe(false);
    expect(isValidDisplayName('  ab  ')).toBe(true);
    expect(isValidDisplayName(` ${'a'.repeat(40)} `)).toBe(true);
    expect(isValidDisplayName(` ${'a'.repeat(41)} `)).toBe(false);
  });

  it('refuses empty and blank names', () => {
    expect(isValidDisplayName('')).toBe(false);
    expect(isValidDisplayName('      ')).toBe(false);
  });
});

// T-003 crit. 6: the code from the e-mail has exactly 6 digits.
describe('isSixDigitCode (R-002 crit. 6)', () => {
  it('accepts exactly six digits', () => {
    expect(isSixDigitCode('123456')).toBe(true);
    expect(isSixDigitCode('000000')).toBe(true);
  });

  it.each(['12345', '1234567', '12345a', '12 456', '', 'abcdef'])('refuses "%s"', (v) => {
    expect(isSixDigitCode(v)).toBe(false);
  });
});
