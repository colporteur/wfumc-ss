import { useEffect, useMemo, useState } from 'react';
import { supabase, withTimeout } from '../lib/supabase';
import { PASTOR_USER_ID } from '../lib/config';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

// Public Past & Possible-Future topics list. Two tabs.
export default function PublicTopics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topics, setTopics] = useState([]);
  const [tab, setTab] = useState('past');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!PASTOR_USER_ID) {
      setError('Public site not configured.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await withTimeout(
          supabase
            .from('ss_topics')
            .select('id, text, status, discussed_on, created_at, submitted_by_name')
            .eq('owner_user_id', PASTOR_USER_ID)
            .in('status', ['past', 'possible_future'])
        );
        if (err) throw err;
        if (!cancelled) setTopics(data || []);
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return topics
      .filter((t) => t.status === tab)
      .filter((t) => !q || t.text.toLowerCase().includes(q))
      .sort((a, b) => {
        if (tab === 'past') {
          // Past — most recent first.
          const da = a.discussed_on || '';
          const db = b.discussed_on || '';
          if (da !== db) return da < db ? 1 : -1;
          const ca = a.created_at || '';
          const cb = b.created_at || '';
          return ca < cb ? 1 : -1;
        }
        // Possible future — newest-added first.
        const ca = a.created_at || '';
        const cb = b.created_at || '';
        return ca < cb ? 1 : -1;
      });
  }, [topics, tab, search]);

  const counts = useMemo(() => {
    return {
      past: topics.filter((t) => t.status === 'past').length,
      possible_future: topics.filter((t) => t.status === 'possible_future').length,
    };
  }, [topics]);

  if (loading) return <LoadingSpinner label="Loading topics…" />;
  if (error) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl text-umc-900">Topics</h2>

      <div className="flex gap-1 flex-wrap">
        <TabButton
          active={tab === 'past'}
          onClick={() => setTab('past')}
          label={`Past (${counts.past})`}
        />
        <TabButton
          active={tab === 'possible_future'}
          onClick={() => setTab('possible_future')}
          label={`Possible Future (${counts.possible_future})`}
        />
      </div>

      <input
        className="input text-sm"
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No topics found.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded">
          {filtered.map((t) => (
            <li key={t.id} className="px-3 py-2">
              <p className="text-sm text-gray-900 font-serif">{t.text}</p>
              {(t.discussed_on || t.submitted_by_name) && (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {t.discussed_on}
                  {t.discussed_on && t.submitted_by_name && ' · '}
                  {t.submitted_by_name && `Suggested by ${t.submitted_by_name}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'px-3 py-1.5 rounded text-sm ' +
        (active
          ? 'bg-umc-900 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
      }
    >
      {label}
    </button>
  );
}
