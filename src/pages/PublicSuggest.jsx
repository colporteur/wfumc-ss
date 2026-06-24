import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, withTimeout } from '../lib/supabase';
import { PASTOR_USER_ID } from '../lib/config';

// Anonymous "Suggest a question for the class" form. Submits directly
// into ss_topics with status=possible_future. RLS policy on
// ss_topics anon-INSERT only allows this exact shape (status =
// 'possible_future', submitted_by_name required, no picker/date), so
// the public form can't smuggle in anything dangerous.
export default function PublicSuggest() {
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submittedCount, setSubmittedCount] = useState(0);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError(null);
    const cleanName = name.trim();
    const cleanQ = question.trim();
    if (!cleanName) {
      setError('Please enter your name.');
      return;
    }
    if (!cleanQ) {
      setError('Please enter a question.');
      return;
    }
    if (!PASTOR_USER_ID) {
      setError('Public site not configured.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: err } = await withTimeout(
        supabase.from('ss_topics').insert({
          owner_user_id: PASTOR_USER_ID,
          text: cleanQ,
          status: 'possible_future',
          submitted_by_name: cleanName,
        })
      );
      if (err) throw err;
      setSubmittedCount((n) => n + 1);
      setQuestion('');
      // Keep name in the form so submitting multiple in a row is easy.
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl text-umc-900">
          Suggest a question
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Have a question you'd like the class to explore? Drop it
          below — it goes straight into our "Possible Future Topics"
          list.
        </p>
      </div>

      {submittedCount > 0 && (
        <div className="bg-green-50 border border-green-200 rounded px-3 py-2 text-sm text-green-800">
          ✓ Thanks! Your suggestion{submittedCount > 1 ? 's are' : ' is'} on the list.
          {submittedCount > 1 && (
            <span className="text-xs ml-1">({submittedCount} submitted)</span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label" htmlFor="ss-name">
            Your name <span className="text-red-600">*</span>
          </label>
          <input
            id="ss-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name is fine"
            autoComplete="name"
            disabled={submitting}
          />
        </div>
        <div>
          <label className="label" htmlFor="ss-q">
            Question <span className="text-red-600">*</span>
          </label>
          <textarea
            id="ss-q"
            className="input min-h-[100px] font-serif"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. What does the church look like if we started from scratch?"
            disabled={submitting}
          />
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !name.trim() || !question.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Submit suggestion'}
          </button>
          <Link to="/public" className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to This Sunday
          </Link>
        </div>
      </form>
    </div>
  );
}
