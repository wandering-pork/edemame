import { describe, it, expect } from 'vitest';
import { isSoleActiveMember, pickCloudSwitchTarget } from './cloudSwitchTarget';

const me = 'user-me';
const other = 'user-other';

describe('isSoleActiveMember', () => {
  it('is true only when the one active member is this user', () => {
    expect(isSoleActiveMember([{ userId: me, role: 'owner' }], me)).toBe(true);
    expect(isSoleActiveMember([{ userId: other, role: 'owner' }], me)).toBe(false);
  });

  it('is false for a shared firm', () => {
    expect(isSoleActiveMember([{ userId: me, role: 'owner' }, { userId: other, role: 'agent' }], me)).toBe(false);
  });

  it('is false when the user sees no active members (not a member, or disabled)', () => {
    expect(isSoleActiveMember([], me)).toBe(false);
  });
});

describe('pickCloudSwitchTarget', () => {
  it('creates a firm when there is no current firm', () => {
    expect(pickCloudSwitchTarget(null, [], me)).toEqual({ kind: 'create' });
    expect(pickCloudSwitchTarget(undefined, [], me)).toEqual({ kind: 'create' });
  });

  it('reuses a personal firm the user owns alone', () => {
    expect(pickCloudSwitchTarget('firm-1', [{ userId: me, role: 'owner' }], me)).toEqual({ kind: 'reuse', firmId: 'firm-1' });
  });

  it('never reuses a shared firm, even one the user owns', () => {
    const members = [{ userId: me, role: 'owner' }, { userId: other, role: 'agent' }];
    expect(pickCloudSwitchTarget('firm-shared', members, me)).toEqual({ kind: 'create' });
  });

  it('never reuses a shared firm the user joined by invite (the 1G.1 data-loss case)', () => {
    const members = [{ userId: other, role: 'owner' }, { userId: me, role: 'paralegal' }];
    expect(pickCloudSwitchTarget('firm-employer', members, me)).toEqual({ kind: 'create' });
  });

  it('creates a firm when the user is no longer an active member of the current one', () => {
    expect(pickCloudSwitchTarget('firm-1', [], me)).toEqual({ kind: 'create' });
  });

  it('creates a firm when the user is the only member but not an owner', () => {
    expect(pickCloudSwitchTarget('firm-1', [{ userId: me, role: 'agent' }], me)).toEqual({ kind: 'create' });
  });
});
