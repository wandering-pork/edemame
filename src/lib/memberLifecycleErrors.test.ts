import { describe, it, expect } from 'vitest';
import { friendlyMemberLifecycleError } from './memberLifecycleErrors';

describe('friendlyMemberLifecycleError', () => {
  it('maps the last-owner trigger message', () => {
    const err = new Error('A firm must keep at least one active owner');
    expect(friendlyMemberLifecycleError(err)).toBe(
      'This firm needs at least one active owner — make someone else an owner first.',
    );
  });

  it('maps leave_firm\'s last-owner message', () => {
    const err = new Error('You are the last owner of this firm. Make someone else an owner first.');
    expect(friendlyMemberLifecycleError(err)).toBe(
      "You're the last owner of this firm. Make someone else an owner first.",
    );
  });

  it('maps the admin-cannot-manage-admins message', () => {
    const err = new Error('Only a firm owner can manage admins or owners');
    expect(friendlyMemberLifecycleError(err)).toBe(
      "Only a firm owner can manage another admin's or owner's access.",
    );
  });

  it('maps the generic role/status change message', () => {
    const err = new Error('Only a firm owner can change roles or member status');
    expect(friendlyMemberLifecycleError(err)).toBe('Only a firm owner or admin can do that.');
  });

  it('maps remove_member\'s self-removal guard', () => {
    const err = new Error('Use "Leave firm" to remove yourself.');
    expect(friendlyMemberLifecycleError(err)).toBe(
      'Use "Leave firm" in Settings to remove your own access.',
    );
  });

  it('accepts a plain string error', () => {
    expect(friendlyMemberLifecycleError('That person is not a member of this firm.')).toBe(
      'That person is not a member of this firm.',
    );
  });

  it('accepts a Supabase-style { message } object', () => {
    expect(friendlyMemberLifecycleError({ message: 'Only a firm owner or admin can remove a member' })).toBe(
      'Only a firm owner or admin can remove a member.',
    );
  });

  it('falls back to the raw message for an unrecognized error', () => {
    expect(friendlyMemberLifecycleError(new Error('network timeout'))).toBe('network timeout');
  });

  it('falls back to a generic message for an empty/unknown error', () => {
    expect(friendlyMemberLifecycleError(null)).toBe('Something went wrong — please try again.');
    expect(friendlyMemberLifecycleError(undefined)).toBe('Something went wrong — please try again.');
  });
});
