import { useEffect, useState } from 'react';
import {
  listImages,
  uploadLessonImage,
  updateLessonImage,
  deleteLessonImage,
  swapImageOrder,
  publicUrlFor,
} from '../lib/lessonImages';

// Image library for one lesson. Renders on LessonWorkspace.
// Each image has thumbnail, caption (inline-editable), two flag
// checkboxes (Use in Claude / Print in handout), reorder arrows, delete.
//
// Props:
//   lessonId       — required (uploads need it)
//   ownerUserId    — required
//   onImagesChanged — optional callback after any mutation, so the
//                     parent can refresh derived counts if needed
export default function LessonImagesPanel({
  lessonId,
  ownerUserId,
  onImagesChanged,
}) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const reload = async () => {
    if (!lessonId) {
      setImages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listImages(lessonId);
      setImages(list);
      onImagesChanged?.(list);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  const handleFilesChosen = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // reset so re-selecting the same file re-fires
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const f of files) {
        await uploadLessonImage({ ownerUserId, lessonId, file: f });
      }
      await reload();
    } catch (e2) {
      setError(e2.message || String(e2));
    } finally {
      setUploading(false);
    }
  };

  const handleToggleFlag = async (img, flag) => {
    setBusyId(img.id);
    setError(null);
    try {
      const patch = { [flag]: !img[flag] };
      await updateLessonImage(img.id, patch);
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleCaptionBlur = async (img, newCaption) => {
    const cleaned = (newCaption || '').trim() || null;
    if ((img.caption || null) === cleaned) return; // no-op
    setBusyId(img.id);
    setError(null);
    try {
      await updateLessonImage(img.id, { caption: cleaned });
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (img) => {
    if (!window.confirm(`Delete "${img.original_name || 'this image'}"?`)) return;
    setBusyId(img.id);
    setError(null);
    try {
      await deleteLessonImage(img);
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleMove = async (img, dir) => {
    const idx = images.findIndex((x) => x.id === img.id);
    if (idx === -1) return;
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= images.length) return;
    setBusyId(img.id);
    setError(null);
    try {
      await swapImageOrder(img, images[targetIdx]);
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="font-serif text-base text-umc-900">
          Image library ({images.length})
        </h3>
        <label className="text-xs cursor-pointer">
          <span className="btn-secondary text-xs">
            {uploading ? 'Uploading…' : '＋ Add images'}
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesChosen}
            disabled={uploading || !lessonId}
            className="hidden"
          />
        </label>
      </div>

      {!lessonId && (
        <p className="text-xs text-gray-500 italic">
          Save the lesson once before adding images.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {loading && lessonId ? (
        <p className="text-xs text-gray-500">Loading images…</p>
      ) : images.length === 0 ? (
        <p className="text-xs text-gray-500 italic">
          No images yet. Add screenshots, photos, or sketches Claude can
          see when drafting, and they'll appear in the printed handout
          as an appendix at the end.
        </p>
      ) : (
        <ul className="space-y-3">
          {images.map((img, idx) => (
            <li
              key={img.id}
              className="flex gap-3 items-start border border-gray-200 rounded p-2 bg-white"
            >
              <a
                href={publicUrlFor(img.storage_path)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
                title="Open full size in new tab"
              >
                <img
                  src={publicUrlFor(img.storage_path)}
                  alt={img.original_name || ''}
                  className="w-24 h-24 object-cover rounded border border-gray-100"
                />
              </a>
              <div className="flex-1 min-w-0 space-y-1.5">
                <input
                  className="input text-xs w-full"
                  defaultValue={img.caption || ''}
                  placeholder="Caption (optional)"
                  onBlur={(e) => handleCaptionBlur(img, e.target.value)}
                  disabled={busyId === img.id}
                />
                <div className="flex items-center gap-3 text-[11px] text-gray-700 flex-wrap">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={img.include_in_print}
                      onChange={() => handleToggleFlag(img, 'include_in_print')}
                      disabled={busyId === img.id}
                    />
                    Print in handout
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={img.include_in_claude}
                      onChange={() => handleToggleFlag(img, 'include_in_claude')}
                      disabled={busyId === img.id}
                    />
                    Send to Claude
                  </label>
                  <span className="text-gray-400">
                    {img.original_name || img.id.slice(0, 8)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleMove(img, 'up')}
                    disabled={idx === 0 || busyId === img.id}
                    className="text-gray-500 hover:text-gray-800 disabled:opacity-30"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(img, 'down')}
                    disabled={idx === images.length - 1 || busyId === img.id}
                    className="text-gray-500 hover:text-gray-800 disabled:opacity-30"
                    title="Move down"
                  >
                    ↓
                  </button>
                  <span className="text-gray-300">·</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(img)}
                    disabled={busyId === img.id}
                    className="text-red-600 hover:text-red-800 underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
