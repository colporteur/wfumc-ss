import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import { listMembers } from '../lib/members';
import {
  getPresentMemberIds,
  setPresent,
  recentMeetings,
  lastSundayISO,
  nextSundayISO,
  isoDate,
} from '../lib/attendance';

export default function Attendance() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [members, setMembers] = useState([]);
  // Editable meeting date — defaults to the most recent Sunday (or
  // today if today is Sunday). Pastor can change to any date.
  const [meetingDate, setMeetingDate] = useState(() => lastSundayISO());
  const [presentIds, setPresentIds] = useState(new Set());
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(null); // member id currently toggling

  const reload = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [mems, present, hist] = await Promise.all([
        listMembers(user.id),
        getPresentMemberIds(user.id, meetingDate),
        recentMeetings(user.id, { limit: 12 }),
      ]);
      setMembers(mems);
      setPresentIds(present);
      setHistory(hist);
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

  const handleToggle = async (memberId) => {
    setBusy(memberId);
    setError(null);
    const wasPresent = presentIds.has(memberId);
    try {
      await setPresent(user.id, memberId, meetingDate, !wasPresent);
      const next = new Set(presentIds);
      if (wasPresent) next.delete(memberId);
      else next.add(memberId);
      setPresentIds(next);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleMarkAllPresent = async () => {
    if (!window.confirm('Mark every active member present for this meeting?')) return;
    setBusy('ALL');
    setError(null);
    try {
      for (const m of members) {
        if (!presentIds.has(m.id)) {
          await setPresent(user.id, m.id, meetingDate, true);
        }
      }
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleClearAll = async () => {
    if (
      !window.confirm(
        `Clear all attendance for ${meetingDate}? This deletes the present-marks for every member.`
      )
    )
      return;
    setBusy('ALL');
    setError(null);
    try {
      for (const m of members) {
        if (presentIds.has(m.id)) {
          await setPresent(user.id, m.id, meetingDate, false);
        }
      }
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const presentCount = presentIds.size;
  const totalActive = members.length;

  const dateOptions = useMemo(() => {
    // Recent 8 Sundays + next Sunday for quick navigation.
    const sundays = [];
    const today = new Date();
    sundays.push(nextSundayISO(today));
    for (let i = 0; i < 8; i++) {
      const d = new Date(today);
      const day = d.getDay();
      const back = day === 0 ? 7 * i : day + 7 * i;
      d.setDate(d.getDate() - back);
      sundays.push(isoDate(d));
    }
    return Array.from(new Set(sundays));
  }, []);

  if (loading) return <LoadingSpinner label="Loading attendance…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-umc-900">Attendance</h1>
        <p className="text-sm text-gray-600 mt-0.5">
          Tap members to toggle present / absent. Records save instantly.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="card space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <label className="label" htmlFor="meeting-date">
              Meeting date
            </label>
            <div className="flex items-center gap-2">
              <input
                id="meeting-date"
                type="date"
                className="input"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
              />
              <select
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="input text-sm"
                title="Recent Sundays"
              >
                {dateOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Present
            </p>
            <p className="font-serif text-3xl text-umc-900">
              {presentCount}
              <span className="text-base text-gray-400"> / {totalActive}</span>
            </p>
          </div>
        </div>

        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={handleMarkAllPresent}
            disabled={busy === 'ALL'}
            className="text-umc-700 hover:text-umc-900 underline disabled:opacity-50"
          >
            Mark all present
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={busy === 'ALL'}
            className="text-red-700 hover:text-red-900 underline disabled:opacity-50"
          >
            Clear all
          </button>
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No active members in the roster yet.
          </p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {members.map((m) => {
              const present = presentIds.has(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => handleToggle(m.id)}
                    disabled={busy === m.id}
                    className={
                      'w-full text-left px-3 py-2 rounded border text-sm transition ' +
                      (present
                        ? 'bg-umc-50 border-umc-300 text-umc-900'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400')
                    }
                  >
                    <span className="inline-block w-4 mr-2">
                      {present ? '✓' : ''}
                    </span>
                    {m.display_name}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-serif text-lg text-umc-900">Recent meetings</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="py-2">Date</th>
                <th className="py-2">Present</th>
                <th className="py-2 hidden sm:table-cell">Who</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const names = members
                  .filter((m) => h.member_ids.has(m.id))
                  .map((m) => m.display_name)
                  .join(', ');
                return (
                  <tr
                    key={h.meeting_date}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => setMeetingDate(h.meeting_date)}
                        className="text-umc-700 hover:text-umc-900 underline"
                      >
                        {h.meeting_date}
                      </button>
                    </td>
                    <td className="py-2">{h.present_count}</td>
                    <td className="py-2 hidden sm:table-cell text-xs text-gray-600">
                      {names}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
