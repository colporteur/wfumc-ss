import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, withTimeout } from '../lib/supabase';
import { publicUrlFor } from '../lib/lessonImages';
import { isHomeworkActive, lessonSectionsOf } from '../lib/lessons';
import LessonBodyView from '../components/LessonBodyView.jsx';
import { PASTOR_USER_ID } from '../lib/config';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

// Public per-lesson view — for class members revisiting a past lesson
// (most common) or sharing a specific lesson link.
//
// Renders the same way PublicActive does, but for any topic id.
// A topic with no saved lesson body still renders (just shows the
// question + a note that no notes are available).
export default function PublicLesson() {
  const { topicId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topic, setTopic] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [images, setImages] = useState([]);

  useEffect(() => {
    if (!PASTOR_USER_ID || !topicId) {
      setError('Public site not configured.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: t, error: tErr } = await withTimeout(
          supabase
            .from('ss_topics')
            .select(
              'id, text, status, discussed_on, submitted_by_name, ' +
                'picked_by:picked_by_member_id(display_name)'
            )
            .eq('owner_user_id', PASTOR_USER_ID)
            .eq('id', topicId)
            .maybeSingle()
        );
        if (tErr) throw tErr;
        if (!t) {
          setError('Lesson not found.');
          return;
        }
        if (cancelled) return;
        setTopic(t);
        const { data: l, error: lErr } = await withTimeout(
          supabase
            .from('ss_lessons')
            .select('*')
            .eq('topic_id', topicId)
            .maybeSingle()
        );
        if (lErr) throw lErr;
        setLesson(l || null);
        if (l?.id) {
          const { data: imgs, error: iErr } = await withTimeout(
            supabase
              .from('ss_lesson_images')
              .select('*')
              .eq('lesson_id', l.id)
              .eq('include_in_print', true)
              .order('sort_order', { ascending: true })
          );
          if (iErr) throw iErr;
          if (!cancelled) setImages(imgs || []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  if (loading) return <LoadingSpinner label="Loading lesson…" />;
  if (error) {
    return (
      <div className="space-y-3">
        <Link to="/public/topics" className="text-sm text-gray-500 hover:text-gray-700">
          ← All topics
        </Link>
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      </div>
    );
  }
  if (!topic) return null;

  const homework = isHomeworkActive(lesson || {});
  const lessonSections = lessonSectionsOf(lesson);

  return (
    <article className="space-y-5">
      <Link to="/public/topics" className="text-sm text-gray-500 hover:text-gray-700">
        ← All topics
      </Link>

      <div>
        {topic.status === 'past' && topic.discussed_on && (
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">
            Discussed {topic.discussed_on}
          </p>
        )}
        {topic.status === 'active' && (
          <p className="text-[11px] uppercase tracking-wide text-green-700 font-medium">
            Active lesson
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
        {(topic.picked_by?.display_name || topic.submitted_by_name) && (
          <p className="text-xs text-gray-500 mt-1">
            {topic.picked_by?.display_name && `Picked by ${topic.picked_by.display_name}`}
            {topic.picked_by?.display_name && topic.submitted_by_name && ' · '}
            {topic.submitted_by_name && `Suggested by ${topic.submitted_by_name}`}
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
    </article>
  );
}

