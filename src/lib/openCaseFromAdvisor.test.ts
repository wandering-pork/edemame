import { describe, it, expect, vi } from 'vitest';
import { openCaseFromAdvisor, OpenCaseDeps, OpenCaseParams } from './openCaseFromAdvisor';
import type { Client, Task, WorkflowTemplate } from '../types';

const existingClient: Client = {
  id: 'client-1',
  name: 'Jane Doe',
  dob: '1990-01-01',
  phone: '',
  email: '',
  address: '',
};

const template: WorkflowTemplate = {
  id: 'tpl-500',
  title: 'Student (Subclass 500)',
  description: 'Student visa workflow',
  visaSubclass: '500',
  steps: [{ title: 'CoE', description: 'Get CoE' }],
} as WorkflowTemplate;

function makeParams(overrides: Partial<OpenCaseParams> = {}): OpenCaseParams {
  return {
    client: { kind: 'existing', id: 'client-1' },
    templateId: 'tpl-500',
    title: 'Student (Subclass 500) - Jane Doe',
    generateTasks: true,
    visaSubclass: '500',
    visaName: 'Student',
    caseDescription: 'summary',
    gapTasks: false,
    gaps: [],
    onProgress: vi.fn(),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<OpenCaseDeps> = {}) {
  let n = 0;
  const calls: string[] = [];
  const base = {
    clients: [existingClient],
    templates: [template],
    generateTasks: vi.fn<OpenCaseDeps['generateTasks']>(async () => {
      calls.push('generateTasks');
      return [{ title: 'AI task', description: 'desc', date: '2026-10-01' }] as Partial<Task>[];
    }),
    addClient: vi.fn<OpenCaseDeps['addClient']>(async () => { calls.push('addClient'); }),
    deleteClient: vi.fn<OpenCaseDeps['deleteClient']>(async () => { calls.push('deleteClient'); }),
    createCase: vi.fn<OpenCaseDeps['createCase']>(async () => { calls.push('createCase'); }),
    makeId: () => `id-${++n}`,
    today: () => '2026-09-24',
    now: () => '2026-09-24T01:00:00.000Z',
  };
  // Overrides are always vi.fn mocks (or plain data), so keep the mock-typed shape.
  const deps = { ...base, ...overrides } as typeof base;
  return { deps, calls };
}

const newClientChoice = {
  kind: 'new' as const,
  fullName: 'John Smith',
  dob: '1985-05-05',
  nationality: 'Philippines',
  email: 'john@example.com',
  inAustralia: true,
  currentVisaStatus: 'Subclass 600',
};

describe('openCaseFromAdvisor', () => {
  it('runs plan → client → case in order and reports progress stages', async () => {
    const onProgress = vi.fn();
    const { deps, calls } = makeDeps();
    await openCaseFromAdvisor(makeParams({ client: newClientChoice, onProgress }), deps);

    expect(calls).toEqual(['generateTasks', 'addClient', 'createCase']);
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual(['plan', 'client', 'finalizing']);
  });

  it('uses the existing client without creating one', async () => {
    const { deps } = makeDeps();
    const result = await openCaseFromAdvisor(makeParams(), deps);

    expect(deps.addClient).not.toHaveBeenCalled();
    expect(result.clientId).toBe('client-1');
    const [, savedCase] = deps.createCase.mock.calls[0];
    expect(savedCase.clientId).toBe('client-1');
  });

  it('throws without side effects when the chosen existing client no longer exists', async () => {
    const { deps } = makeDeps({ clients: [] });
    await expect(
      openCaseFromAdvisor(makeParams({ generateTasks: false }), deps)
    ).rejects.toThrow(/no longer exists/);
    expect(deps.addClient).not.toHaveBeenCalled();
    expect(deps.createCase).not.toHaveBeenCalled();
  });

  it('creates a new applicant client with contact details and notes', async () => {
    const { deps } = makeDeps();
    await openCaseFromAdvisor(makeParams({ client: newClientChoice }), deps);

    const [client] = deps.addClient.mock.calls[0];
    expect(client).toMatchObject({
      name: 'John Smith',
      dob: '1985-05-05',
      nationality: 'Philippines',
      email: 'john@example.com',
      phone: '',
      role: 'applicant',
      notes: 'In Australia: Yes\nCurrent visa status: Subclass 600',
    });
  });

  it('builds the case with template, subclass, local start date and createdAt', async () => {
    const { deps } = makeDeps();
    const result = await openCaseFromAdvisor(makeParams(), deps);

    const [, savedCase] = deps.createCase.mock.calls[0];
    expect(savedCase).toEqual({
      id: result.caseId,
      clientId: 'client-1',
      title: 'Student (Subclass 500) - Jane Doe',
      description: 'summary',
      templateId: 'tpl-500',
      stage: 'draft',
      startDate: '2026-09-24',
      createdAt: '2026-09-24T01:00:00.000Z',
      visaSubclass: '500',
    });
  });

  it('passes the template to AI generation', async () => {
    const { deps } = makeDeps();
    await openCaseFromAdvisor(makeParams(), deps);

    expect(deps.generateTasks).toHaveBeenCalledWith(
      'summary', 'Student visa workflow', '2026-09-24', '500', 'Student (Subclass 500)', template.steps, undefined
    );
  });

  it('with no template, saves an empty templateId and still generates tasks', async () => {
    const { deps } = makeDeps();
    await openCaseFromAdvisor(makeParams({ templateId: null }), deps);

    const [, savedCase] = deps.createCase.mock.calls[0];
    expect(savedCase.templateId).toBe('');
    expect(savedCase.visaSubclass).toBe('500');
    expect(deps.generateTasks).toHaveBeenCalledWith('summary', '', '2026-09-24', undefined, undefined, undefined, undefined);
  });

  it('skips the plan stage entirely when AI generation is off', async () => {
    const onProgress = vi.fn();
    const { deps } = makeDeps();
    await openCaseFromAdvisor(makeParams({ generateTasks: false, onProgress }), deps);

    expect(deps.generateTasks).not.toHaveBeenCalled();
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual(['client', 'finalizing']);
    const [tasks] = deps.createCase.mock.calls[0];
    expect(tasks).toEqual([]);
  });

  it('still creates the case when AI generation fails, and reports it', async () => {
    const { deps } = makeDeps({ generateTasks: vi.fn(async () => { throw new Error('Gemini down'); }) });
    const result = await openCaseFromAdvisor(makeParams(), deps);

    expect(result.aiGenerationFailed).toBe(true);
    expect(deps.createCase).toHaveBeenCalledTimes(1);
    const [tasks] = deps.createCase.mock.calls[0];
    expect(tasks).toEqual([]);
  });

  it('reports aiGenerationFailed=false on success', async () => {
    const { deps } = makeDeps();
    const result = await openCaseFromAdvisor(makeParams(), deps);
    expect(result.aiGenerationFailed).toBe(false);
  });

  it('puts gap tasks before AI tasks and excludes gaps from the AI prompt', async () => {
    const { deps } = makeDeps();
    const gaps = ['No skills assessment', 'English test expired'];
    const result = await openCaseFromAdvisor(makeParams({ gapTasks: true, gaps }), deps);

    expect(deps.generateTasks.mock.calls[0][6]).toEqual(gaps);
    const [tasks] = deps.createCase.mock.calls[0];
    expect(tasks.map((t: Task) => [t.title, t.priorityOrder, t.generatedByAi])).toEqual([
      ['Address gap: No skills assessment', 0, false],
      ['Address gap: English test expired', 1, false],
      ['AI task', 2, true],
    ]);
    expect(tasks.every((t: Task) => t.caseId === result.caseId)).toBe(true);
  });

  it('ignores gaps when gap tasks are off', async () => {
    const { deps } = makeDeps();
    await openCaseFromAdvisor(makeParams({ gapTasks: false, gaps: ['Some gap'] }), deps);

    expect(deps.generateTasks.mock.calls[0][6]).toBeUndefined();
    const [tasks] = deps.createCase.mock.calls[0];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].generatedByAi).toBe(true);
  });

  it('fills defaults for incomplete AI tasks', async () => {
    const { deps } = makeDeps({ generateTasks: vi.fn(async () => [{}] as Partial<Task>[]) });
    await openCaseFromAdvisor(makeParams(), deps);

    const [tasks] = deps.createCase.mock.calls[0];
    expect(tasks[0]).toMatchObject({ title: 'Untitled Task', description: '', date: '2026-09-24', isCompleted: false });
  });

  it('rolls back a newly created client when saving the case fails', async () => {
    const saveError = new Error('PostgREST rejected insert');
    const { deps, calls } = makeDeps({ createCase: vi.fn(async () => { throw saveError; }) });

    await expect(openCaseFromAdvisor(makeParams({ client: newClientChoice }), deps)).rejects.toBe(saveError);
    const [created] = deps.addClient.mock.calls[0];
    expect(deps.deleteClient).toHaveBeenCalledWith(created.id);
    expect(calls).toEqual(['generateTasks', 'addClient', 'deleteClient']);
  });

  it('never deletes an existing client when saving the case fails', async () => {
    const { deps } = makeDeps({ createCase: vi.fn(async () => { throw new Error('fail'); }) });

    await expect(openCaseFromAdvisor(makeParams(), deps)).rejects.toThrow('fail');
    expect(deps.deleteClient).not.toHaveBeenCalled();
  });

  it('surfaces the original error even if the rollback also fails', async () => {
    const saveError = new Error('save failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = makeDeps({
      createCase: vi.fn(async () => { throw saveError; }),
      deleteClient: vi.fn(async () => { throw new Error('delete failed'); }),
    });

    await expect(openCaseFromAdvisor(makeParams({ client: newClientChoice }), deps)).rejects.toBe(saveError);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does not create the client or case if adding the client fails', async () => {
    const { deps } = makeDeps({ addClient: vi.fn(async () => { throw new Error('disk full'); }) });

    await expect(openCaseFromAdvisor(makeParams({ client: newClientChoice }), deps)).rejects.toThrow('disk full');
    expect(deps.createCase).not.toHaveBeenCalled();
    expect(deps.deleteClient).not.toHaveBeenCalled();
  });
});
