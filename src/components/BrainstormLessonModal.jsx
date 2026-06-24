import { useState } from 'react';
import { brainstormLesson } from '../lib/claude';

// 💡 Brainstorm Lesson — 4-6 angle ideas instead of a full draft.
// Each idea has a "Use this" button that appends it to the lesson notes
// as a single bullet (the pastor can then keep developing).
//
// Props:
//   question      — the topic text (required)
//   onUseIdea     — (ideaText) => void (parent appends as bullet)
//   onClose       — () => void
export default function BrainstormLessonModal({
  question,
  onUseIdea,
  onClose,
}) {
  const [seedIdeas, setSeedIdeas] = useState('');
  const [ideas, setIdeas] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [usedSet, setUsedSet] = useState(new Set());

  const handleBrainstorm = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await brainstormLesson({ question, seedIdeas });
      setIdeas(result);
      setUsedSet(new Set());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleUse = (idx, idea) => {
    onUseIdea(idea);
    setUsedSet((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
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
              💡 Brainstorm angles
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Claude returns 4-6 short ideas — pick any to drop into your notes.
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
          <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-3 py-2">
            <span className="font-medium">Question:</span> {question}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Seed ideas (optional)
            </label>
            <textarea
              className="input w-full text-sm min-h-[80px]"
              value={seedIdeas}
              onChange={(e) => setSeedIdeas(e.target.value)}
              placeholder="Hints about angles you'd want covered — Claude will weave these in."
              disabled={generating}
            />
          </div>

          <button
            type="button"
            onClick={handleBrainstorm}
            disabled={generating}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {generating
              ? 'Brainstorming…'
              : ideas.length > 0
                ? '↻ Brainstorm again'
                : '💡 Brainstorm with Claude'}
          </button>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 whitespace-pre-wrap">
              {error}
            </p>
          )}

          {ideas.length > 0 && (
            <ul className="space-y-2 border-t border-gray-100 pt-4">
              {ideas.map((idea, idx) => (
                <li
                  key={idx}
                  className={
                    'border rounded p-3 ' +
                    (usedSet.has(idx)
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 bg-white')
                  }
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">
                      Idea {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUse(idx, idea)}
                      className="text-xs text-umc-700 hover:text-umc-900 underline"
                    >
                      {usedSet.has(idx) ? '✓ Added' : 'Use this'}
                    </button>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap font-serif leading-relaxed">
                    {idea}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex items-center justify-end">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
