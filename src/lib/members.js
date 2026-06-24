// CRUD for ss_members. The pastor manages the roster — class members
// are not themselves users of the system.
//
// sort_key is computed here (lowercased trimmed display_name) so the
// rotation walk is deterministic and case-insensitive without
// pushing that logic down into the DB.

import { supabase, withTimeout } from './supabase';

export function computeSortKey(displayName) {
  return (displayName || '').trim().toLowerCase();
}

export async function listMembers(ownerUserId, { includeInactive = false } = {}) {
  if (!ownerUserId) return [];
  let q = supabase
    .from('ss_members')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .order('sort_key', { ascending: true });
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await withTimeout(q);
  if (error) throw error;
  return data || [];
}

export async function createMember(ownerUserId, displayName, opts = {}) {
  const name = (displayName || '').trim();
  if (!name) throw new Error('Name is required');
  const { data, error } = await withTimeout(
    supabase
      .from('ss_members')
      .insert({
        owner_user_id: ownerUserId,
        display_name: name,
        sort_key: computeSortKey(name),
        active: opts.active !== false,
        notes: opts.notes || null,
      })
      .select('*')
      .single()
  );
  if (error) throw error;
  return data;
}

/**
 * Bulk insert — used by the seed-roster utility on first run. Skips
 * names that already exist (case-insensitive match on display_name).
 * Returns { inserted, skipped }.
 */
export async function bulkCreateMembers(ownerUserId, names) {
  if (!Array.isArray(names) || names.length === 0)
    return { inserted: 0, skipped: 0 };
  const existing = await listMembers(ownerUserId, { includeInactive: true });
  const existingKeys = new Set(existing.map((m) => m.sort_key));
  const toInsert = [];
  const skipped = [];
  for (const raw of names) {
    const name = (raw || '').trim();
    if (!name) continue;
    const key = computeSortKey(name);
    if (existingKeys.has(key)) {
      skipped.push(name);
      continue;
    }
    existingKeys.add(key); // dedupe within the input list too
    toInsert.push({
      owner_user_id: ownerUserId,
      display_name: name,
      sort_key: key,
      active: true,
    });
  }
  if (toInsert.length === 0) return { inserted: 0, skipped: skipped.length };
  const { error } = await withTimeout(supabase.from('ss_members').insert(toInsert));
  if (error) throw error;
  return { inserted: toInsert.length, skipped: skipped.length };
}

export async function updateMember(memberId, patch) {
  // Recompute sort_key if display_name changed.
  const update = { ...patch };
  if ('display_name' in update) {
    update.display_name = (update.display_name || '').trim();
    update.sort_key = computeSortKey(update.display_name);
  }
  const { data, error } = await withTimeout(
    supabase
      .from('ss_members')
      .update(update)
      .eq('id', memberId)
      .select('*')
      .single()
  );
  if (error) throw error;
  return data;
}

export async function deleteMember(memberId) {
  const { error } = await withTimeout(
    supabase.from('ss_members').delete().eq('id', memberId)
  );
  if (error) throw error;
}

/**
 * Soft-deactivate (preserves history). Use this instead of delete
 * when a member has attendance / pick records you want to keep.
 */
export async function deactivateMember(memberId) {
  return updateMember(memberId, { active: false });
}

export async function reactivateMember(memberId) {
  return updateMember(memberId, { active: true });
}
