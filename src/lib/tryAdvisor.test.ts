import { describe, expect, it } from 'vitest';
import {
  buildTrialResponse,
  cleanMatches,
  clientIp,
  hashIp,
  hashToken,
  matchCountFor,
  parseAudience,
  trialLimits,
  trialResponseSchema,
  utcDay,
  type TrialMatch,
} from '../../api/_lib/tryAdvisor';

const three: TrialMatch[] = [
  { visaSubclass: '500', visaName: 'Student', verdict: 'qualifies' },
  { visaSubclass: '485', visaName: 'Temporary Graduate', verdict: 'possibly_qualifies' },
  { visaSubclass: '190', visaName: 'Skilled Nominated', verdict: 'unlikely' },
];

describe('clientIp', () => {
  it('takes the first x-forwarded-for entry', () => {
    expect(clientIp({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1' })).toBe('203.0.113.7');
  });
  it('falls back to x-real-ip, then null', () => {
    expect(clientIp({ 'x-real-ip': '198.51.100.2' })).toBe('198.51.100.2');
    expect(clientIp({})).toBeNull();
  });
  it('handles array headers', () => {
    expect(clientIp({ 'x-forwarded-for': ['203.0.113.9'] })).toBe('203.0.113.9');
  });
});

describe('hashIp', () => {
  it('never contains the IP and changes with the day and salt', () => {
    const a = hashIp('203.0.113.7', '2026-11-26', 'salt');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('203.0.113.7');
    expect(hashIp('203.0.113.7', '2026-11-27', 'salt')).not.toBe(a);
    expect(hashIp('203.0.113.7', '2026-11-26', 'other')).not.toBe(a);
  });
});

describe('utcDay', () => {
  it('is the UTC date', () => {
    expect(utcDay(new Date('2026-11-26T23:30:00-05:00'))).toBe('2026-11-27');
  });
});

describe('trialLimits', () => {
  it('defaults to 3 per IP and 300 a day', () => {
    expect(trialLimits({})).toEqual({ perIp: 3, global: 300 });
  });
  it('reads overrides and ignores junk', () => {
    expect(trialLimits({ TRY_ADVISOR_IP_LIMIT: '5', TRY_ADVISOR_DAILY_LIMIT: 'lots' })).toEqual({ perIp: 5, global: 300 });
  });
});

describe('audience', () => {
  it('accepts only client and self', () => {
    expect(parseAudience('client')).toBe('client');
    expect(parseAudience('self')).toBe('self');
    expect(parseAudience('admin')).toBeNull();
  });
  it('asks Gemini for one match for agents and three for applicants', () => {
    expect(matchCountFor('client')).toBe(1);
    expect(trialResponseSchema('self').properties.matches.maxItems).toBe(3);
  });
});

describe('cleanMatches', () => {
  it('keeps known subclasses and verdicts, drops duplicates and junk', () => {
    const parsed = {
      matches: [
        { visaSubclass: '999', visaName: 'Made up', verdict: 'qualifies' },
        { visaSubclass: '500', visaName: ' Student\n', verdict: 'qualifies', reasons: ['leak'] },
        { visaSubclass: '500', visaName: 'Student again', verdict: 'unlikely' },
        { visaSubclass: '485', visaName: 'Temporary Graduate', verdict: 'maybe' },
        { visaSubclass: '485', visaName: 'Temporary Graduate', verdict: 'possibly_qualifies' },
        { visaSubclass: '190', visaName: 'Skilled Nominated', verdict: 'unlikely' },
      ],
    };
    expect(cleanMatches(parsed, 'self')).toEqual(three);
  });
  it('returns null when there are too few usable matches', () => {
    expect(cleanMatches({ matches: [three[0]] }, 'self')).toBeNull();
    expect(cleanMatches({}, 'client')).toBeNull();
    expect(cleanMatches(null, 'client')).toBeNull();
  });
});

describe('buildTrialResponse', () => {
  it('gives agents exactly the best match, field by field', () => {
    const leaky = [{ ...three[0], reasons: ['why'], gaps: ['what'] } as TrialMatch];
    const body = buildTrialResponse('client', leaky, 2);
    expect(body).toEqual({ audience: 'client', result: three[0], remainingToday: 2 });
    expect(JSON.stringify(body)).not.toMatch(/why|what|reasons|gaps/);
  });

  it('shows applicants all three while the best match is not hidden', () => {
    expect(buildTrialResponse('self', three, 2)).toEqual({
      audience: 'self',
      best: three[0],
      hidden: false,
      others: [three[1], three[2]],
      remainingToday: 2,
    });
  });

  it("never sends an applicant a hidden best match's subclass or name", () => {
    const body = buildTrialResponse('self', three, 1, 'tok', true);
    const json = JSON.stringify(body);
    expect(json).not.toContain('"500"');
    expect(json).not.toContain('Student"');
    expect(body).toEqual({
      audience: 'self',
      best: { verdict: 'qualifies' },
      hidden: true,
      others: [three[1], three[2]],
      rankingToken: 'tok',
      remainingToday: 1,
    });
  });

  it('requires a ranking token when the best match is hidden', () => {
    expect(() => buildTrialResponse('self', three, 1, undefined, true)).toThrow();
  });
});

describe('hashToken', () => {
  it('is a sha256 hex digest', () => {
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});
