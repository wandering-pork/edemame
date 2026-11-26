import { describe, expect, it } from 'vitest';
import { isSameAuthUser } from './authUser';

const base = { id: 'u1', email: 'a@example.com', user_metadata: { full_name: 'Ann', password_set: true } };

describe('isSameAuthUser', () => {
  it('treats a fresh copy of the same user (token refresh) as the same', () => {
    expect(isSameAuthUser(base, { ...base, user_metadata: { ...base.user_metadata } })).toBe(true);
  });

  it('ignores metadata key order', () => {
    expect(isSameAuthUser(base, { ...base, user_metadata: { password_set: true, full_name: 'Ann' } })).toBe(true);
  });

  it('sees a different user', () => {
    expect(isSameAuthUser(base, { ...base, id: 'u2' })).toBe(false);
  });

  it('sees a changed email or metadata (a real profile update)', () => {
    expect(isSameAuthUser(base, { ...base, email: 'b@example.com' })).toBe(false);
    expect(isSameAuthUser(base, { ...base, user_metadata: { full_name: 'Ann B', password_set: true } })).toBe(false);
  });

  it('handles signed-out states', () => {
    expect(isSameAuthUser(null, null)).toBe(true);
    expect(isSameAuthUser(base, null)).toBe(false);
    expect(isSameAuthUser(null, base)).toBe(false);
  });

  it('treats missing metadata like empty metadata', () => {
    expect(isSameAuthUser({ id: 'u1', email: 'a@example.com' }, { id: 'u1', email: 'a@example.com', user_metadata: {} })).toBe(true);
  });
});
