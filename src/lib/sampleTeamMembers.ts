import type { TeamMember } from '../types';

/**
 * Fictional team members seeded by an earlier version of the app
 * (`lib/seedData.ts`'s now-removed `seedDefaultTeam()`, introduced in
 * "Add team collaboration features with IBM Plex fonts" and dropped in
 * Step 1 · 1F — see root CLAUDE.md's "No more fake team"). A local folder
 * linked before that cutover can still have these three JSON files sitting
 * in `team-members/`, since local mode has no migration path. Identified by
 * id (stable, unlike name — a real person could coincidentally share one of
 * these names).
 */
export const SAMPLE_TEAM_MEMBER_IDS = ['tm-eliza-chen', 'tm-marcus-okafor', 'tm-priya-singh'] as const;

export function isSampleTeamMember(member: Pick<TeamMember, 'id'>): boolean {
  return (SAMPLE_TEAM_MEMBER_IDS as readonly string[]).includes(member.id);
}

/** Every sample record present in a given list, in no particular order. */
export function findSampleTeamMembers(members: Pick<TeamMember, 'id'>[]): Pick<TeamMember, 'id'>[] {
  return members.filter(isSampleTeamMember);
}
