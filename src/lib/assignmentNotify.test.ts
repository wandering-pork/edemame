import { describe, it, expect } from 'vitest';
import { shouldNotifyAssignment } from './assignmentNotify';

describe('shouldNotifyAssignment', () => {
  it('notifies when a new assignee is set to someone else', () => {
    expect(shouldNotifyAssignment(undefined, 'user-2', 'user-1')).toBe(true);
  });

  it('notifies when the assignee changes to a different person', () => {
    expect(shouldNotifyAssignment('user-2', 'user-3', 'user-1')).toBe(true);
  });

  it('does not notify when unassigned', () => {
    expect(shouldNotifyAssignment('user-2', undefined, 'user-1')).toBe(false);
  });

  it('does not notify when the assignee is unchanged', () => {
    expect(shouldNotifyAssignment('user-2', 'user-2', 'user-1')).toBe(false);
  });

  it('does not notify when I assign it to myself', () => {
    expect(shouldNotifyAssignment('user-2', 'user-1', 'user-1')).toBe(false);
  });
});
