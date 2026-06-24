// CRUD wrapper for ss_lesson_images + storage upload helpers.
//
// Storage layout: ss-lesson-images bucket, paths shaped
//   {ownerUserId}/{lessonId}/{uuid}-{filename}
// to keep per-lesson sets grouped and per-user prefixed (RLS-friendly).

import { supabase, withTimeout, supabaseUrl } from './supabase';
import { prepareImage } from './imagePrep';

const BUCKET = 'ss-lesson-images';

/**
 * List all images for a lesson, sorted.
 */
export async function listImages(lessonId) {
  if (!lessonId) return [];
  const { data, error } = await withTimeout(
    supabase
      .from('ss_lesson_images')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
  );
  if (error) throw error;
  return data || [];
}

/**
 * Build the public URL for an image given its storage_path.
 */
export function publicUrlFor(storagePath) {
  if (!storagePath) return '';
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

/**
 * Upload a single File to storage, downsizing first via prepareImage.
 * Then create an ss_lesson_images row. Returns the inserted row.
 */
export async function uploadLessonImage({
  ownerUserId,
  lessonId,
  file,
  caption = null,
  includeInPrint = true,
  includeInClaude = true,
  sortOrder = null,
}) {
  if (!ownerUserId) throw new Error('ownerUserId required');
  if (!lessonId) throw new Error('lessonId required');
  if (!file) throw new Error('file required');

  // Downsize + JPEG-encode + base64. We then re-decode the base64 to a
  // Blob so we can upload to storage (we want the downsized JPEG in
  // storage, not the original 12MP phone photo).
  const prepped = await prepareImage(file);
  const jpegBlob = base64ToBlob(prepped.data, 'image/jpeg');

  // Storage path: per-owner per-lesson prefix + uuid + sanitized name.
  const safeName = (file.name || 'image')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 64)
    .replace(/\.\w+$/, '') + '.jpg';
  const uuid = crypto.randomUUID();
  const storagePath = `${ownerUserId}/${lessonId}/${uuid}-${safeName}`;

  const { error: upErr } = await withTimeout(
    supabase.storage
      .from(BUCKET)
      .upload(storagePath, jpegBlob, {
        contentType: 'image/jpeg',
        upsert: false,
      })
  );
  if (upErr) throw upErr;

  // Compute next sort_order if caller didn't supply one.
  let resolvedSort = sortOrder;
  if (resolvedSort === null || resolvedSort === undefined) {
    const existing = await listImages(lessonId);
    resolvedSort = existing.length;
  }

  const { data, error } = await withTimeout(
    supabase
      .from('ss_lesson_images')
      .insert({
        owner_user_id: ownerUserId,
        lesson_id: lessonId,
        storage_path: storagePath,
        original_name: file.name || null,
        caption,
        sort_order: resolvedSort,
        include_in_print: includeInPrint,
        include_in_claude: includeInClaude,
      })
      .select('*')
      .single()
  );
  if (error) {
    // Roll back the storage upload if the row insert failed so we
    // don't accumulate orphan files.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw error;
  }
  return data;
}

export async function updateLessonImage(imageId, patch) {
  const { data, error } = await withTimeout(
    supabase
      .from('ss_lesson_images')
      .update(patch)
      .eq('id', imageId)
      .select('*')
      .single()
  );
  if (error) throw error;
  return data;
}

export async function deleteLessonImage(image) {
  if (!image?.id) throw new Error('image required');
  // Delete row first; if that succeeds, clean up storage. (Reverse
  // order would leave a row with a dangling storage_path on partial
  // failure.)
  const { error: rowErr } = await withTimeout(
    supabase.from('ss_lesson_images').delete().eq('id', image.id)
  );
  if (rowErr) throw rowErr;
  if (image.storage_path) {
    // Best-effort storage cleanup — don't throw if it fails (the row
    // is already gone, leaving an orphan file is a recoverable mess).
    try {
      await supabase.storage.from(BUCKET).remove([image.storage_path]);
    } catch (e) {
      console.warn('Storage cleanup failed (orphan file):', image.storage_path, e);
    }
  }
}

/**
 * Reorder helper — swaps sort_order between two images.
 */
export async function swapImageOrder(imageA, imageB) {
  // Park A at -1 to dodge any future uniqueness constraint, then swap.
  await withTimeout(
    supabase
      .from('ss_lesson_images')
      .update({ sort_order: -1 })
      .eq('id', imageA.id)
  );
  await withTimeout(
    supabase
      .from('ss_lesson_images')
      .update({ sort_order: imageA.sort_order })
      .eq('id', imageB.id)
  );
  await withTimeout(
    supabase
      .from('ss_lesson_images')
      .update({ sort_order: imageB.sort_order })
      .eq('id', imageA.id)
  );
}

/**
 * Fetch images flagged include_in_claude=true and return them as the
 * { data (base64), mediaType } shape that claude.js draftLesson /
 * brainstormLesson expect.
 *
 * Downloads the JPEG from storage via the public URL, re-encodes to
 * base64. Done in parallel.
 */
export async function loadImagesForClaude(lessonId) {
  const all = await listImages(lessonId);
  const useable = all.filter((i) => i.include_in_claude && i.storage_path);
  const results = await Promise.all(
    useable.map(async (img) => {
      const url = publicUrlFor(img.storage_path);
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(
          `Couldn't fetch image "${img.original_name || img.id}" for Claude (HTTP ${resp.status}).`
        );
      }
      const blob = await resp.blob();
      const data = await blobToBase64(blob);
      return {
        data,
        mediaType: blob.type || 'image/jpeg',
        name: img.original_name || img.id,
      };
    })
  );
  return results;
}

// --- internals -----------------------------------------------------

function base64ToBlob(base64, mediaType) {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mediaType });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const dataUrl = fr.result || '';
      const idx = String(dataUrl).indexOf(',');
      resolve(idx === -1 ? '' : String(dataUrl).slice(idx + 1));
    };
    fr.onerror = () => reject(new Error('Failed to read image blob.'));
    fr.readAsDataURL(blob);
  });
}
