import { useEffect, useState, useMemo, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import DraftLessonModal from '../components/DraftLessonModal.jsx';
import BrainstormLessonModal from '../components/BrainstormLessonModal.jsx';
import InsertVerseModal from '../components/InsertVerseModal.jsx';
import LessonImagesPanel from '../components/LessonImagesPanel.jsx';
import SectionEditor from '../components/SectionEditor.jsx';
import { listImages } from '../lib/lessonImages';
import { supabase, withTimeout } from '../lib/supabase';
import {
  loadLessonForTopic,
  upsertLesson,
  computeHomeworkExpiration,
  isHomeworkActive,
} from '../lib/lessons';
import { setStatus } from '../lib/topics';
import { exportLessonDocx } from '../lib/exportLessonDocx';
import { exportBackPageDocx } from '../lib/exportBackPageDocx';
import { listTopics } from '../lib/topics';
import { listMembers } from '../lib/members';

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
  // Lesson sections — ordered list of {header, body}. New lessons
  // start with one empty section; legacy lessons get auto-converted
  // on load (see lib/lessons.js).
  const [sections, setSections] = useState([{ header: '', body: '' }]);
  // Which section the cursor was last in, for routing ✨ Draft /
  // 💡 Brainstorm / 📖 Insert-verse output to the right place.
  // Defaults to the last section (most natural for appending notes).
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  // Ref array so we can read selectionStart on the active textarea
  // when inserting verses at the cursor.
  const sectionBodyRefs = useRef([]);
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
    // Dirty if sections or homework differ from last-saved snapshot.
    const savedSecJson = JSON.stringify(savedSnapshot.sections || []);
    const currentSecJson = JSON.stringify(sections);
    if (savedSecJson !== currentSecJson) return true;
    if ((savedSnapshot.homeworkText || '') !== (homeworkText || '')) return true;
    return false;
  }, [savedSnapshot, sections, homeworkText]);

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
      // loadLessonForTopic guarantees a sections array (auto-converted
      // from legacy fields if needed). For brand-new lessons (no row
      // yet), start with a single empty section.
      const loadedSections =
        lesson?.sections && lesson.sections.length > 0
          ? lesson.sections
          : [{ header: '', body: '' }];
      setSections(loadedSections);
      setActiveSectionIdx(Math.max(0, loadedSections.length - 1));
      const hw = lesson?.homework_text || '';
      const hex = lesson?.homework_expires_at || null;
      setHomeworkText(hw);
      setHomeworkExpiresAt(hex);
      setSavedSnapshot({
        sections: loadedSections,
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
        sections,
        homeworkText: homeworkText.trim() || null,
        homeworkExpiresAt: expiresAt,
      });
      if (savedLesson?.id && !lessonId) setLessonId(savedLesson.id);
      setSavedSnapshot({
        sections: savedLesson?.sections || sections,
        homeworkText,
      });
      setHomeworkExpiresAt(expiresAt);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  // --- Section mutation helpers ---------------------------------------

  const updateSection = (idx, patch) => {
    setSections((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    );
  };

  const addSection = () => {
    setSections((prev) => {
      const next = [...prev, { header: '', body: '' }];
      setActiveSectionIdx(next.length - 1);
      return next;
    });
  };

  const deleteSection = (idx) => {
    if (sections.length <= 1) {
      // Don't allow deleting the last section — clear it instead.
      setSections([{ header: '', body: '' }]);
      setActiveSectionIdx(0);
      return;
    }
    if (
      !window.confirm(
        `Delete section "${sections[idx]?.header || 'this section'}"?`
      )
    ) {
      return;
    }
    setSections((prev) => prev.filter((_, i) => i !== idx));
    setActiveSectionIdx((cur) => Math.max(0, Math.min(cur, sections.length - 2)));
  };

  const moveSection = (idx, dir) => {
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= sections.length) return;
    setSections((prev) => {
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    setActiveSectionIdx(target);
  };

  // applyDraft handles two shapes from the Draft modal:
  //   - New sections-aware shape: { sections: [{header, body}, ...], mode }
  //   - Legacy three-field shape: { opening_prompt, pastor_notes, closing_prompt, mode }
  //     (kept temporarily for backward compat in case any cached modal
  //     state references it)
  const applyDraft = (payload) => {
    const mode = payload?.mode || 'replace';
    let incoming = [];
    if (Array.isArray(payload?.sections)) {
      incoming = payload.sections
        .filter(
          (s) => s && (typeof s.header === 'string' || typeof s.body === 'string')
        )
        .map((s) => ({
          header: typeof s.header === 'string' ? s.header : '',
          body: typeof s.body === 'string' ? s.body : '',
        }));
    } else {
      // Legacy three-field path — synthesize sections.
      if (payload?.opening_prompt) {
        incoming.push({ header: 'Opening Prompt', body: payload.opening_prompt });
      }
      if (payload?.pastor_notes) {
        incoming.push({ header: "Pastor's Notes", body: payload.pastor_notes });
      }
      if (payload?.closing_prompt) {
        incoming.push({ header: 'Closing Prompt', body: payload.closing_prompt });
      }
    }
    if (incoming.length === 0) {
      setDraftOpen(false);
      return;
    }
    setSections((prev) => {
      const hasMeaningful = prev.some(
        (s) => (s.header || '').trim() || (s.body || '').trim()
      );
      if (mode === 'merge' && hasMeaningful) {
        return [...prev, ...incoming];
      }
      return incoming;
    });
    setActiveSectionIdx(incoming.length - 1);
    setDraftOpen(false);
  };

  // Append brainstorm idea as a bullet at the end of the active section.
  const appendIdeaAsBullet = (idea) => {
    const bullet = '- ' + idea.replace(/^[-*•]\s+/, '').trim();
    setSections((prev) => {
      const safeIdx = Math.max(0, Math.min(activeSectionIdx, prev.length - 1));
      return prev.map((s, i) => {
        if (i !== safeIdx) return s;
        const cur = s.body || '';
        const sep = cur.trim() ? (cur.endsWith('\n') ? '' : '\n') : '';
        return { ...s, body: cur + sep + bullet };
      });
    });
  };

  // Insert NRSVUe verse at cursor in active section's body, or append
  // if no selection / unfocused.
  const insertVerseIntoNotes = (text) => {
    setSections((prev) => {
      const safeIdx = Math.max(0, Math.min(activeSectionIdx, prev.length - 1));
      return prev.map((s, i) => {
        if (i !== safeIdx) return s;
        const body = s.body || '';
        const ref = sectionBodyRefs.current[safeIdx];
        if (
          ref &&
          typeof ref.selectionStart === 'number' &&
          typeof ref.selectionEnd === 'number' &&
          ref === document.activeElement
        ) {
          const start = ref.selectionStart;
          const end = ref.selectionEnd;
          const before = body.slice(0, start);
          const after = body.slice(end);
          const pad = before.length && !before.endsWith('\n') ? '\n\n' : '';
          const padAfter = after.length && !after.startsWith('\n') ? '\n\n' : '';
          return { ...s, body: before + pad + text + padAfter + after };
        }
        const sep = body.trim() ? '\n\n' : '';
        return { ...s, body: body + sep + text };
      });
    });
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
        sections,
        images,
        dateForFilename: topic.discussed_on || '',
      });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // Print the class back page — same content the Dashboard button
  // generates (future topics + past topics + active roster). Handy to
  // keep here so the pastor can print both the lesson handout and the
  // back page in the same trip to the workspace.
  const handlePrintBackPage = async () => {
    setBusy(true);
    setError(null);
    try {
      const [allTopics, members] = await Promise.all([
        listTopics(user.id),
        listMembers(user.id),
      ]);
      const futureTopics = allTopics.filter(
        (t) => t.status === 'possible_future'
      );
      const pastTopics = allTopics.filter((t) => t.status === 'past');
      await exportBackPageDocx({
        futureTopics,
        pastTopics,
        rosterMembers: members,
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
        <button
          type="button"
          onClick={handlePrintBackPage}
          disabled={busy}
          className="btn-secondary text-sm disabled:opacity-50"
          title="Print the class back page — future topics + past topics + roster"
        >
          📋 Print Back Page
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

      {/* Lesson editor — flexible sections */}
      <div className="card space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg text-umc-900">Sections</h2>
          <span className="text-[11px] text-gray-500">
            {sections.length} section{sections.length === 1 ? '' : 's'}
            {' · '}
            Active: §{Math.max(1, Math.min(activeSectionIdx + 1, sections.length))}
          </span>
        </div>
        <p className="text-[11px] text-gray-500">
          Each section has a header and body. Name them whatever fits this
          week's lesson. The "active" section (highlighted) receives
          brainstorm "Use this" bullets and inserted verses.
        </p>
        <ul className="space-y-3">
          {sections.map((s, idx) => (
            <li key={idx}>
              <SectionEditor
                section={s}
                index={idx}
                total={sections.length}
                isActive={idx === activeSectionIdx}
                onChange={(patch) => updateSection(idx, patch)}
                onDelete={() => deleteSection(idx)}
                onMoveUp={() => moveSection(idx, 'up')}
                onMoveDown={() => moveSection(idx, 'down')}
                onFocusBody={() => setActiveSectionIdx(idx)}
                bodyRef={(el) => {
                  sectionBodyRefs.current[idx] = el;
                }}
              />
            </li>
          ))}
        </ul>
        <div>
          <button
            type="button"
            onClick={addSection}
            className="btn-secondary text-sm"
          >
            + Add section
          </button>
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
