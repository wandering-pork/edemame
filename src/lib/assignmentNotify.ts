/**
 * Step 1 · 1G.7 — "assigned to you" notifications. Decides whether a task's
 * `assignedTo` (or a case's `caseOwner`) change is one that should notify
 * the *new* assignee: only when it actually changed, the new assignee is
 * someone real, and that someone isn't the person making the change
 * (nobody needs to be told they assigned themselves something).
 */
export function shouldNotifyAssignment(
  prevAssigneeId: string | undefined,
  nextAssigneeId: string | undefined,
  currentUserId: string,
): boolean {
  if (!nextAssigneeId) return false;
  if (nextAssigneeId === prevAssigneeId) return false;
  if (nextAssigneeId === currentUserId) return false;
  return true;
}
