import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import { CLASS_NAME } from '../lib/config';
import { listMembers } from '../lib/members';
import { listTopics, setStatus, updateTopic } from '../lib/topics';
import {
  nextSundayISO,
  lastSundayISO,
  getPresentMemberIds,
} from '../lib/attendance';
import { recommendNextPicker } from '../lib/rotation';
import { exportBackPageDocx } from '../lib/exportBackPageDocx';

// Pastor's home screen. Shows:
//   - Today's-class block: present count + next-up picker (with manual
//     override) + button to mark "they picked topic X"
//   - Next-Sunday lesson status (the active/picked-for-next topic)
//   - Counts: possible_future, past, roster size
//   - Quick links to the four pages
export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [members, setMembers] = useState([]);
  const [allTopics, setAllTopics] = useState([]);
  const [presentIds, setPresentIds] = useState(new Set());
  // "Today" for picking purposes — we use the most recent Sunday (or
  // today if it IS Sunday) since the pick happens DURING class.
  const meetingDate = useMemo(() => lastSundayISO(), []);
  const nextSunday = useMemo(() => nextSundayISO(), []);
  // Pastor can override the rotation cursor with "Start from member X".
  const [overrideLastPickerId, setOverrideLastPickerId] = useState(null);
  // Which topic to assign as the pick (defaults to the first
  // possible_future after the picked-for-next slot is empty).
  const [topicToAssign, setTopicToAssign] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [mems, topics, present] = await Promise.all([
        listMembers(user.id),
        listTopics(user.id),
        getPresentMemberIds(user.id, meetingDate),
      ]);
      setMembers(mems);
      setAllTopics(topics);
      setPresentIds(present);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, meetingDate]);

  const recommendation = useMemo(
    () =>
      recommendNextPicker({
        members,
        topics: allTopics,
        presentIds,
        overrideLastPickerId,
      }),
    [members, allTopics, presentIds, overrideLastPickerId]
  );

  const possibleFuture = useMemo(
    () => allTopics.filter((t) => t.status === 'possible_future'),
    [allTopics]
  );
  const pickedForNext = useMemo(
    () => allTopics.find((t) => t.status === 'picked_for_next'),
    [allTopics]
  );
  const activeLesson = useMemo(
    () => allTopics.find((t) => t.status === 'active'),
    [allTopics]
  );
  const pastCount = useMemo(
    () => allTopics.filter((t) => t.status === 'past').length,
    [allTopics]
  );

  const handleMarkPicked = async () => {
    if (!recommendation.next || !topicToAssign) return;
    setBusy(true);
    setError(null);
    try {
      await setStatus(topicToAssign, 'picked_for_next', {
        picked_by_member_id: recommendation.next.id,
        discussed_on: nextSunday,
      });
      setOverrideLastPickerId(null);
      setTopicToAssign('');
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handlePrintBackPage = async () => {
    setBusy(true);
    setError(null);
    try {
      const futureTopics = allTopics.filter((t) => t.status === 'possible_future');
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

  const handleClearNextPick = async () => {
    if (!pickedForNext) return;
    if (
      !window.confirm(
        `Move "${pickedForNext.text}" back to Possible Future Topics? (Pick will need to be made again.)`
      )
    )
      return;
    setBusy(true);
    try {
      await updateTopic(pickedForNext.id, {
        status: 'possible_future',
        picked_by_member_id: null,
        discussed_on: null,
      });
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading dashboard…" />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-umc-900">{CLASS_NAME}</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Class meets Sundays · {nextSunday === meetingDate ? 'Today' : `Next Sunday: ${nextSunday}`}
          </p>
        </div>
        <button
          type="button"
          onClick={handlePrintBackPage}
          disabled={busy}
          className="btn-secondary text-sm disabled:opacity-50"
          title="Word doc: Possible Future + Past + Roster on one page"
        >
          📋 Print Back Page
        </button>
      </div>

      <PublicLinkCard />

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Today's class card */}
      <div className="card space-y-4">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h2 className="font-serif text-lg text-umc-900">
            Pick rotation — {meetingDate}
          </h2>
          <span className="text-xs text-gray-500">
            {presentIds.size} present ·{' '}
            <Link to="/attendance" className="underline">
              Edit attendance
            </Link>
          </span>
        </div>

        {presentIds.size === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            No attendance recorded for {meetingDate} yet. Mark who's present
            on the <Link to="/attendance" className="underline">Attendance page</Link>.
          </p>
        ) : recommendation.next ? (
          <>
            <div className="bg-umc-50 border border-umc-200 rounded p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Next to pick
              </p>
              <p className="font-serif text-xl text-umc-900 mt-1">
                {recommendation.next.display_name}
              </p>
            </div>

            {/* Manual override */}
            <div>
              <label className="text-xs text-gray-600 block mb-1">
                Start rotation from a different member (manual override)
              </label>
              <select
                value={overrideLastPickerId || ''}
                onChange={(e) => setOverrideLastPickerId(e.target.value || null)}
                className="input text-sm"
              >
                <option value="">— Use natural alpha order —</option>
                {members
                  .filter((m) => presentIds.has(m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      Start after {m.display_name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Topic assignment */}
            <div>
              <label className="text-xs text-gray-600 block mb-1">
                Topic they picked
              </label>
              <select
                value={topicToAssign}
                onChange={(e) => setTopicToAssign(e.target.value)}
                className="input text-sm"
                disabled={possibleFuture.length === 0}
              >
                <option value="">
                  {possibleFuture.length === 0
                    ? '(no possible future topics — add one first)'
                    : '— Pick a topic from Possible Future —'}
                </option>
                {possibleFuture.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.text.length > 80 ? t.text.slice(0, 80) + '…' : t.text}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Or <Link to="/topics" className="underline">add a new topic</Link> on
                the Topics page first.
              </p>
            </div>

            <button
              type="button"
              onClick={handleMarkPicked}
              disabled={!topicToAssign || busy}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {busy ? 'Recording…' : `Record pick by ${recommendation.next.display_name}`}
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-600">{recommendation.reason}</p>
        )}
      </div>

      {/* Next Sunday lesson */}
      <div className="card space-y-2">
        <h2 className="font-serif text-lg text-umc-900">Next Sunday's lesson</h2>
        {pickedForNext ? (
          <>
            <p className="text-sm text-gray-500">
              For {pickedForNext.discussed_on || nextSunday} · picked by{' '}
              {pickedForNext.picked_by?.display_name || '(unknown)'}
            </p>
            <p className="font-serif text-base text-umc-900 mt-1">
              {pickedForNext.text}
            </p>
            <div className="flex gap-3 text-xs mt-2 flex-wrap">
              <Link
                to={`/lesson/${pickedForNext.id}`}
                className="btn-primary text-xs"
              >
                ✏ Edit lesson
              </Link>
              <button
                type="button"
                onClick={handleClearNextPick}
                className="text-red-700 hover:text-red-900 underline"
              >
                Clear pick
              </button>
            </div>
          </>
        ) : activeLesson ? (
          <>
            <p className="text-sm text-gray-600">Active lesson:</p>
            <p className="font-serif text-base text-umc-900 mt-1">
              {activeLesson.text}
            </p>
            <div className="mt-2">
              <Link
                to={`/lesson/${activeLesson.id}`}
                className="btn-primary text-xs"
              >
                ✏ Edit lesson
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500 italic">
            No topic picked for next Sunday yet. Use the rotation block above.
          </p>
        )}
      </div>

      {/* Counts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <DashCard
          to="/topics"
          title="Possible Future Topics"
          count={possibleFuture.length}
        />
        <DashCard
          to="/topics"
          title="Past Topics"
          count={pastCount}
        />
        <DashCard
          to="/roster"
          title="Active Roster"
          count={members.length}
        />
      </div>
    </div>
  );
}

function DashCard({ to, title, count }) {
  return (
    <Link
      to={to}
      className="card hover:border-umc-700 hover:shadow-md transition group"
    >
      <p className="text-xs uppercase tracking-wide text-gray-500">{title}</p>
      <p className="font-serif text-3xl text-umc-900 mt-1 group-hover:text-umc-700">
        {count}
      </p>
    </Link>
  );
}

// Show the public URL the pastor can share with class members. Resolves
// the URL from window.location.origin + the app's base URL + "public".
// Click-to-copy for convenience.
function PublicLinkCard() {
  const [copied, setCopied] = useState(false);
  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin + (import.meta.env.BASE_URL || '/')
      : '/';
  const publicUrl = baseUrl.replace(/\/$/, '') + '/public';
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.alert('Copy failed. URL: ' + publicUrl);
    }
  };
  return (
    <div className="card bg-umc-50 border-umc-200 space-y-1">
      <p className="text-xs uppercase tracking-wide text-gray-600">
        Class-facing URL
      </p>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-umc-900 font-mono break-all hover:underline"
        >
          {publicUrl}
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs btn-secondary"
        >
          {copied ? '✓ Copied' : 'Copy link'}
        </button>
      </div>
      <p className="text-[11px] text-gray-600">
        Share this with class members — no login required. They can also
        install it as an app on their phone.
      </p>
    </div>
  );
}
