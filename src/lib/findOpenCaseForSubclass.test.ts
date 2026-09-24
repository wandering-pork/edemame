import { describe, it, expect } from 'vitest';
import { findOpenCaseForSubclass } from './findOpenCaseForSubclass';
import type { Case, WorkflowTemplate } from '../types';

function makeTemplate(overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate {
  return {
    id: 'tpl-1',
    title: 'Student Visa',
    description: '',
    visaSubclass: '500',
    ...overrides,
  };
}

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'case-1',
    clientId: 'client-1',
    title: 'Case',
    description: '',
    templateId: 'tpl-1',
    status: 'open',
    startDate: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('findOpenCaseForSubclass', () => {
  it('finds a non-closed case for the client whose template matches the subclass', () => {
    const templates = [makeTemplate({ id: 'tpl-1', visaSubclass: '500' })];
    const target = makeCase({ id: 'case-1', clientId: 'client-1', templateId: 'tpl-1', status: 'open' });
    const cases = [target];
    expect(findOpenCaseForSubclass(cases, templates, 'client-1', '500')).toBe(target);
  });

  it('matches a multi-subclass template split on "/"', () => {
    const templates = [makeTemplate({ id: 'tpl-820-801', visaSubclass: '820/801' })];
    const target = makeCase({ id: 'case-1', clientId: 'client-1', templateId: 'tpl-820-801' });
    const cases = [target];
    expect(findOpenCaseForSubclass(cases, templates, 'client-1', '801')).toBe(target);
  });

  it('ignores cases for a different client', () => {
    const templates = [makeTemplate({ id: 'tpl-1', visaSubclass: '500' })];
    const cases = [makeCase({ clientId: 'someone-else', templateId: 'tpl-1' })];
    expect(findOpenCaseForSubclass(cases, templates, 'client-1', '500')).toBeNull();
  });

  it('ignores closed cases', () => {
    const templates = [makeTemplate({ id: 'tpl-1', visaSubclass: '500' })];
    const cases = [makeCase({ clientId: 'client-1', templateId: 'tpl-1', status: 'closed' })];
    expect(findOpenCaseForSubclass(cases, templates, 'client-1', '500')).toBeNull();
  });

  it('ignores cases whose template does not match the subclass', () => {
    const templates = [makeTemplate({ id: 'tpl-1', visaSubclass: '190' })];
    const cases = [makeCase({ clientId: 'client-1', templateId: 'tpl-1' })];
    expect(findOpenCaseForSubclass(cases, templates, 'client-1', '500')).toBeNull();
  });

  it('ignores cases whose templateId no longer resolves to a template', () => {
    const templates: WorkflowTemplate[] = [];
    const cases = [makeCase({ clientId: 'client-1', templateId: 'missing-tpl' })];
    expect(findOpenCaseForSubclass(cases, templates, 'client-1', '500')).toBeNull();
  });

  it('returns null when there are no cases at all', () => {
    expect(findOpenCaseForSubclass([], [], 'client-1', '500')).toBeNull();
  });
});
