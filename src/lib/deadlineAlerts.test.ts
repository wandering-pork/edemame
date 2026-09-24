import { describe, it, expect } from 'vitest';
import type { Deadline } from '../types';
import { buildDeadlineAlerts, deadlineAlertId } from './deadlineAlerts';

const today = new Date('2026-06-15T00:00:00');

function makeDeadline(overrides: Partial<Deadline>): Deadline {
  return {
    id: 'd1',
    kind: 'other',
    title: 'Bridging visa expiry',
    dueDate: '2026-06-15',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildDeadlineAlerts', () => {
  it('creates no alert for a deadline more than 14 days out', () => {
    const alerts = buildDeadlineAlerts([makeDeadline({ dueDate: '2026-07-01' })], [], today);
    expect(alerts).toHaveLength(0);
  });

  it('creates only the 14-day alert when 13 days remain', () => {
    const alerts = buildDeadlineAlerts([makeDeadline({ dueDate: '2026-06-28' })], [], today);
    expect(alerts.map(a => a.id)).toEqual([deadlineAlertId('d1', 14)]);
  });

  it('creates the 14- and 7-day alerts when 6 days remain and neither exists yet', () => {
    const alerts = buildDeadlineAlerts([makeDeadline({ dueDate: '2026-06-21' })], [], today);
    expect(alerts.map(a => a.id).sort()).toEqual([deadlineAlertId('d1', 14), deadlineAlertId('d1', 7)].sort());
  });

  it('creates all three alerts when 1 day remains and none exist yet', () => {
    const alerts = buildDeadlineAlerts([makeDeadline({ dueDate: '2026-06-16' })], [], today);
    expect(alerts.map(a => a.id).sort()).toEqual(
      [deadlineAlertId('d1', 14), deadlineAlertId('d1', 7), deadlineAlertId('d1', 2)].sort(),
    );
  });

  it('does not recreate an alert that already exists', () => {
    const existing = [{ id: deadlineAlertId('d1', 14) }];
    const alerts = buildDeadlineAlerts([makeDeadline({ dueDate: '2026-06-21' })], existing, today);
    expect(alerts.map(a => a.id)).toEqual([deadlineAlertId('d1', 7)]);
  });

  it('does not alert for an overdue deadline (surfaced as "Missed?" instead)', () => {
    const alerts = buildDeadlineAlerts([makeDeadline({ dueDate: '2026-06-01' })], [], today);
    expect(alerts).toHaveLength(0);
  });

  it('ignores non-open deadlines', () => {
    const alerts = buildDeadlineAlerts([makeDeadline({ dueDate: '2026-06-16', status: 'met' })], [], today);
    expect(alerts).toHaveLength(0);
  });
});
