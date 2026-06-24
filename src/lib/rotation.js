// Pick rotation. Pure functions over the roster + present set + the
// most-recent picked_by record. Stored state lives in ss_topics
// (picked_by_member_id), so the "rotation cursor" is whoever picked
// most recently — there's no separate cursor table.
//
// Rules:
//   - We go in alphabetical order (by sort_key) through PRESENT members
//     only. Absent members do not advance the cursor — they get skipped
//     today; when they next attend, the rotation will pass them in
//     alpha order from wherever the cursor currently sits.
//   - The pastor can manually override:
//       startFrom(memberId)   — set the cursor as if `memberId` just
//                               picked, so the next-up is the member
//                               after them in alpha order among present.
//       advanceWithoutPick()  — skip the current next-up (mark them as
//                               "had their turn but didn't pick"). Not
//                               typically used; expressed as a manual
//                               cursor bump.
//       markPicked(memberId)  — record that this member just picked
//                               their topic; rotation advances past them.
//
// findNextPicker(present, members, lastPickerId) returns the member who
// should pick next OR null if there are no present members.

/**
 * @param {string} lastPickerSortKey  sort_key of whoever picked most recently.
 *   null when the rotation hasn't started yet (very first pick).
 * @param {Array<{id, sort_key, active}>} members  full roster (active only typically).
 * @param {Set<string>} presentIds  member.id values present today.
 * @returns {object|null} the member who should pick next, or null.
 */
export function findNextPicker(lastPickerSortKey, members, presentIds) {
  const active = (members || []).filter((m) => m.active);
  const present = active
    .filter((m) => presentIds.has(m.id))
    .sort((a, b) =>
      a.sort_key < b.sort_key ? -1 : a.sort_key > b.sort_key ? 1 : 0
    );
  if (present.length === 0) return null;
  if (!lastPickerSortKey) {
    // No previous pick on file — start from the alpha-first present member.
    return present[0];
  }
  // Walk to the first present member whose sort_key is strictly greater
  // than the last picker's sort_key.
  for (const m of present) {
    if (m.sort_key > lastPickerSortKey) return m;
  }
  // Wrapped around — first present member is next.
  return present[0];
}

/**
 * Given the full topics list, find the most-recently picked topic's
 * picked_by member. This is what the rotation cursor latches onto.
 * Returns { sortKey, memberId } or { sortKey: null, memberId: null }
 * if no pick has ever been recorded.
 *
 * "Most recently picked" = topic with highest discussed_on, then
 * highest updated_at, where status is past, active, or picked_for_next.
 */
export function findLastPickerFromTopics(topics, members) {
  if (!Array.isArray(topics) || topics.length === 0)
    return { sortKey: null, memberId: null };
  const memberById = new Map((members || []).map((m) => [m.id, m]));
  const candidates = topics
    .filter((t) => t.picked_by_member_id && memberById.has(t.picked_by_member_id))
    .filter((t) => ['past', 'active', 'picked_for_next'].includes(t.status))
    .sort((a, b) => {
      // discussed_on desc, then created_at desc
      const aDate = a.discussed_on || '';
      const bDate = b.discussed_on || '';
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      const aCreated = a.created_at || '';
      const bCreated = b.created_at || '';
      return aCreated < bCreated ? 1 : -1;
    });
  if (candidates.length === 0) return { sortKey: null, memberId: null };
  const top = candidates[0];
  const member = memberById.get(top.picked_by_member_id);
  return { sortKey: member?.sort_key || null, memberId: top.picked_by_member_id };
}

/**
 * One-shot helper used by the dashboard: given roster + topics + today's
 * presents, return the recommended next picker (or null + a reason).
 *
 * Optionally accepts `overrideLastPickerId` — when the pastor uses
 * "Start rotation from X", X is treated as the most-recent picker so
 * the alpha-next present member becomes the recommendation.
 */
export function recommendNextPicker({
  members,
  topics,
  presentIds,
  overrideLastPickerId = null,
}) {
  let lastPickerSortKey;
  if (overrideLastPickerId) {
    const m = (members || []).find((x) => x.id === overrideLastPickerId);
    lastPickerSortKey = m?.sort_key || null;
  } else {
    ({ sortKey: lastPickerSortKey } = findLastPickerFromTopics(topics, members));
  }
  const next = findNextPicker(lastPickerSortKey, members, presentIds);
  if (next) return { next, reason: null };
  if (!presentIds || presentIds.size === 0)
    return { next: null, reason: 'No members marked present today.' };
  return { next: null, reason: 'No active members are present.' };
}
