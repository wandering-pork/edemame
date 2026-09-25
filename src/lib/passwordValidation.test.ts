import { describe, it, expect } from 'vitest';
import { validateNewPassword, MIN_PASSWORD_LENGTH } from './passwordValidation';

describe('validateNewPassword', () => {
  it('rejects a password shorter than the minimum length', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateNewPassword(short, short)).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  });

  it('rejects mismatched password/confirm pairs', () => {
    const password = 'a'.repeat(MIN_PASSWORD_LENGTH);
    expect(validateNewPassword(password, `${password}x`)).toBe(
      'The two passwords do not match.'
    );
  });

  it('accepts a valid, matching pair at exactly the minimum length', () => {
    const password = 'a'.repeat(MIN_PASSWORD_LENGTH);
    expect(validateNewPassword(password, password)).toBeNull();
  });

  it('accepts a valid, matching pair longer than the minimum length', () => {
    const password = 'a'.repeat(MIN_PASSWORD_LENGTH + 10);
    expect(validateNewPassword(password, password)).toBeNull();
  });
});
