import { describe, it, expect } from 'vitest';
import { resolveCurrentFirm, type ActiveMembership } from './firmSwitch';

const membership = (firmId: string, firmName = firmId, role: ActiveMembership['role'] = 'member'): ActiveMembership => ({
  firmId, firmName, role,
});

describe('resolveCurrentFirm', () => {
  it('keeps the current firm when it is an active membership', () => {
    const memberships = [membership('firm-1'), membership('firm-2')];
    expect(resolveCurrentFirm('firm-2', memberships)).toEqual({ firmId: 'firm-2', lostFirmId: null });
  });

  it('self-heals to the first membership when currentFirmId is unset, with nothing lost', () => {
    const memberships = [membership('firm-1'), membership('firm-2')];
    expect(resolveCurrentFirm(null, memberships)).toEqual({ firmId: 'firm-1', lostFirmId: null });
    expect(resolveCurrentFirm(undefined, memberships)).toEqual({ firmId: 'firm-1', lostFirmId: null });
  });

  it('falls back to another membership and reports the lost firm when access is gone', () => {
    const memberships = [membership('firm-2')];
    expect(resolveCurrentFirm('firm-1', memberships)).toEqual({ firmId: 'firm-2', lostFirmId: 'firm-1' });
  });

  it('returns null with the lost firm reported when no memberships remain', () => {
    expect(resolveCurrentFirm('firm-1', [])).toEqual({ firmId: null, lostFirmId: 'firm-1' });
  });

  it('returns null with nothing lost when there was never a current firm and no memberships', () => {
    expect(resolveCurrentFirm(null, [])).toEqual({ firmId: null, lostFirmId: null });
  });

  it('prefers the first membership in the list (caller passes most-recently-joined first)', () => {
    const memberships = [membership('firm-recent'), membership('firm-older')];
    expect(resolveCurrentFirm('firm-gone', memberships)).toEqual({ firmId: 'firm-recent', lostFirmId: 'firm-gone' });
  });
});
