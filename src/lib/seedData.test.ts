import { describe, it, expect } from 'vitest';
import { seedDefaultTemplates } from './seedData';
import { scheduleFromTemplate } from './scheduleFromTemplate';

describe('seedDefaultTemplates timing (1E)', () => {
  const templates = seedDefaultTemplates();

  it('produces 10 system templates, one per Visa Advisor subclass', () => {
    expect(templates).toHaveLength(10);
  });

  it.each(templates.map(t => [t.id, t] as const))('%s: version 1, unreviewed, schedules with no errors and unique step keys', (_id, template) => {
    expect(template.version).toBe(1);
    expect(template.timingVerified).toBe(false);
    expect(template.steps && template.steps.length).toBeGreaterThan(0);

    const keys = template.steps!.map(s => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    keys.forEach(key => expect(key).toBeTruthy());

    const { items, errors } = scheduleFromTemplate(template.steps!, '2026-01-01', {});
    expect(errors).toEqual([]);
    expect(items).toHaveLength(template.steps!.length);
    // No step lands on the case's start date itself (see the "no day-0" rule
    // and the file-header note in seedData.ts on why every first step is
    // offsetDays: 1, not 0).
    items.forEach(item => expect(item.date > '2026-01-01').toBe(true));
  });

  it('marks the invitation-window lodge step fixed for the points-tested subclasses (189/190/491)', () => {
    for (const id of ['tpl-189', 'tpl-190', 'tpl-490']) {
      const template = templates.find(t => t.id === id)!;
      const lodge = template.steps!.find(s => s.key === 'visa-application')!;
      expect(lodge.timing?.fixed).toBe(true);
      expect(lodge.timing?.anchor).toEqual({ type: 'deadline', kind: 'invitation_window' });
      expect(lodge.timing?.offsetDays).toBe(60);
      expect(lodge.isGate).toBe(true);
    }
  });

  it('marks the nomination-gated lodge step fixed for the employer-sponsored subclasses (482/186)', () => {
    const t482 = templates.find(t => t.id === 'tpl-482')!;
    const lodge482 = t482.steps!.find(s => s.key === 'visa-application')!;
    expect(lodge482.timing?.fixed).toBe(true);
    expect(lodge482.timing?.anchor).toEqual({ type: 'step', stepKey: 'nomination-lodgement', edge: 'done' });

    const t186 = templates.find(t => t.id === 'tpl-186')!;
    const lodge186 = t186.steps!.find(s => s.key === 'visa-application')!;
    expect(lodge186.timing?.fixed).toBe(true);
    expect(lodge186.timing?.anchor).toEqual({ type: 'step', stepKey: 'nomination-approval-wait', edge: 'done' });
  });

  it('keeps the tpl-490 id for backward compatibility while the subclass/title are corrected to 491', () => {
    const template = templates.find(t => t.id === 'tpl-490')!;
    expect(template.visaSubclass).toBe('491');
    expect(template.title).toContain('491');
  });
});
