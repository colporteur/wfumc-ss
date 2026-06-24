import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import DraftLessonModal from '../components/DraftLessonModal.jsx';
import BrainstormLessonModal from '../components/BrainstormLessonModal.jsx';
import InsertVerseModal from '../components/InsertVerseModal.jsx';
import LessonImagesPanel from '../components/LessonImagesPanel.jsx';
import { loadImagesForClaude, listImages } from '../lib/lessonImages';
import { supabase, withTimeout } from '../lib/supabase';
import {
  loadLessonForTopic,
  upsertLesson,
  computeHomeworkExpiration,
  isHomeworkActive,
} from '../lib/lessons';
import { updateTopic, setStatus } from '../lib/topics';
import { exportLessonDocx } from '../lib/exportLessonDocx';

// The lesson workspace — pastor drafts and refines the active or
// picked-for-next lesson here. Route is /lesson/:topicId.
//
// Flow:
//   - Topic must exist (picked_for_next, active, or past).
//   - Lesson row is upserted-on-save (one-to-one with topic).
//   - "Mark as Active" moves topic into active state (the Sunday-of view).
//   - "Finalize" moves topic into past state (after class).
export default function LessonWorkspace() {
  const { topicId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topic, setTopic] = useState(null);
  // The lesson row's id — captured after first load/upsert. Required
  // before images can be attached (the image rows reference it).
  const [lessonId, setLessonId] = useState(null);
  // Bumped after image-library mutations from inside a modal so the
  // LessonImagesPanel re-fetches.
  const [imagesRefreshKey, setImagesRefreshKey] = useState(0);
  // Editable lesson fields. Mirrored from DB on load; pastor edits;
  // Save button writes back.
  const [openingPrompt, setOpeningPrompt] = useState('');
  const [pastorNotes, setPastorNotes] = useState('');
  const [closingPrompt, setClosingPrompt] = useState('What are your thoughts?');
  const [homeworkText, setHomeworkText] = useState('');
  const [homeworkExpiresAt, setHomeworkExpiresAt] = useState(null);

  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  // Modal state
  const [draftOpen, setDraftOpen] = useState(false);
  const [brainstormOpen, setBrainstormOpen] = useState(false);
  const [verseOpen, setVerseOpen] = useState(false);

  const dirty = useMemo(() => {
    if (!savedSnapshot) return false;
    return (
      savedSnapshot.openingPrompt !== openingPrompt ||
      savedSnapshot.pastorNotes !== pastorNotes ||
      savedSnapshot.closingPrompt !== closingPrompt ||
      (savedSnapshot.homeworkText || '') !== (homeworkText || '')
    );
  }, [savedSnapshot, openingPrompt, pastorNotes, closingPrompt, homeworkText]);

  const reload = async () => {
    if (!user?.id || !topicId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: t, error: tErr } = await withTimeout(
        supabase
          .from('ss_topics')
          .select('*, picked_by:picked_by_member_id(id, display_name)')
          .eq('id', topicId)
          .maybeSingle()
      );
      if (tErr) throw tErr;
      if (!t) {
        setError('Topic not found.');
        return;
      }
      setTopic(t);
      const lesson = await loadLessonForTopic(topicId);
      setLessonId(lesson?.id || null);
      const op = lesson?.opening_prompt || '';
      const pn = lesson?.pastor_notes || '';
      const cp = lesson?.closing_prompt || 'What are your thoughts?';
      const hw = lesson?.homework_text || '';
      const hex = lesson?.homework_expires_at || null;
      setOpeningPrompt(op);
      setPastorNotes(pn);
      setClosingPrompt(cp);
      setHomeworkText(hw);
      setHomeworkExpiresAt(hex);
      setSavedSnapshot({
        openingPrompt: op,
        pastorNotes: pn,
        closingPrompt: cp,
        homeworkText: hw,
      });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, topicId]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Compute homework_expires_at on save when homework_text is set.
      // We use the topic's discussed_on if present; otherwise next Sunday.
      let expiresAt = homeworkExpiresAt;
      if (homeworkText.trim()) {
        // Anchor expiration to the discussion date if we have one
        // (so old homework auto-hides on the right Sunday).
        const anchor = topic?.discussed_on
          ? new Date(topic.discussed_on + 'T00:00:00')
          : new Date();
        expiresAt = computeHomeworkExpiration(anchor).toISOString();
      } else {
        expiresAt = null;
      }
      const savedLesson = await upsertLesson({
        ownerUserId: user.id,
        topicId,
        openingPrompt: openingPrompt.trim() || null,
        pastorNotes,
        closingPrompt: closingPrompt.trim() || 'What are your thoughts?',
        homeworkText: homeworkText.trim() || null,
        homeworkExpiresAt: expiresAt,
      });
      if (savedLesson?.id && !lessonId) setLessonId(savedLesson.id);
      setSavedSnapshot({
        openingPrompt,
        pastorNotes,
        closingPrompt,
        homeworkText,
      });
      setHomeworkExpiresAt(expiresAt);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const applyDraft = ({ opening_prompt, pastor_notes, closing_prompt, mode }) => {
    setOpeningPrompt(opening_prompt || openingPrompt);
    setClosingPrompt(closing_prompt || closingPrompt);
    if (mode === 'merge' && pastorNotes.trim()) {
      const sep = pastorNotes.endsWith('\n') ? '' : '\n';
      setPastorNotes(pastorNotes + sep + '\n' + pastor_notes);
    } else {
      setPastorNotes(pastor_notes || '');
    }
    setDraftOpen(false);
  };

  const appendIdeaAsBullet = (idea) => {
    const bullet = '- ' + idea.replace(/^[-*•]\s+/, '').trim();
    const sep = pastorNotes.trim() ? '\n' : '';
    setPastorNotes(pastorNotes + sep + bullet);
  };

  const insertVerseIntoNotes = (text) => {
    const sep = pastorNotes.trim() ? '\n\n' : '';
    setPastorNotes(pastorNotes + sep + text);
    setVerseOpen(false);
  };

  const handlePrintLesson = async () => {
    setBusy(true);
    setError(null);
    try {
      // Fetch the latest image list at print time so newly-uploaded
      // images appear in the doc without requiring a page refresh.
      const images = lessonId ? await listImages(lessonId) : [];
      await exportLessonDocx({
        topicText: topic.text,
        openingPrompt,
        pastorNotes,
        closingPrompt,
        images,
        dateForFilename: topic.discussed_on || '',
      });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleMarkActive = async () => {
    if (!window.confirm('Mark this lesson as the active (this-Sunday) lesson?'))
      return;
    setBusy(true);
    try {
      await setStatus(topicId, 'active');
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleFinalize = async () => {
    if (
      !window.confirm(
        'Finalize this lesson? It will move to Past Topics. (You can still edit it after.)'
      )
    )
      return;
    setBusy(true);
    try {
      // If no discussed_on yet, stamp today.
      const extra = topic?.discussed_on
        ? {}
        : { discussed_on: new Date().toISOString().slice(0, 10) };
      await setStatus(topicId, 'past', extra);
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRevertStatus = async (newStatus) => {
    if (
      !window.confirm(
        `Move this lesson back to "${newStatus.replace(/_/g, ' ')}"?`
      )
    )
      return;
    setBusy(true);
    try {
      await setStatus(topicId, newStatus);
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading lesson…" />;
  if (error && !topic) {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">
          ← Dashboard
        </Link>
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      </div>
    );
  }
  if (!topic) return null;

  const homeworkActive = isHomeworkActive({
    homework_text: homeworkText,
    homework_expires_at: homeworkExpiresAt,
  });

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">
        ← Dashboard
      </Link>

      {/* Topic header */}
      <div className="card space-y-2">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span
            className={
              'text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ' +
              (topic.status === 'active'
                ? 'bg-green-100 text-green-800'
                : topic.status === 'picked_for_next'
                  ? 'bg-blue-100 text-blue-800'
                  : topic.status === 'past'
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-amber-100 text-amber-800')
            }
          >
            {topic.status.replace(/_/g, ' ')}
          </span>
          <span className="text-xs text-gray-500">
            {topic.picked_by?.display_name &&
              `Picked by ${topic.picked_by.display_name}`}
            {topic.picked_by?.display_name && topic.discussed_on && ' · '}
            {topic.discussed_on && `For ${topic.discussed_on}`}
          </span>
        </div>
        <h1 className="font-serif text-2xl text-umc-900 leading-tight">
          {topic.text}
        </h1>
      </div>

      {/* Action bar */}
      <div className="card flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDraftOpen(true)}
          disabled={busy}
          className="btn-secondary text-sm disabled:opacity-50"
        >
          ✨ Have Claude make a draft
        </button>
        <button
          type="button"
          onClick={() => setBrainstormOpen(true)}
          disabled={busy}
          className="btn-secondary text-sm disabled:opacity-50"
        >
          💡 Brainstorm
        </button>
        <button
          type="button"
          onClick={() => setVerseOpen(true)}
          disabled={busy}
          className="btn-secondary text-sm disabled:opacity-50"
        >
          📖 Insert verse
        </button>
        <button
          type="button"
          onClick={handlePrintLesson}
          disabled={busy}
          className="btn-secondary text-sm disabled:opacity-50"
        >
          📄 Print to Word
        </button>
        <div className="flex-1" />
        {topic.status === 'picked_for_next' && (
          <button
            type="button"
            onClick={handleMarkActive}
            disabled={busy}
            className="btn-secondary text-sm disabled:opacity-50"
            title="Promote to today's-class lesson"
          >
            ▶ Mark Active
          </button>
        )}
        {(topic.status === 'active' || topic.status === 'picked_for_next') && (
          <button
            type="button"
            onClick={handleFinalize}
            disabled={busy}
            className="btn-primary text-sm disabled:opacity-50"
          >
            ✓ Finalize (move to Past)
          </button>
        )}
        {topic.status === 'past' && (
          <button
            type="button"
            onClick={() => handleRevertStatus('active')}
            disabled={busy}
            className="text-xs text-gray-600 hover:text-gray-900 underline disabled:opacity-50"
          >
            Re-open
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Lesson editor */}
      <div className="card space-y-4">
        <div>
          <label className="label">Opening prompt</label>
          <textarea
            className="input font-serif text-sm leading-relaxed min-h-[60px]"
            value={openingPrompt}
            onChange={(e) => setOpeningPrompt(e.target.value)}
            placeholder="Brief invitation into the question (1-3 sentences)."
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <label className="label mb-0">
              Pastor notes (one bullet per line, starting with "- ")
            </label>
            <span className="text-[11px] text-gray-500">
              {pastorNotes.split(/\r?\n/).filter((l) => l.trim()).length} lines
            </span>
          </div>
          <textarea
            className="input font-serif text-sm leading-relaxed min-h-[300px]"
            value={pastorNotes}
            onChange={(e) => setPastorNotes(e.target.value)}
            placeholder={
              '- bullet point one\n- bullet point two\n- bullet point three…'
            }
          />
        </div>
        <div>
          <label className="label">Closing prompt</label>
          <input
            className="input text-sm"
            value={closingPrompt}
            onChange={(e) => setClosingPrompt(e.target.value)}
          />
        </div>

        {/* Homework */}
        <div>
          <label className="label">
            Homework for next Sunday (optional)
          </label>
          <textarea
            className="input text-sm min-h-[60px]"
            value={homeworkText}
            onChange={(e) => setHomeworkText(e.target.value)}
            placeholder={
              'e.g. "Read Matthew 5:1-12 before Sunday and pick one beatitude that puzzles you."'
            }
          />
          {homeworkText.trim() && (
            <p className="text-[11px] text-gray-500 mt-1">
              {homeworkActive
                ? `Will show on the public page until ${homeworkExpiresAt ? new Date(homeworkExpiresAt).toLocaleString() : 'class time Sunday'}.`
                : 'Will be saved with an expiration of class time Sunday.'}
            </p>
          )}
        </div>

        {/* Save bar */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
          {dirty && (
            <span className="text-xs text-amber-700">Unsaved changes</span>
          )}
        </div>
      </div>

      {/* Image library */}
      <div className="card">
        <LessonImagesPanel
          key={imagesRefreshKey}
          lessonId={lessonId}
          ownerUserId={user.id}
        />
      </div>

      {/* Modals */}
      {draftOpen && (
        <DraftLessonModal
          question={topic.text}
          currentNotes={pastorNotes}
          lessonId={lessonId}
          ownerUserId={user.id}
          onApply={applyDraft}
          onClose={() => setDraftOpen(false)}
          onLibraryChanged={() => setImagesRefreshKey((k) => k + 1)}
        />
      )}
      {brainstormOpen && (
        <BrainstormLessonModal
          question={topic.text}
          onUseIdea={appendIdeaAsBullet}
          onClose={() => setBrainstormOpen(false)}
        />
      )}
      {verseOpen && (
        <InsertVerseModal
          onInsert={insertVerseIntoNotes}
          onClose={() => setVerseOpen(false)}
        />
      )}
    </div>
  );
}
