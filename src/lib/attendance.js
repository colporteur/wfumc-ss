// Attendance: one row per (member, meeting_date) when present. Absence
// is the absence of a row. The DB unique constraint prevents duplicate
// "present" marks for the same Sunday.

import { supabase, withTimeout } from './supabase';

/**
 * Sundays in YYYY-MM-DD form. Today's class default — useful for
 * "the next Sunday" calc in the dashboard.
 */
export function nextSundayISO(now = new Date()) {
  const d = new Date(now);
  const day = d.getDay(); // 0=Sun
  // If today is Sunday, return today; otherwise advance to next Sunday.
  const add = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + add);
  return isoDate(d);
}

export function lastSundayISO(now = new Date()) {
  const d = new Date(now);
  const day = d.getDay();
  const sub = day === 0 ? 0 : day;
  d.setDate(d.getDate() - sub);
  return isoDate(d);
}

export function isoDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Get the set of member_ids present on a given meeting_date.
 */
export async function getPresentMemberIds(ownerUserId, meetingDate) {
  if (!ownerUserId || !meetingDate) return new Set();
  const { data, error } = await withTimeout(
    supabase
      .from('ss_attendance')
      .select('member_id')
      .eq('owner_user_id', ownerUserId)
      .eq('meeting_date', meetingDate)
  );
  if (error) throw error;
  return new Set((data || []).map((r) => r.member_id));
}

export async function markPresent(ownerUserId, memberId, meetingDate) {
  // UPSERT-ish via insert + ignore-on-conflict pattern: the unique
  // constraint will fire if already present; we swallow that error so
  // the UI can be idempotent.
  const { error } = await withTimeout(
    supabase
      .from('ss_attendance')
      .insert({
        owner_user_id: ownerUserId,
        member_id: memberId,
        meeting_date: meetingDate,
      })
  );
  if (error && !/duplicate key|unique/i.test(error.message)) throw error;
}

export async function markAbsent(ownerUserId, memberId, meetingDate) {
  const { error } = await withTimeout(
    supabase
      .from('ss_attendance')
      .delete()
      .eq('owner_user_id', ownerUserId)
      .eq('member_id', memberId)
      .eq('meeting_date', meetingDate)
  );
  if (error) throw error;
}

export async function setPresent(ownerUserId, memberId, meetingDate, present) {
  return present
    ? markPresent(ownerUserId, memberId, meetingDate)
    : markAbsent(ownerUserId, memberId, meetingDate);
}

/**
 * Recent attendance history: per-meeting counts and member-present
 * sets. Used by the attendance page's "past Sundays" view.
 *
 * Returns an array of { meeting_date, present_count, member_ids: Set }
 * sorted by meeting_date desc.
 */
export async function recentMeetings(ownerUserId, { limit = 12 } = {}) {
  if (!ownerUserId) return [];
  const { data, error } = await withTimeout(
    supabase
      .from('ss_attendance')
      .select('member_id, meeting_date')
      .eq('owner_user_id', ownerUserId)
      .order('meeting_date', { ascending: false })
  );
  if (error) throw error;
  const byDate = new Map();
  for (const row of data || []) {
    if (!byDate.has(row.meeting_date)) {
      byDate.set(row.meeting_date, new Set());
    }
    byDate.get(row.meeting_date).add(row.member_id);
  }
  const out = [];
  for (const [date, ids] of byDate.entries()) {
    out.push({ meeting_date: date, present_count: ids.size, member_ids: ids });
    if (out.length >= limit) break;
  }
  return out;
}
