import { describe, it, expect } from 'vitest';
import {
  normalizeCase,
  evaluateTransition,
  outcomeRequired,
  isCaseClosed,
  caseStageGroup,
  deriveLegacyStatus,
} from './caseStage';
import type { Case } from '../types';

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'case-1',
    clientId: 'client-1',
    title: 'Test case',
    description: '',
    templateId: 'tpl-1',
    stage: 'draft',
    startDate: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeCase', () => {
  it('leaves an already-staged case untouched', () => {
    const c = makeCase({ stage: 'lodged' });
    expect(normalizeCase(c)).toBe(c);
  });

  it('maps legacy open/in_progress to preparing', () => {
    const open = { ...makeCase(), stage: undefined as any, status: 'open' as const };
    expect(normalizeCase(open).stage).toBe('preparing');
    expect(normalizeCase(open).onHold).toBeUndefined();

    const inProgress = { ...makeCase(), stage: undefined as any, status: 'in_progress' as const };
    expect(normalizeCase(inProgress).stage).toBe('preparing');
  });

  it('maps legacy on_hold to preparing + onHold', () => {
    const c = { ...makeCase(), stage: undefined as any, status: 'on_hold' as const };
    const n = normalizeCase(c);
    expect(n.stage).toBe('preparing');
    expect(n.onHold).toBe(true);
  });

  it('maps legacy closed to closed with no outcome', () => {
    const c = { ...makeCase(), stage: undefined as any, status: 'closed' as const };
    const n = normalizeCase(c);
    expect(n.stage).toBe('closed');
    expect(n.outcome).toBeUndefined();
  });

  it('defaults a case missing both stage and status to preparing', () => {
    const c = { ...makeCase(), stage: undefined as any, status: undefined };
    expect(normalizeCase(c).stage).toBe('preparing');
  });
});

describe('evaluateTransition', () => {
  it('flags a move to an earlier stage as backward', () => {
    expect(evaluateTransition('lodged', 'preparing').isBackward).toBe(true);
    expect(evaluateTransition('preparing', 'lodged').isBackward).toBe(false);
  });

  it('does not flag lodged <-> info_requested as backward either way', () => {
    expect(evaluateTransition('lodged', 'info_requested').isBackward).toBe(false);
    expect(evaluateTransition('info_requested', 'lodged').isBackward).toBe(false);
  });

  it('flags moving to closed as requiring an outcome', () => {
    expect(evaluateTransition('lodged', 'closed').requiresOutcome).toBe(true);
    expect(evaluateTransition('lodged', 'decision').requiresOutcome).toBe(false);
  });

  it('flags reopening a closed case as backward', () => {
    expect(evaluateTransition('closed', 'preparing').isBackward).toBe(true);
  });
});

describe('outcomeRequired / isCaseClosed', () => {
  it('requires an outcome only for closed', () => {
    expect(outcomeRequired('closed')).toBe(true);
    expect(outcomeRequired('decision')).toBe(false);
  });

  it('isCaseClosed reads the stage', () => {
    expect(isCaseClosed(makeCase({ stage: 'closed' }))).toBe(true);
    expect(isCaseClosed(makeCase({ stage: 'lodged' }))).toBe(false);
  });
});

describe('caseStageGroup', () => {
  it('groups pre-lodgement stages', () => {
    for (const s of ['draft', 'assessment', 'engaged', 'preparing', 'ready_to_lodge'] as const) {
      expect(caseStageGroup(s)).toBe('pre_lodgement');
    }
  });

  it('groups with-department stages', () => {
    for (const s of ['lodged', 'info_requested', 'decision'] as const) {
      expect(caseStageGroup(s)).toBe('with_department');
    }
  });

  it('groups closed on its own', () => {
    expect(caseStageGroup('closed')).toBe('closed');
  });
});

describe('deriveLegacyStatus', () => {
  it('derives closed', () => {
    expect(deriveLegacyStatus({ stage: 'closed' })).toBe('closed');
  });

  it('derives on_hold when onHold is set, regardless of stage', () => {
    expect(deriveLegacyStatus({ stage: 'preparing', onHold: true })).toBe('on_hold');
  });

  it('derives open for draft/assessment', () => {
    expect(deriveLegacyStatus({ stage: 'draft' })).toBe('open');
    expect(deriveLegacyStatus({ stage: 'assessment' })).toBe('open');
  });

  it('derives in_progress for everything else', () => {
    expect(deriveLegacyStatus({ stage: 'preparing' })).toBe('in_progress');
    expect(deriveLegacyStatus({ stage: 'lodged' })).toBe('in_progress');
    expect(deriveLegacyStatus({ stage: 'decision' })).toBe('in_progress');
  });
});
