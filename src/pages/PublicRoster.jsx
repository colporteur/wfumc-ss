import { useEffect, useState } from 'react';
import { supabase, withTimeout } from '../lib/supabase';
import { PASTOR_USER_ID } from '../lib/config';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function PublicRoster() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [members, setMembers] = useState([]);

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
            .from('ss_members')
            .select('id, display_name')
            .eq('owner_user_id', PASTOR_USER_ID)
            .eq('active', true)
            .order('sort_key', { ascending: true })
        );
        if (err) throw err;
        if (!cancelled) setMembers(data || []);
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

  if (loading) return <LoadingSpinner label="Loading roster…" />;
  if (error) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl text-umc-900">
        Active Roster ({members.length})
      </h2>
      {members.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No members yet.</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-sm font-serif">
          {members.map((m) => (
            <li key={m.id} className="text-gray-800">
              {m.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
