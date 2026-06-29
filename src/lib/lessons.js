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
 * The returned object always has a `sections` field — even legacy
 * rows whose data lives in opening_prompt/pastor_notes/closing_prompt
 * get auto-converted into a 3-section array on the way out.
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
  if (!data) return null;
  // Normalize: ensure data.sections is always a non-null array of
  // {header, body} objects. If sections is empty AND we have legacy
  // field content, hydrate from the legacy fields one-time.
  let sections = Array.isArray(data.sections) ? data.sections.slice() : [];
  if (sections.length === 0 && hasLegacyContent(data)) {
    sections = legacyToSections(data);
  }
  return { ...data, sections };
}

/**
 * Public helper for callers that load ss_lessons rows directly (e.g.
 * the public-facing pages). Given a raw lesson row, return its sections
 * array — using the new sections column if populated, otherwise
 * synthesizing one from the legacy three-field columns.
 */
export function lessonSectionsOf(lesson) {
  if (!lesson) return [];
  if (Array.isArray(lesson.sections) && lesson.sections.length > 0) {
    return lesson.sections;
  }
  if (hasLegacyContent(lesson)) {
    return legacyToSections(lesson);
  }
  return [];
}

/**
 * Are the deprecated opening_prompt / pastor_notes / closing_prompt
 * columns populated with anything beyond the default closing prompt?
 */
function hasLegacyContent(lesson) {
  if (lesson?.opening_prompt && lesson.opening_prompt.trim()) return true;
  if (lesson?.pastor_notes && lesson.pastor_notes.trim()) return true;
  // closing_prompt has a default of "What are your thoughts?" — count it
  // as "legacy content" only if it deviates from default OR if there's
  // anything else to convert.
  return false;
}

/**
 * Convert legacy 3-field lesson into a sections array. Skips empty
 * sections so a lesson with only pastor_notes doesn't get padded with
 * blank Opening/Closing sections.
 */
function legacyToSections(lesson) {
  const out = [];
  if (lesson.opening_prompt && lesson.opening_prompt.trim()) {
    out.push({
      header: 'Opening Prompt',
      body: lesson.opening_prompt.trim(),
    });
  }
  if (lesson.pastor_notes && lesson.pastor_notes.trim()) {
    out.push({
      header: "Pastor's Notes",
      body: lesson.pastor_notes,
    });
  }
  if (
    lesson.closing_prompt &&
    lesson.closing_prompt.trim() &&
    lesson.closing_prompt.trim() !== 'What are your thoughts?'
  ) {
    out.push({
      header: 'Closing Prompt',
      body: lesson.closing_prompt.trim(),
    });
  } else if (out.length > 0) {
    // Include the default closing prompt only if we already had real
    // content above it — otherwise a fully-empty legacy lesson would
    // pick up a spurious "What are your thoughts?" section.
    out.push({
      header: 'Closing Prompt',
      body: 'What are your thoughts?',
    });
  }
  return out;
}

/**
 * Normalize a sections-input from the UI: drop entries with both empty
 * header AND empty body, and trim header strings.
 */
function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections
    .map((s) => ({
      header: typeof s?.header === 'string' ? s.header.trim() : '',
      body: typeof s?.body === 'string' ? s.body : '',
    }))
    .filter((s) => s.header || s.body.trim());
}

/**
 * Upsert lesson for a topic. The unique constraint on topic_id keeps
 * us at one lesson per topic.
 *
 * Sections is the new primary payload. The legacy opening_prompt /
 * pastor_notes / closing_prompt fields are still written for safety —
 * we mirror the first three sections into those columns so a
 * theoretical rollback wouldn't lose data. Once we're confident
 * every active lesson has been re-saved we can drop them.
 */
export async function upsertLesson({
  ownerUserId,
  topicId,
  sections = [],
  homeworkText = null,
  homeworkExpiresAt = null,
}) {
  const clean = normalizeSections(sections);
  // Safety mirror to legacy columns: first three sections (if any) go
  // into the legacy triple, with closing defaulting back to the
  // standard prompt. Anything beyond 3 sections is lost in the mirror
  // but preserved in the JSONB column.
  const op = clean[0]?.body || null;
  const pn = clean[1]?.body || '';
  const cp = clean[2]?.body || 'What are your thoughts?';
  const payload = {
    owner_user_id: ownerUserId,
    topic_id: topicId,
    sections: clean,
    opening_prompt: op && op.trim() ? op : null,
    pastor_notes: pn,
    closing_prompt: cp,
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
  // Return the normalized sections so the workspace doesn't need to
  // re-fetch to get them.
  return { ...data, sections: clean };
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
