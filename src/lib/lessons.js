// CRUD for ss_lessons. One lesson per topic. The bulk of lesson
// authoring lives in the workspace (Phase B); these helpers just
// handle load/save/upsert + homework-expiration computation.

import { supabase, withTimeout } from './supabase';
import {
  CLASS_DAY_OF_WEEK,
  CLASS_END_HOUR_CT,
  CLASS_END_MINUTE_CT,
} from './config';

/**
 * Load the lesson for a given topic, or null if not yet started.
 */
export async function loadLessonForTopic(topicId) {
  if (!topicId) return null;
  const { data, error } = await withTimeout(
    supabase
      .from('ss_lessons')
      .select('*')
      .eq('topic_id', topicId)
      .maybeSingle()
  );
  if (error) throw error;
  return data || null;
}

/**
 * Upsert lesson for a topic. The unique constraint on topic_id keeps
 * us at one lesson per topic.
 */
export async function upsertLesson({
  ownerUserId,
  topicId,
  openingPrompt = null,
  pastorNotes = '',
  closingPrompt = 'What are your thoughts?',
  homeworkText = null,
  homeworkExpiresAt = null,
}) {
  const payload = {
    owner_user_id: ownerUserId,
    topic_id: topicId,
    opening_prompt: openingPrompt,
    pastor_notes: pastorNotes,
    closing_prompt: closingPrompt,
    homework_text: homeworkText,
    homework_expires_at: homeworkExpiresAt,
  };
  const { data, error } = await withTimeout(
    supabase
      .from('ss_lessons')
      .upsert(payload, { onConflict: 'topic_id' })
      .select('*')
      .single()
  );
  if (error) throw error;
  return data;
}

/**
 * Compute the homework_expires_at timestamp for the upcoming class
 * meeting. We anchor it to America/Chicago class time so homework on
 * the public side hides at exactly the moment class ends regardless of
 * the viewer's local timezone.
 *
 * Returns a JS Date (will serialize to an ISO timestamptz on save).
 */
export function computeHomeworkExpiration(fromDate = new Date()) {
  // Find the next CLASS_DAY_OF_WEEK at CLASS_END_HOUR_CT:CLASS_END_MINUTE_CT
  // America/Chicago. Easiest accurate path: compute via UTC by adjusting
  // for the Central offset.
  //
  // America/Chicago is UTC-6 (CST) Nov–Mar and UTC-5 (CDT) Mar–Nov. We
  // resolve the offset by formatting a probe Date with the timezone and
  // reading the offset back. This is more robust than hard-coding -6.
  const d = new Date(fromDate);
  // Find the next Sunday from `d`.
  const day = d.getDay();
  const daysUntil = day === CLASS_DAY_OF_WEEK ? 0 : (7 + CLASS_DAY_OF_WEEK - day) % 7;
  // Anchor at midnight local then bump to next Sunday + 9:30 AM, then
  // convert to America/Chicago wall-clock by going through Intl.
  const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysUntil);
  // Compose the desired wall-clock string in America/Chicago.
  const yyyy = sunday.getFullYear();
  const mm = String(sunday.getMonth() + 1).padStart(2, '0');
  const dd = String(sunday.getDate()).padStart(2, '0');
  const hh = String(CLASS_END_HOUR_CT).padStart(2, '0');
  const mi = String(CLASS_END_MINUTE_CT).padStart(2, '0');
  // Build a Date assuming UTC, then correct by Chicago's offset at that
  // moment. We use Intl.DateTimeFormat to get the offset reliably.
  const probeUTC = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:00Z`);
  const partsFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    timeZoneName: 'shortOffset',
  });
  const parts = partsFmt.formatToParts(probeUTC);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT-6';
  const m = offsetPart.match(/GMT([+-]?)(\d+)(?::(\d+))?/);
  let offsetMin = 0;
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const h = parseInt(m[2], 10) || 0;
    const min = parseInt(m[3] || '0', 10) || 0;
    offsetMin = sign * (h * 60 + min);
  }
  // The wall clock in Chicago is `probeUTC + offsetMin minutes`, so to
  // get the UTC instant for that wall-clock moment, we subtract.
  return new Date(probeUTC.getTime() - offsetMin * 60 * 1000);
}

/**
 * Is a lesson's homework currently active (visible on public page)?
 * Caller passes a Date for "now" to make this testable.
 */
export function isHomeworkActive(lesson, now = new Date()) {
  if (!lesson?.homework_text) return false;
  if (!lesson.homework_expires_at) return true;
  return new Date(lesson.homework_expires_at).getTime() > now.getTime();
}
