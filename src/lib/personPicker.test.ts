import { describe, it, expect } from 'vitest';
import {
  buildPersonPickerEntries,
  filterPersonPickerEntries,
  computeWorkload,
  workloadLabel,
  type PersonPickerPerson,
} from './personPicker';
import type { Case, Task } from '../types';

const person = (id: string, name: string, status: PersonPickerPerson['status'], jobTitle: string | null = 'Lawyer'): PersonPickerPerson => ({
  id, name, email: `${id}@example.com`, jobTitle, status,
});

const openCase = (id: string, caseOwner?: string): Case => ({
  id,
  title: `Case ${id}`,
  clientId: 'client-1',
  caseOwner,
  stage: 'preparing',
} as Case);

const closedCase = (id: string, caseOwner?: string): Case => ({
  id,
  title: `Case ${id}`,
  clientId: 'client-1',
  caseOwner,
  stage: 'closed',
  outcome: 'granted',
} as Case);

const openTask = (id: string, assignedTo?: string): Task => ({
  id,
  title: `Task ${id}`,
  description: '',
  date: '2026-01-01',
  status: 'not_started',
  isCompleted: false,
  priorityOrder: 0,
  assignedTo,
} as Task);

const doneTask = (id: string, assignedTo?: string): Task => ({
  id,
  title: `Task ${id}`,
  description: '',
  date: '2026-01-01',
  status: 'done',
  isCompleted: true,
  priorityOrder: 0,
  assignedTo,
} as Task);

describe('computeWorkload', () => {
  it('counts only open cases and open tasks for the given person', () => {
    const cases = [openCase('c1', 'p1'), closedCase('c2', 'p1'), openCase('c3', 'p2')];
    const tasks = [openTask('t1', 'p1'), doneTask('t2', 'p1'), openTask('t3', 'p2')];
    expect(computeWorkload('p1', cases, tasks)).toEqual({ openCaseCount: 1, openTaskCount: 1 });
    expect(computeWorkload('p2', cases, tasks)).toEqual({ openCaseCount: 1, openTaskCount: 1 });
    expect(computeWorkload('p3', cases, tasks)).toEqual({ openCaseCount: 0, openTaskCount: 0 });
  });
});

describe('buildPersonPickerEntries ordering', () => {
  it('puts You first, then the current value, then available/busy/offline', () => {
    const people = [
      person('you', 'You Person', 'available'),
      person('cur', 'Current Person', 'offline'),
      person('avail', 'Available Person', 'available'),
      person('busy', 'Busy Person', 'busy'),
      person('off', 'Offline Person', 'offline'),
    ];
    const entries = buildPersonPickerEntries(people, {
      cases: [], tasks: [], currentUserId: 'you', currentValueId: 'cur',
    });
    expect(entries.map(e => e.id)).toEqual(['you', 'cur', 'avail', 'busy', 'off']);
    expect(entries[0].isYou).toBe(true);
    expect(entries[1].isCurrent).toBe(true);
  });

  it('orders within a bucket by lightest workload first, then name', () => {
    const people = [
      person('heavy', 'Zed Heavy', 'available'),
      person('light', 'Amy Light', 'available'),
      person('mid', 'Mid Person', 'available'),
    ];
    const cases = [openCase('c1', 'heavy'), openCase('c2', 'heavy'), openCase('c3', 'mid')];
    const tasks = [openTask('t1', 'heavy'), openTask('t2', 'mid')];
    const entries = buildPersonPickerEntries(people, { cases, tasks });
    expect(entries.map(e => e.id)).toEqual(['light', 'mid', 'heavy']);
  });

  it('does not double-place the current value when it is also You', () => {
    const people = [person('you', 'You Person', 'available'), person('other', 'Other Person', 'available')];
    const entries = buildPersonPickerEntries(people, { cases: [], tasks: [], currentUserId: 'you', currentValueId: 'you' });
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe('you');
    expect(entries[0].isYou).toBe(true);
    expect(entries[0].isCurrent).toBe(true);
  });
});

describe('filterPersonPickerEntries', () => {
  const people = [
    person('a', 'Alice Amber', 'available', 'Lawyer'),
    person('b', 'Bob Baker', 'available', 'Paralegal'),
    person('c', 'Carol Chen', 'available', 'Case officer'),
  ];
  const entries = buildPersonPickerEntries(people, { cases: [], tasks: [] });

  it('filters case-insensitively by name', () => {
    expect(filterPersonPickerEntries(entries, 'alice').map(e => e.id)).toEqual(['a']);
  });

  it('filters by email', () => {
    expect(filterPersonPickerEntries(entries, 'b@example').map(e => e.id)).toEqual(['b']);
  });

  it('filters by job title', () => {
    expect(filterPersonPickerEntries(entries, 'paralegal').map(e => e.id)).toEqual(['b']);
  });

  it('returns everyone for an empty/whitespace query', () => {
    expect(filterPersonPickerEntries(entries, '   ')).toHaveLength(3);
  });
});

describe('workloadLabel', () => {
  it('pluralizes correctly', () => {
    expect(workloadLabel({ openCaseCount: 1, openTaskCount: 1 })).toBe('1 open case · 1 open task');
    expect(workloadLabel({ openCaseCount: 0, openTaskCount: 5 })).toBe('0 open cases · 5 open tasks');
  });
});
