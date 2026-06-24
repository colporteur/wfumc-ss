import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import {
  listTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  setStatus,
  bulkCreateTopics,
} from '../lib/topics';
import { SEED_POSSIBLE_FUTURE, SEED_PAST_TOPICS } from '../lib/seedData';

const TABS = [
  { value: 'possible_future', label: 'Possible Future' },
  { value: 'picked_for_next', label: 'Picked for Next' },
  { value: 'active', label: 'Active' },
  { value: 'past', label: 'Past' },
];

export default function Topics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allTopics, setAllTopics] = useState([]);
  const [tab, setTab] = useState('possible_future');
  const [newTopic, setNewTopic] = useState('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const reload = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listTopics(user.id);
      setAllTopics(list);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTopics
      .filter((t) => t.status === tab)
      .filter((t) => !q || t.text.toLowerCase().includes(q));
  }, [allTopics, tab, search]);

  const counts = useMemo(() => {
    const out = {
      possible_future: 0,
      picked_for_next: 0,
      active: 0,
      past: 0,
    };
    for (const t of allTopics) out[t.status] = (out[t.status] || 0) + 1;
    return out;
  }, [allTopics]);

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    if (!newTopic.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createTopic(user.id, newTopic, {
        status: tab === 'past' ? 'past' : 'possible_future',
      });
      setNewTopic('');
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateTopic(editingId, { text: editValue });
      setEditingId(null);
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (t) => {
    if (
      !window.confirm(
        `Delete "${t.text.slice(0, 80)}${t.text.length > 80 ? '…' : ''}"?`
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await deleteTopic(t.id);
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleMoveTo = async (t, newStatus) => {
    setBusy(true);
    setError(null);
    try {
      const extra =
        newStatus === 'possible_future'
          ? { picked_by_member_id: null, discussed_on: null }
          : {};
      await setStatus(t.id, newStatus, extra);
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSeed = async (kind) => {
    const items =
      kind === 'future'
        ? SEED_POSSIBLE_FUTURE.map((text) => ({
            text,
            status: 'possible_future',
          }))
        : SEED_PAST_TOPICS.map((text) => ({ text, status: 'past' }));
    if (
      !window.confirm(
        `Seed ${items.length} ${kind === 'future' ? 'possible future' : 'past'} topic${items.length === 1 ? '' : 's'}? Already-present text is skipped.`
      )
    )
      return;
    setSeeding(true);
    setError(null);
    try {
      const result = await bulkCreateTopics(user.id, items);
      window.alert(
        `Inserted ${result.inserted} topic${result.inserted === 1 ? '' : 's'}.` +
          (result.skipped > 0
            ? ` Skipped ${result.skipped} that already existed.`
            : '')
      );
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSeeding(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading topics…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-umc-900">Topics</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {allTopics.length} total · manage the question bank for the class
          </p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Seed buttons (only when current tab is empty) */}
      {filtered.length === 0 && (tab === 'possible_future' || tab === 'past') && (
        <div className="card bg-amber-50 border-amber-200">
          <p className="text-sm text-gray-700">
            {tab === 'possible_future'
              ? `${SEED_POSSIBLE_FUTURE.length} possible-future topics are available to seed from the sample lesson doc.`
              : `${SEED_PAST_TOPICS.length} past topics are available to seed from the sample lesson doc.`}
          </p>
          <button
            type="button"
            onClick={() => handleSeed(tab === 'possible_future' ? 'future' : 'past')}
            disabled={seeding}
            className="btn-primary text-sm mt-3 disabled:opacity-50"
          >
            {seeding
              ? 'Seeding…'
              : tab === 'possible_future'
                ? 'Seed Possible Future Topics'
                : 'Seed Past Topics'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={
              'px-3 py-1.5 rounded text-sm ' +
              (tab === t.value
                ? 'bg-umc-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
            }
          >
            {t.label} ({counts[t.value]})
          </button>
        ))}
      </div>

      {/* Add new */}
      <form onSubmit={handleAdd} className="card space-y-2">
        <label className="label" htmlFor="newtopic">
          Add a new topic (goes into{' '}
          {tab === 'past' ? 'Past' : 'Possible Future'})
        </label>
        <div className="flex gap-2">
          <input
            id="newtopic"
            className="input flex-1"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="e.g. What does the church look like if we started from scratch?"
          />
          <button
            type="submit"
            disabled={!newTopic.trim() || busy}
            className="btn-primary disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </form>

      {/* Search */}
      <div>
        <input
          className="input"
          placeholder="Search topics…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No topics in this list{search ? ' match your search' : ''}.
        </p>
      ) : (
        <ul className="card divide-y divide-gray-100 p-0">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="px-4 py-3 flex items-start justify-between gap-3"
            >
              {editingId === t.id ? (
                <>
                  <textarea
                    className="input flex-1 min-h-[60px]"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={busy || !editValue.trim()}
                      className="btn-primary text-xs disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="btn-secondary text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{t.text}</p>
                    {(t.picked_by?.display_name || t.discussed_on) && (
                      <p className="text-[11px] text-gray-500 mt-1">
                        {t.picked_by?.display_name &&
                          `Picked by ${t.picked_by.display_name}`}
                        {t.picked_by?.display_name && t.discussed_on && ' · '}
                        {t.discussed_on}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 text-xs items-end">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(t.id);
                        setEditValue(t.text);
                      }}
                      className="text-umc-700 hover:text-umc-900 underline"
                    >
                      Edit
                    </button>
                    <TopicMoveMenu
                      currentStatus={t.status}
                      onMove={(newStatus) => handleMoveTo(t, newStatus)}
                      busy={busy}
                    />
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      disabled={busy}
                      className="text-red-600 hover:text-red-800 underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopicMoveMenu({ currentStatus, onMove, busy }) {
  const options = TABS.filter((t) => t.value !== currentStatus);
  return (
    <select
      onChange={(e) => {
        if (e.target.value) {
          onMove(e.target.value);
          e.target.value = '';
        }
      }}
      disabled={busy}
      className="text-xs border border-gray-300 rounded px-1 py-0.5 disabled:opacity-50"
      defaultValue=""
    >
      <option value="">Move to…</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
