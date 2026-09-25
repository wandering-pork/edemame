import { describe, it, expect } from 'vitest';
import { isSampleTeamMember, findSampleTeamMembers, SAMPLE_TEAM_MEMBER_IDS } from './sampleTeamMembers';

describe('isSampleTeamMember', () => {
  it('recognizes each known sample id', () => {
    for (const id of SAMPLE_TEAM_MEMBER_IDS) {
      expect(isSampleTeamMember({ id })).toBe(true);
    }
  });

  it('does not flag a real member, even one with the same name', () => {
    expect(isSampleTeamMember({ id: 'tm-abc123' })).toBe(false);
  });
});

describe('findSampleTeamMembers', () => {
  it('returns only the sample records from a mixed list', () => {
    const members = [
      { id: 'tm-eliza-chen' },
      { id: 'tm-real-person' },
      { id: 'tm-priya-singh' },
    ];
    expect(findSampleTeamMembers(members).map(m => m.id)).toEqual(['tm-eliza-chen', 'tm-priya-singh']);
  });

  it('returns an empty array when there are no sample records', () => {
    expect(findSampleTeamMembers([{ id: 'tm-real-person' }])).toEqual([]);
  });
});
