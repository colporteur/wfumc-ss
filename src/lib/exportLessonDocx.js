// Per-person lesson handout export.
//
// Mirrors the sample lesson layout:
//   - Class name (top, underlined-bold)
//   - Question(s) (bold italic, indented or centered)
//   - Opening prompt (regular paragraph)
//   - "A few thoughts from Pastor Todd" header
//   - Bulleted pastor notes (one bullet per line in source)
//   - Closing prompt (regular paragraph)
//
// Filename: "{Question first words} - {date}.docx"

import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  LevelFormat,
  convertInchesToTwip,
  Packer,
} from 'docx';
import { CLASS_NAME } from './config';

function safeFilename(s) {
  return (s || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

// Convert "- bullet\n- bullet\n..." into an array of bullet strings.
// Tolerant of plain newlines (no leading dash), '*' bullets, and
// blank-line separators.
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
      // Continuation of the previous bullet (line-wrapped in source).
      buffer += ' ' + line;
    } else {
      // Bullet-less line — treat as its own bullet.
      buffer = line;
    }
  }
  flush();
  return out;
}

export async function buildLessonDocx({
  topicText,
  openingPrompt,
  pastorNotes,
  closingPrompt,
}) {
  const bullets = parseBullets(pastorNotes);
  const paragraphs = [];

  // Class banner
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: CLASS_NAME,
          bold: true,
          underline: {},
          size: 26, // 13pt
        }),
      ],
    })
  );

  // Question — bold italic, centered
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: topicText || '(no question)',
          bold: true,
          italics: true,
          size: 24, // 12pt
        }),
      ],
    })
  );

  // Opening prompt
  if (openingPrompt && openingPrompt.trim()) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: openingPrompt.trim(),
            size: 22, // 11pt
          }),
        ],
      })
    );
  }

  // Pastor-notes header
  if (bullets.length > 0) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 120, after: 120 },
        children: [
          new TextRun({
            text: 'A few thoughts from Pastor Todd',
            italics: true,
            size: 22,
          }),
        ],
      })
    );
    for (const b of bullets) {
      paragraphs.push(
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          spacing: { after: 80 },
          children: [new TextRun({ text: b, size: 22 })],
        })
      );
    }
  }

  // Closing prompt
  if (closingPrompt && closingPrompt.trim()) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 200 },
        children: [
          new TextRun({
            text: closingPrompt.trim(),
            italics: true,
            size: 22,
          }),
        ],
      })
    );
  }

  const doc = new Document({
    creator: CLASS_NAME,
    title: topicText || 'Sunday School Lesson',
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 }, // US Letter
            margin: {
              top: convertInchesToTwip(0.9),
              bottom: convertInchesToTwip(0.9),
              left: convertInchesToTwip(1.0),
              right: convertInchesToTwip(1.0),
            },
          },
        },
        children: paragraphs,
      },
    ],
  });
  return Packer.toBlob(doc);
}

export async function exportLessonDocx(opts) {
  const blob = await buildLessonDocx(opts);
  const titlePart = safeFilename(
    (opts.topicText || 'lesson').split(/[.?!]/)[0].slice(0, 60)
  );
  const datePart = opts.dateForFilename
    ? safeFilename(opts.dateForFilename)
    : '';
  const parts = [titlePart, datePart].filter(Boolean);
  const fname = (parts.join(' - ') || 'Sunday School Lesson') + '.docx';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fname;
}
