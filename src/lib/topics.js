// CRUD for ss_topics. Topics flow through four states:
//
//   possible_future → picked_for_next → active → past
//
// State transitions:
//   - Pastor (or rotation) moves a possible_future topic to
//     picked_for_next, stamping picked_by_member_id.
//   - On the upcoming Sunday morning, picked_for_next → active
//     (handled by the lesson workspace when the class meets).
//   - After the class, active → past (handled by the lesson finalize).
//   - Any state → possible_future ("revert") is allowed via setStatus.

import { supabase, withTimeout } from './supabase';

export const TOPIC_STATUSES = [
  'possible_future',
  'picked_for_next',
  'active',
  'past',
];

export async function listTopics(ownerUserId, { status } = {}) {
  if (!ownerUserId) return [];
  let q = supabase
    .from('ss_topics')
    .select('*, picked_by:picked_by_member_id(id, display_name)')
    .eq('owner_user_id', ownerUserId);
  if (status) {
    q = q.eq('status', status);
  }
  // Sort: possible_future by queue_sort asc (planned order), past by
  // discussed_on desc, others by created_at desc.
  if (status === 'possible_future') q = q.order('queue_sort', { ascending: true });
  else if (status === 'past') q = q.order('discussed_on', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  else q = q.order('created_at', { ascending: false });
  const { data, error } = await withTimeout(q);
  if (error) throw error;
  return data || [];
}

export async function createTopic(ownerUserId, text, opts = {}) {
  const clean = (text || '').trim();
  if (!clean) throw new Error('Topic text is required');
  const payload = {
    owner_user_id: ownerUserId,
    text: clean,
    status: opts.status || 'possible_future',
    picked_by_member_id: opts.picked_by_member_id || null,
    discussed_on: opts.discussed_on || null,
    submitted_by_name: opts.submitted_by_name || null,
    notes: opts.notes || null,
  };
  if (typeof opts.queue_sort === 'number') payload.queue_sort = opts.queue_sort;
  const { data, error } = await withTimeout(
    supabase.from('ss_topics').insert(payload).select('*').single()
  );
  if (error) throw error;
  return data;
}

/**
 * Bulk insert seed topics on first-run setup. Skips entries already
 * present (case-insensitive trimmed text match) to make re-runs safe.
 */
export async function bulkCreateTopics(ownerUserId, items) {
  if (!Array.isArray(items) || items.length === 0)
    return { inserted: 0, skipped: 0 };
  const { data: existing, error: exErr } = await withTimeout(
    supabase
      .from('ss_topics')
      .select('text')
      .eq('owner_user_id', ownerUserId)
  );
  if (exErr) throw exErr;
  const existingKeys = new Set(
    (existing || []).map((r) => (r.text || '').trim().toLowerCase())
  );
  const toInsert = [];
  let skipped = 0;
  let i = 0;
  for (const item of items) {
    const text = (item.text || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    existingKeys.add(key);
    toInsert.push({
      owner_user_id: ownerUserId,
      text,
      status: item.status || 'possible_future',
      // queue_sort spreads across input order so the seeded list shows
      // up in the same order the seed file lists them.
      queue_sort: typeof item.queue_sort === 'number' ? item.queue_sort : i,
    });
    i++;
  }
  if (toInsert.length === 0) return { inserted: 0, skipped };
  // Insert in chunks to avoid hitting payload limits on big imports.
  let inserted = 0;
  const CHUNK = 100;
  for (let start = 0; start < toInsert.length; start += CHUNK) {
    const slice = toInsert.slice(start, start + CHUNK);
    const { error } = await withTimeout(supabase.from('ss_topics').insert(slice));
    if (error) throw error;
    inserted += slice.length;
  }
  return { inserted, skipped };
}

export async function updateTopic(topicId, patch) {
  const update = { ...patch };
  if ('text' in update) update.text = (update.text || '').trim();
  const { data, error } = await withTimeout(
    supabase.from('ss_topics').update(update).eq('id', topicId).select('*').single()
  );
  if (error) throw error;
  return data;
}

export async function deleteTopic(topicId) {
  const { error } = await withTimeout(
    supabase.from('ss_topics').delete().eq('id', topicId)
  );
  if (error) throw error;
}

export async function setStatus(topicId, status, extra = {}) {
  if (!TOPIC_STATUSES.includes(status))
    throw new Error(`Invalid topic status: ${status}`);
  return updateTopic(topicId, { status, ...extra });
}
