import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import {
  listMembers,
  createMember,
  updateMember,
  deactivateMember,
  reactivateMember,
  deleteMember,
  bulkCreateMembers,
} from '../lib/members';
import { SEED_ROSTER } from '../lib/seedData';

export default function Roster() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [members, setMembers] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const reload = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listMembers(user.id, { includeInactive: showInactive });
      setMembers(list);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, showInactive]);

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createMember(user.id, newName);
      setNewName('');
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleStartEdit = (m) => {
    setEditingId(m.id);
    setEditValue(m.display_name);
  };

  const handleSaveEdit = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateMember(editingId, { display_name: editValue });
      setEditingId(null);
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (m) => {
    setBusy(true);
    setError(null);
    try {
      if (m.active) await deactivateMember(m.id);
      else await reactivateMember(m.id);
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (m) => {
    if (
      !window.confirm(
        `Delete ${m.display_name}? This removes all their attendance records too. ` +
          'If they may return, use Deactivate instead.'
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await deleteMember(m.id);
      await reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSeed = async () => {
    if (
      !window.confirm(
        `Seed ${SEED_ROSTER.length} initial member names? Already-present names are skipped.`
      )
    )
      return;
    setSeeding(true);
    setError(null);
    try {
      const result = await bulkCreateMembers(user.id, SEED_ROSTER);
      window.alert(
        `Inserted ${result.inserted} member${result.inserted === 1 ? '' : 's'}.` +
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

  if (loading) return <LoadingSpinner label="Loading roster…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-umc-900">Class Roster</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {members.length} member{members.length === 1 ? '' : 's'}
            {showInactive ? ' (including inactive)' : ''}
          </p>
        </div>
        <label className="text-xs text-gray-700 flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Empty-state seed button */}
      {members.length === 0 && !loading && (
        <div className="card bg-amber-50 border-amber-200">
          <p className="text-sm text-gray-700">
            Roster is empty. Seed the initial {SEED_ROSTER.length} member names?
          </p>
          <button
            type="button"
            onClick={handleSeed}
            disabled={seeding}
            className="btn-primary text-sm mt-3 disabled:opacity-50"
          >
            {seeding ? 'Seeding…' : 'Seed initial roster'}
          </button>
        </div>
      )}

      {/* Add new */}
      <form onSubmit={handleAdd} className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="label" htmlFor="newname">
            Add member
          </label>
          <input
            id="newname"
            className="input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="First name (e.g. Cynthia B)"
          />
        </div>
        <button
          type="submit"
          disabled={!newName.trim() || busy}
          className="btn-primary disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {/* List */}
      {members.length > 0 && (
        <ul className="card divide-y divide-gray-100 p-0">
          {members.map((m) => (
            <li
              key={m.id}
              className={
                'flex items-center justify-between gap-3 px-4 py-3 ' +
                (m.active ? '' : 'opacity-50')
              }
            >
              {editingId === m.id ? (
                <>
                  <input
                    className="input flex-1"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
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
                  <span className="text-sm">
                    {m.display_name}
                    {!m.active && (
                      <span className="ml-2 text-[10px] uppercase text-gray-500">
                        inactive
                      </span>
                    )}
                  </span>
                  <div className="flex gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(m)}
                      className="text-umc-700 hover:text-umc-900 underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(m)}
                      disabled={busy}
                      className="text-gray-600 hover:text-gray-900 underline disabled:opacity-50"
                    >
                      {m.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(m)}
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
