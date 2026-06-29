import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, withTimeout } from '../lib/supabase';
import { publicUrlFor } from '../lib/lessonImages';
import { isHomeworkActive, lessonSectionsOf } from '../lib/lessons';
import LessonBodyView from '../components/LessonBodyView.jsx';
import { PASTOR_USER_ID } from '../lib/config';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

// Public "This Sunday" page — the active lesson (or, if no active
// lesson exists, the picked_for_next lesson) rendered for class
// members.
export default function PublicActive() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topic, setTopic] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [images, setImages] = useState([]);
  const [picker, setPicker] = useState(null);

  useEffect(() => {
    if (!PASTOR_USER_ID) {
      setError(
        'Public site not configured. Pastor: set VITE_PASTOR_USER_ID in the deploy environment.'
      );
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Prefer an active topic; fall back to picked_for_next.
        const { data: topics, error: tErr } = await withTimeout(
          supabase
            .from('ss_topics')
            .select(
              'id, text, status, discussed_on, picked_by_member_id, ' +
                'picked_by:picked_by_member_id(id, display_name)'
            )
            .eq('owner_user_id', PASTOR_USER_ID)
            .in('status', ['active', 'picked_for_next'])
            .order('status', { ascending: true }) // 'active' < 'picked_for_next' alphabetically? No — explicit sort below
        );
        if (tErr) throw tErr;
        // Manual rank: active first, then picked_for_next, then by
        // discussed_on desc to surface the soonest service.
        const ranked = (topics || []).slice().sort((a, b) => {
          const order = { active: 0, picked_for_next: 1 };
          const ra = order[a.status] ?? 9;
          const rb = order[b.status] ?? 9;
          if (ra !== rb) return ra - rb;
          const da = a.discussed_on || '';
          const db = b.discussed_on || '';
          return da < db ? 1 : -1;
        });
        const chosen = ranked[0] || null;
        if (cancelled) return;
        setTopic(chosen);
        setPicker(chosen?.picked_by || null);
        if (!chosen) {
          setLesson(null);
          setImages([]);
          return;
        }
        const [lessonRes, imageRes] = await Promise.all([
          withTimeout(
            supabase
              .from('ss_lessons')
              .select('*')
              .eq('topic_id', chosen.id)
              .maybeSingle()
          ),
          withTimeout(
            supabase
              .from('ss_lesson_images')
              .select('*')
              .eq('lesson_id', '00000000-0000-0000-0000-000000000000') // placeholder; replaced below
          ),
        ]);
        if (lessonRes.error) throw lessonRes.error;
        const loadedLesson = lessonRes.data || null;
        setLesson(loadedLesson);
        // Now load images using the actual lesson id.
        if (loadedLesson?.id) {
          const { data: imgs, error: iErr } = await withTimeout(
            supabase
              .from('ss_lesson_images')
              .select('*')
              .eq('lesson_id', loadedLesson.id)
              .eq('include_in_print', true)
              .order('sort_order', { ascending: true })
          );
          if (iErr) throw iErr;
          if (!cancelled) setImages(imgs || []);
        } else {
          if (!cancelled) setImages([]);
        }
        // imageRes unused (placeholder query above just to keep
        // the Promise.all shape simple). Ignored.
        void imageRes;
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

  if (loading) return <LoadingSpinner label="Loading this Sunday's lesson…" />;
  if (error) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
        {error}
      </p>
    );
  }
  if (!topic) {
    return (
      <div className="space-y-4">
        <h2 className="font-serif text-xl text-umc-900">This Sunday</h2>
        <p className="text-sm text-gray-600">
          No lesson selected yet. Check back soon, or{' '}
          <Link to="/public/suggest" className="underline">
            suggest a question
          </Link>
          .
        </p>
      </div>
    );
  }

  const homework = isHomeworkActive(lesson || {});
  const lessonSections = lessonSectionsOf(lesson);

  return (
    <article className="space-y-5">
      <div>
        {topic.status === 'active' && (
          <p className="text-[11px] uppercase tracking-wide text-green-700 font-medium">
            Active lesson — discussing now
          </p>
        )}
        {topic.status === 'picked_for_next' && (
          <p className="text-[11px] uppercase tracking-wide text-blue-700 font-medium">
            Coming up{topic.discussed_on ? ` · ${topic.discussed_on}` : ''}
          </p>
        )}
        <h2 className="font-serif text-2xl text-umc-900 mt-1 leading-tight">
          {topic.text}
        </h2>
        {picker?.display_name && (
          <p className="text-xs text-gray-500 mt-1">
            Picked by {picker.display_name}
          </p>
        )}
      </div>

      {homework && (
        <div className="bg-amber-50 border-l-4 border-amber-400 px-4 py-3 rounded">
          <p className="text-[11px] uppercase tracking-wide text-amber-800 font-medium">
            Homework before class
          </p>
          <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap font-serif leading-relaxed">
            {lesson.homework_text}
          </p>
        </div>
      )}

      <LessonBodyView sections={lessonSections} />

      {images.length > 0 && (
        <div className="space-y-4 mt-6 pt-4 border-t border-gray-100">
          {images.map((img) => (
            <figure key={img.id} className="space-y-1">
              <img
                src={publicUrlFor(img.storage_path)}
                alt={img.caption || img.original_name || ''}
                className="w-full rounded border border-gray-200"
              />
              {img.caption && (
                <figcaption className="text-xs text-gray-600 italic text-center">
                  {img.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      {!lesson && lessonSections.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          Lesson notes coming soon.
        </p>
      )}
    </article>
  );
}
