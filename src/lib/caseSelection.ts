/**
 * Multi-select rules for the Case Manager list. Pure, so the list component
 * only holds a Set of ids and the last clicked id.
 */

/**
 * Toggles `id`. With `range` (shift-click) and a previous click still in
 * view, every row between the two takes the clicked row's new state.
 */
export function toggleSelection(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
  id: string,
  anchorId: string | null,
  range: boolean,
): Set<string> {
  const next = new Set(selected);
  const turnOn = !selected.has(id);
  const from = anchorId ? visibleIds.indexOf(anchorId) : -1;
  const to = visibleIds.indexOf(id);
  const ids = range && from !== -1 && to !== -1
    ? visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1)
    : [id];
  for (const each of ids) {
    if (turnOn) next.add(each); else next.delete(each);
  }
  return next;
}

/**
 * Drops ids that are no longer visible (filtered out, or deleted), so a
 * bulk action never touches a case the user can't see. Returns the same Set
 * when nothing changed.
 */
export function pruneSelection(selected: Set<string>, visibleIds: readonly string[]): Set<string> {
  const visible = new Set(visibleIds);
  if ([...selected].every(id => visible.has(id))) return selected;
  return new Set([...selected].filter(id => visible.has(id)));
}

/** "Select all" when not everything visible is selected, otherwise "clear". */
export function toggleAll(selected: ReadonlySet<string>, visibleIds: readonly string[]): Set<string> {
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  return allSelected ? new Set() : new Set(visibleIds);
}
