// Read-only rendering of a lesson's sections. Each section displays
// its header (italic prompt-style) and body. Bodies that look like
// bulleted lists render as <ul>; otherwise prose paragraphs are
// preserved with line breaks.
//
// Used by PublicActive and PublicLesson.

export default function LessonBodyView({ sections = [] }) {
  if (!sections.length) {
    return (
      <p className="text-sm text-gray-500 italic">
        No lesson notes saved for this topic.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {sections.map((s, idx) => {
        const header = (s?.header || '').trim();
        const body = s?.body || '';
        if (!header && !body.trim()) return null;

        const bullets = parseBullets(body);
        const bulletLineCount = body
          .split(/\r?\n/)
          .filter((l) => /^[\s]*[-*•]\s+/.test(l)).length;
        const totalLines = body
          .split(/\r?\n/)
          .filter((l) => l.trim()).length;
        const looksLikeBulletList =
          bullets.length > 0 &&
          bulletLineCount >= Math.max(1, totalLines * 0.5);

        return (
          <section key={idx}>
            {header && (
              <h3 className="text-xs italic text-gray-600 font-medium mb-2">
                {header}
              </h3>
            )}
            {looksLikeBulletList ? (
              <ul className="list-disc pl-5 space-y-2 text-sm text-gray-800 font-serif leading-relaxed">
                {bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            ) : (
              <div className="space-y-2 text-sm text-gray-800 font-serif leading-relaxed">
                {body
                  .split(/\n\s*\n/)
                  .filter((b) => b.trim())
                  .map((block, i) => (
                    <p key={i} className="whitespace-pre-wrap">
                      {block}
                    </p>
                  ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function parseBullets(notesText) {
  if (!notesText) return [];
  const lines = notesText.split(/\r?\n/);
  const out = [];
  let buffer = '';
  const flush = () => {
    if (buffer.trim()) out.push(buffer.trim());
    buffer = '';
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const dash = line.match(/^[-*•]\s+(.*)$/);
    if (dash) {
      flush();
      buffer = dash[1];
    } else if (buffer) {
      buffer += ' ' + line;
    } else {
      buffer = line;
    }
  }
  flush();
  return out;
}
