import { useState } from 'react';
import { lookupScriptureNRSVUe } from '../lib/claude';

// 📖 Insert a Bible verse from NRSVUe into the lesson notes.
// Pastor types a reference (e.g. "John 3:16-17" or "Matthew 6:9-13"),
// Claude returns the verse text + reference, pastor reviews + clicks
// Insert.
//
// Props:
//   onInsert  — (text) => void — parent appends as a new line in notes
//   onClose   — () => void
export default function InsertVerseModal({ onInsert, onClose }) {
  const [reference, setReference] = useState('');
  const [text, setText] = useState('');
  const [editText, setEditText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLookup = async () => {
    if (!reference.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await lookupScriptureNRSVUe(reference);
      setText(result);
      setEditText(result);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    onInsert(editText);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100 flex items-baseline justify-between gap-2">
          <div>
            <h2 className="font-serif text-xl text-umc-900">
              📖 Insert NRSVUe verse
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Look up a passage and drop it into the lesson notes.
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
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Reference
            </label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. John 3:16-17 or Matthew 6:9-13"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && reference.trim() && !loading)
                    handleLookup();
                }}
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleLookup}
                disabled={!reference.trim() || loading}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {loading ? 'Looking up…' : 'Look up'}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 whitespace-pre-wrap">
              {error}
            </p>
          )}

          {text && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Verse text (editable before inserting)
              </label>
              <textarea
                className="input w-full font-serif text-sm leading-relaxed min-h-[160px]"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleInsert}
            disabled={!editText.trim()}
            className="btn-primary text-sm disabled:opacity-50"
          >
            Insert into notes
          </button>
        </div>
      </div>
    </div>
  );
}
