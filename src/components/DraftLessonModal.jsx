import { useEffect, useState } from 'react';
import { draftLesson } from '../lib/claude';
import { prepareImages } from '../lib/imagePrep';
import {
  loadImagesForClaude,
  uploadLessonImage,
  listImages,
} from '../lib/lessonImages';

// ✨ Have Claude Make Draft. Optional seed ideas + optional images.
// Returns a {opening_prompt, pastor_notes, closing_prompt} object that
// the pastor can edit before applying.
//
// Image sources:
//   - Lesson's saved image library (auto-loaded; only ones flagged
//     include_in_claude=true are sent)
//   - Ad-hoc attachments picked in this modal session; optionally
//     saved to the library via the "Save to lesson library" checkbox
//
// Apply modes:
//   replace  — overwrite the lesson body wholesale (default for fresh
//              lessons where there's nothing meaningful yet)
//   merge    — append Claude's notes to the existing notes (preserves
//              what the pastor has already written)
//
// Props:
//   question    — the topic text (required)
//   currentNotes — current pastor_notes value (informs merge vs replace UI)
//   lessonId    — required for library-image loading + ad-hoc save
//   ownerUserId — required if saveToLibrary is used
//   onApply     — async ({ opening_prompt, pastor_notes, closing_prompt, mode }) => void
//   onClose     — () => void
//   onLibraryChanged — optional callback after ad-hoc images get saved
export default function DraftLessonModal({
  question,
  currentNotes = '',
  lessonId,
  ownerUserId,
  onApply,
  onClose,
  onLibraryChanged,
}) {
  const [seedIdeas, setSeedIdeas] = useState('');
  const [imageFiles, setImageFiles] = useState([]); // raw File[] (ad-hoc)
  const [preppedImages, setPreppedImages] = useState([]); // base64 ready (ad-hoc)
  const [imagePrepWarnings, setImagePrepWarnings] = useState([]);
  // "Save ad-hoc uploads to the lesson library after Claude responds"
  // — default true so most uses are sticky.
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  // Snapshot of library images currently in the lesson, for context display.
  const [libraryImages, setLibraryImages] = useState([]);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null); // { opening_prompt, pastor_notes, closing_prompt }
  // Editable copies of the returned draft so pastor can tweak in-place
  // before applying.
  const [editOpening, setEditOpening] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editClosing, setEditClosing] = useState('');
  const [mode, setMode] = useState(currentNotes.trim() ? 'merge' : 'replace');

  const hasExistingNotes = !!currentNotes.trim();

  // Load the lesson's library images on mount so we can show the
  // pastor what Claude will already see before they consider adding
  // ad-hoc attachments.
  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listImages(lessonId);
        if (!cancelled) setLibraryImages(list);
      } catch (e) {
        // Non-fatal — just lose the preview.
        console.warn('Could not preload library images:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const claudeReadyLibraryImages = libraryImages.filter((i) => i.include_in_claude);

  const handleFilesChosen = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setImageFiles(files);
    setError(null);
    setImagePrepWarnings([]);
    try {
      const results = await prepareImages(files);
      const ok = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      setPreppedImages(ok);
      if (failed.length > 0) {
        setImagePrepWarnings(
          failed.map((f) => `${f.name}: ${f.error}`)
        );
      }
    } catch (e2) {
      setError(e2.message || String(e2));
    }
  };

  const handleRemoveImage = (idx) => {
    setPreppedImages((prev) => prev.filter((_, i) => i !== idx));
    setImageFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDraft = async () => {
    setDrafting(true);
    setError(null);
    try {
      // Combine library images (already in storage, fetched + re-base64'd)
      // with ad-hoc attachments (already base64 in memory).
      const libImages = lessonId
        ? await loadImagesForClaude(lessonId)
        : [];
      const allImages = [...libImages, ...preppedImages];

      const result = await draftLesson({
        question,
        seedIdeas,
        images: allImages,
      });
      setDraft(result);
      setEditOpening(result.opening_prompt);
      setEditNotes(result.pastor_notes);
      setEditClosing(result.closing_prompt);

      // After Claude returns, persist ad-hoc uploads to the library if
      // the pastor opted in. We do this AFTER the draft so a Claude
      // failure doesn't leave behind orphan library entries.
      if (
        saveToLibrary &&
        lessonId &&
        ownerUserId &&
        imageFiles.length > 0
      ) {
        for (const f of imageFiles) {
          try {
            await uploadLessonImage({
              ownerUserId,
              lessonId,
              file: f,
            });
          } catch (e) {
            console.warn('Save-to-library failed for', f.name, e);
          }
        }
        // Empty the ad-hoc set so repeat clicks don't re-upload.
        setImageFiles([]);
        setPreppedImages([]);
        onLibraryChanged?.();
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setDrafting(false);
    }
  };

  const handleApply = () => {
    onApply({
      opening_prompt: editOpening,
      pastor_notes: editNotes,
      closing_prompt: editClosing,
      mode,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100 flex items-baseline justify-between gap-2">
          <div>
            <h2 className="font-serif text-xl text-umc-900">
              ✨ Have Claude make a draft
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Optionally seed with bullet ideas and/or attach images.
              You'll edit Claude's draft before it lands in the lesson.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Question summary */}
          <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-3 py-2">
            <span className="font-medium">Question:</span> {question}
          </div>

          {/* Seed ideas */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Seed ideas (optional)
            </label>
            <textarea
              className="input w-full text-sm min-h-[100px]"
              value={seedIdeas}
              onChange={(e) => setSeedIdeas(e.target.value)}
              placeholder={
                "Bullet ideas, angles, or hunches you want Claude to incorporate. e.g.:\n" +
                '- explore the difference between rest and laziness\n' +
                '- pull in the sabbath theology angle\n' +
                '- mention what the disciples did between Good Friday and Easter'
              }
              disabled={drafting}
            />
          </div>

          {/* Library images Claude will already see */}
          {claudeReadyLibraryImages.length > 0 && (
            <div className="text-xs text-gray-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
              <span className="font-medium">
                Claude will see {claudeReadyLibraryImages.length} image
                {claudeReadyLibraryImages.length === 1 ? '' : 's'} from this lesson's library:
              </span>
              <div className="mt-1 text-[11px] text-gray-600">
                {claudeReadyLibraryImages
                  .map((i) => i.caption || i.original_name || 'untitled')
                  .join(' · ')}
              </div>
            </div>
          )}

          {/* Image attachments */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Attach additional images (optional, this draft only by default)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFilesChosen}
              disabled={drafting}
              className="text-xs"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Article screenshots, whiteboard sketches, photos. Auto-downsized before sending.
            </p>
            {preppedImages.length > 0 && lessonId && (
              <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-700">
                <input
                  type="checkbox"
                  checked={saveToLibrary}
                  onChange={(e) => setSaveToLibrary(e.target.checked)}
                  disabled={drafting}
                />
                Save these {preppedImages.length} image
                {preppedImages.length === 1 ? '' : 's'} to the lesson's
                library (preserves them for next time + printed handout)
              </label>
            )}
            {preppedImages.length > 0 && (
              <ul className="mt-2 space-y-1">
                {preppedImages.map((img, i) => (
                  <li
                    key={i}
                    className="text-xs flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded px-2 py-1"
                  >
                    <span className="truncate">
                      📎 {img.name}{' '}
                      <span className="text-gray-400">
                        ({Math.round(img.sizeAfter / 1024)} KB)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(i)}
                      className="text-red-600 hover:text-red-800 text-[11px] underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {imagePrepWarnings.length > 0 && (
              <ul className="mt-2 space-y-1">
                {imagePrepWarnings.map((w, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1"
                  >
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Draft button */}
          <div>
            <button
              type="button"
              onClick={handleDraft}
              disabled={drafting}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {drafting
                ? 'Drafting…'
                : draft
                  ? '↻ Draft again'
                  : '✨ Draft with Claude'}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 whitespace-pre-wrap">
              {error}
            </p>
          )}

          {/* Draft output — editable */}
          {draft && (
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-700">
                Claude's draft — tweak before applying:
              </p>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                  Opening prompt
                </label>
                <textarea
                  className="input w-full font-serif text-sm leading-relaxed min-h-[60px]"
                  value={editOpening}
                  onChange={(e) => setEditOpening(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                  Pastor's notes (one bullet per line, starting with "- ")
                </label>
                <textarea
                  className="input w-full font-serif text-sm leading-relaxed min-h-[200px]"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                  Closing prompt
                </label>
                <input
                  className="input w-full text-sm"
                  value={editClosing}
                  onChange={(e) => setEditClosing(e.target.value)}
                />
              </div>

              {hasExistingNotes && (
                <div className="text-xs flex items-center gap-3">
                  <span className="text-gray-700">Apply mode:</span>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={mode === 'merge'}
                      onChange={() => setMode('merge')}
                    />
                    Merge (append to existing notes)
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                    />
                    Replace
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!draft || drafting}
            className="btn-primary text-sm disabled:opacity-50"
          >
            Apply to lesson
          </button>
        </div>
      </div>
    </div>
  );
}
