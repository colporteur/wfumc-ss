import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import { parseLessonFile } from '../lib/parseLessonFile';
import { listTopics } from '../lib/topics';
import { matchLessonToTopic } from '../lib/claude';
import { upsertLesson, loadLessonForTopic } from '../lib/lessons';

// Pastor-only bulk-import flow for backfilling historical lessons.
//
// Workflow:
//   1. Pastor drops DOCX/PDF files (multi-select).
//   2. Each file is parsed (text extraction) — happens in parallel.
//   3. For each parsed file, Claude proposes which Past Topic it
//      matches (against the full list of past + active topics so the
//      pastor can backfill ones not-yet-marked-past).
//   4. Pastor reviews per-row: change the matched topic via dropdown,
//      mark skip, or accept.
//   5. Commit creates ss_lessons rows linked to chosen topics. For
//      topics that already have a lesson, we ask the pastor whether
//      to overwrite, append, or skip (per-row).
//
// Output format: the imported lesson text is dropped into pastor_notes
// as-is. Pastor can then open the lesson workspace and polish it
// after import.
export default function BulkImportLessons() {
  const { user } = useAuth();
  const [topics, setTopics] = useState([]); // candidates for matching
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [topicsErr, setTopicsErr] = useState(null);
  // rows: [{ file, status, parsed?, match?, chosenTopicId, dupeAction, error?, imported? }]
  const [rows, setRows] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [globalError, setGlobalError] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoadingTopics(true);
      setTopicsErr(null);
      try {
        const all = await listTopics(user.id);
        // Bulk-import matches against PAST topics primarily, but also
        // include active + picked_for_next so the pastor can backfill
        // lessons just about to happen / in-flight if they want.
        if (!cancelled) {
          setTopics(
            all.filter((t) => ['past', 'active', 'picked_for_next'].includes(t.status))
          );
        }
      } catch (e) {
        if (!cancelled) setTopicsErr(e.message || String(e));
      } finally {
        if (!cancelled) setLoadingTopics(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleFilesChosen = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const newRows = files.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      status: 'queued',
      parsed: null,
      match: null,
      chosenTopicId: '',
      dupeAction: 'overwrite',
      error: null,
      imported: false,
    }));
    setRows((prev) => [...prev, ...newRows]);
  };

  const processRow = async (row) => {
    // Parse + match a single row. Updates state in place.
    updateRow(row.id, { status: 'parsing', error: null });
    try {
      const parsed = await parseLessonFile(row.file);
      updateRow(row.id, { parsed, status: 'matching' });
      const match = await matchLessonToTopic({
        lessonText: parsed.text,
        candidates: topics,
      });
      updateRow(row.id, {
        match,
        chosenTopicId: match.topicId || '',
        status: match.topicId ? 'matched' : 'no-match',
      });
    } catch (e) {
      updateRow(row.id, { status: 'error', error: e.message || String(e) });
    }
  };

  const handleParseAndMatch = async () => {
    setProcessing(true);
    setGlobalError(null);
    try {
      // Process sequentially so we don't hammer the Claude API with
      // a fan-out of 50 parallel calls.
      for (const row of rows.filter((r) => r.status === 'queued')) {
        await processRow(row);
      }
    } catch (e) {
      setGlobalError(e.message || String(e));
    } finally {
      setProcessing(false);
    }
  };

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleCommit = async () => {
    setCommitting(true);
    setGlobalError(null);
    try {
      for (const row of rows) {
        if (row.imported) continue;
        if (!row.chosenTopicId) continue;
        if (row.status === 'error' || !row.parsed) continue;

        try {
          // Build sections from the imported text + handle pre-existing.
          const importedSection = {
            header: 'Lesson notes',
            body: row.parsed.text,
          };
          let sectionsToWrite = [importedSection];

          if (row.dupeAction !== 'overwrite') {
            const existing = await loadLessonForTopic(row.chosenTopicId);
            const existingSections =
              existing?.sections && existing.sections.length > 0
                ? existing.sections
                : [];
            if (existingSections.length > 0) {
              if (row.dupeAction === 'skip') {
                updateRow(row.id, { imported: true, status: 'skipped-existing' });
                continue;
              }
              if (row.dupeAction === 'append') {
                sectionsToWrite = [
                  ...existingSections,
                  {
                    header:
                      'Imported from ' + (row.file.name || 'file'),
                    body: row.parsed.text,
                  },
                ];
              }
            }
          }

          await upsertLesson({
            ownerUserId: user.id,
            topicId: row.chosenTopicId,
            sections: sectionsToWrite,
          });
          updateRow(row.id, { imported: true, status: 'imported' });
        } catch (e) {
          updateRow(row.id, {
            error: e.message || String(e),
            status: 'commit-error',
          });
        }
      }
    } catch (e) {
      setGlobalError(e.message || String(e));
    } finally {
      setCommitting(false);
    }
  };

  const queuedCount = rows.filter((r) => r.status === 'queued').length;
  const readyCount = rows.filter(
    (r) => r.chosenTopicId && !r.imported && r.status !== 'error'
  ).length;

  if (loadingTopics) return <LoadingSpinner label="Loading topics…" />;
  if (topicsErr) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
        {topicsErr}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">
        ← Dashboard
      </Link>
      <div>
        <h1 className="font-serif text-2xl text-umc-900">
          Bulk-import past lessons
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Drop .docx and .pdf files of historical lessons. Each file is
          parsed and Claude proposes which Past Topic it matches. Review
          per-row, then commit to attach lesson notes to those topics.
        </p>
      </div>

      {globalError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {globalError}
        </p>
      )}

      {/* Drop zone */}
      <div className="card space-y-3">
        <label className="inline-block">
          <span className="btn-primary text-sm">
            {processing ? 'Processing…' : '＋ Add files'}
          </span>
          <input
            type="file"
            accept=".docx,.pdf"
            multiple
            onChange={handleFilesChosen}
            disabled={processing || committing}
            className="hidden"
          />
        </label>
        <p className="text-[11px] text-gray-500">
          Matching against {topics.length} past / active / picked topics.
        </p>
      </div>

      {/* Action bar */}
      {rows.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleParseAndMatch}
            disabled={processing || committing || queuedCount === 0}
            className="btn-secondary text-sm disabled:opacity-50"
          >
            {processing
              ? 'Parsing + matching…'
              : `▶ Parse + match ${queuedCount} queued`}
          </button>
          <button
            type="button"
            onClick={handleCommit}
            disabled={processing || committing || readyCount === 0}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {committing
              ? 'Committing…'
              : `✓ Commit ${readyCount} ready`}
          </button>
        </div>
      )}

      {/* Rows */}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No files queued yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <BulkImportRow
              key={row.id}
              row={row}
              topics={topics}
              onUpdate={(patch) => updateRow(row.id, patch)}
              onRemove={() => removeRow(row.id)}
              disabled={processing || committing}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BulkImportRow({ row, topics, onUpdate, onRemove, disabled }) {
  const matched = topics.find((t) => t.id === row.chosenTopicId);
  return (
    <li
      className={
        'border rounded p-3 ' +
        (row.imported
          ? 'border-green-200 bg-green-50'
          : row.status === 'error' || row.status === 'commit-error'
            ? 'border-red-200 bg-red-50'
            : 'border-gray-200 bg-white')
      }
    >
      <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            📎 {row.file.name}
          </p>
          {row.parsed?.wordCount && (
            <p className="text-[11px] text-gray-500">
              {row.parsed.wordCount} words
              {row.parsed.pageCount ? ` · ${row.parsed.pageCount} pages` : ''}
            </p>
          )}
        </div>
        <span
          className={
            'text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ' +
            (row.imported
              ? 'bg-green-200 text-green-900'
              : row.status === 'error' || row.status === 'commit-error'
                ? 'bg-red-200 text-red-900'
                : row.status === 'no-match'
                  ? 'bg-amber-200 text-amber-900'
                  : 'bg-gray-200 text-gray-700')
          }
        >
          {row.status === 'queued' && 'queued'}
          {row.status === 'parsing' && 'parsing…'}
          {row.status === 'matching' && 'matching…'}
          {row.status === 'matched' && `matched · ${row.match?.confidence}`}
          {row.status === 'no-match' && 'no match — pick manually'}
          {row.status === 'imported' && '✓ imported'}
          {row.status === 'skipped-existing' && 'skipped (had lesson)'}
          {row.status === 'error' && 'parse error'}
          {row.status === 'commit-error' && 'commit error'}
        </span>
      </div>

      {row.error && (
        <p className="text-xs text-red-700 mb-2">{row.error}</p>
      )}

      {row.match?.reasoning && (
        <p className="text-[11px] text-gray-600 italic mb-2">
          Claude: {row.match.reasoning}
        </p>
      )}

      {/* Topic picker — required to commit. */}
      {(row.parsed || row.status === 'matched' || row.status === 'no-match') &&
        !row.imported && (
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                Attach to topic
              </label>
              <select
                className="input text-sm"
                value={row.chosenTopicId}
                onChange={(e) => onUpdate({ chosenTopicId: e.target.value })}
                disabled={disabled}
              >
                <option value="">— Skip (don't import) —</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.text.length > 80 ? t.text.slice(0, 80) + '…' : t.text}
                  </option>
                ))}
              </select>
              {matched && (
                <p className="text-[11px] text-gray-500 mt-1">
                  → "{matched.text}"
                  {matched.discussed_on && ` (${matched.discussed_on})`}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                If a lesson already exists on this topic
              </label>
              <select
                className="input text-sm"
                value={row.dupeAction}
                onChange={(e) => onUpdate({ dupeAction: e.target.value })}
                disabled={disabled}
              >
                <option value="overwrite">Overwrite the existing notes</option>
                <option value="append">Append to existing notes</option>
                <option value="skip">Skip (keep existing)</option>
              </select>
            </div>

            {row.parsed?.text && (
              <details className="text-[11px]">
                <summary className="text-gray-600 cursor-pointer">
                  Preview parsed text (first 500 chars)
                </summary>
                <pre className="mt-1 whitespace-pre-wrap font-mono bg-gray-50 border border-gray-200 rounded p-2 text-[10px]">
                  {row.parsed.text.slice(0, 500)}
                  {row.parsed.text.length > 500 ? '…' : ''}
                </pre>
              </details>
            )}
          </div>
        )}

      <div className="mt-2 text-xs">
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="text-gray-500 hover:text-gray-800 underline disabled:opacity-50"
        >
          Remove from queue
        </button>
      </div>
    </li>
  );
}
