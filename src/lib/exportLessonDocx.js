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
  ImageRun,
  AlignmentType,
  HeadingLevel,
  LevelFormat,
  PageBreak,
  convertInchesToTwip,
  Packer,
} from 'docx';
import { CLASS_NAME } from './config';
import { publicUrlFor } from './lessonImages';

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

// Fetch image bytes from public URL → Uint8Array for docx ImageRun.
// Returns { bytes, width, height } sized to fit a typical print page
// (max 6" wide preserving aspect ratio).
async function fetchImageForDocx(image) {
  const url = publicUrlFor(image.storage_path);
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(
      `Image fetch failed for "${image.original_name || image.id}" (HTTP ${resp.status}).`
    );
  }
  const blob = await resp.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Probe dimensions via createImageBitmap so we can preserve aspect ratio.
  let displayWidth = 432; // 6" at 72dpi
  let displayHeight = 324; // fallback 4:3
  try {
    const bitmap = await createImageBitmap(blob);
    const maxW = 432;
    const w = bitmap.width;
    const h = bitmap.height;
    if (w > 0 && h > 0) {
      if (w > maxW) {
        displayWidth = maxW;
        displayHeight = Math.round((h * maxW) / w);
      } else {
        displayWidth = w;
        displayHeight = h;
      }
    }
    bitmap.close?.();
  } catch {
    // Some browsers / blob types may not support createImageBitmap;
    // we fall back to the default 4:3 estimate. The image still renders
    // — it just may not have perfect aspect ratio.
  }
  return { bytes, width: displayWidth, height: displayHeight };
}

export async function buildLessonDocx({
  topicText,
  sections = [],
  images = [],
}) {
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
          font: 'Albertus Medium',
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
          font: 'Albertus Medium',
        }),
      ],
    })
  );

  // Sections: each one renders as a bold italic header (skipped if blank)
  // followed by body content. Bodies that look like bulleted lists
  // ("- item\n- item") get rendered as a real Word bulleted list;
  // anything else renders as prose paragraphs preserving line breaks.
  for (const section of sections) {
    const header = (section?.header || '').trim();
    const body = section?.body || '';
    if (!header && !body.trim()) continue;

    if (header) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 200, after: 120 },
          children: [
            new TextRun({
              text: header,
              bold: true,
              size: 22, // 11pt
              font: 'Albertus Medium',
            }),
          ],
        })
      );
    }

    if (!body.trim()) continue;

    const bullets = parseBullets(body);
    // Heuristic: if the body originally had dash-bullets on most non-empty
    // lines, render as bullets. Otherwise render as prose paragraphs so
    // we don't auto-bullet free prose.
    const bulletLineCount = body
      .split(/\r?\n/)
      .filter((l) => /^[\s]*[-*•]\s+/.test(l)).length;
    const totalLines = body
      .split(/\r?\n/)
      .filter((l) => l.trim()).length;
    const looksLikeBulletList =
      bullets.length > 0 && bulletLineCount >= Math.max(1, totalLines * 0.5);

    if (looksLikeBulletList) {
      for (const b of bullets) {
        paragraphs.push(
          new Paragraph({
            numbering: { reference: 'bullets', level: 0 },
            spacing: { after: 80 },
            children: [new TextRun({ text: b, size: 22, font: 'Albertus Medium' })],
          })
        );
      }
    } else {
      // Prose — one paragraph per blank-line-separated block, line breaks
      // preserved within a block.
      for (const block of body.split(/\n\s*\n/)) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        const lines = trimmed.split(/\r?\n/);
        const runs = [];
        lines.forEach((line, i) => {
          runs.push(new TextRun({ text: line, size: 22, font: 'Albertus Medium' }));
          if (i < lines.length - 1) runs.push(new TextRun({ break: 1 }));
        });
        paragraphs.push(
          new Paragraph({
            spacing: { after: 120 },
            children: runs,
          })
        );
      }
    }
  }

  // Image appendix — print-flagged images only. Each gets a page-break
  // before, then the image, then an optional caption below it.
  const printable = (images || []).filter((i) => i.include_in_print);
  if (printable.length > 0) {
    // Section divider before the appendix.
    paragraphs.push(
      new Paragraph({
        children: [new PageBreak()],
      })
    );
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: 'Images',
            italics: true,
            size: 24,
            font: 'Albertus Medium',
          }),
        ],
      })
    );
    for (let i = 0; i < printable.length; i++) {
      const img = printable[i];
      try {
        const { bytes, width, height } = await fetchImageForDocx(img);
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 80 },
            children: [
              new ImageRun({
                type: 'jpg',
                data: bytes,
                transformation: { width, height },
                altText: {
                  title: img.caption || img.original_name || 'Image',
                  description: img.caption || img.original_name || 'Lesson image',
                  name: img.original_name || `image-${i + 1}`,
                },
              }),
            ],
          })
        );
        if (img.caption && img.caption.trim()) {
          paragraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: img.caption.trim(),
                  italics: true,
                  size: 20,
                  color: '555555',
                  font: 'Albertus Medium',
                }),
              ],
            })
          );
        }
      } catch (e) {
        // Don't fail the whole export if one image can't be fetched —
        // surface as a placeholder so the pastor can see which broke.
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `[Image unavailable: ${img.original_name || img.id} — ${e.message || 'unknown error'}]`,
                italics: true,
                color: 'aa3333',
                size: 20,
                font: 'Albertus Medium',
              }),
            ],
          })
        );
      }
    }
  }

  const doc = new Document({
    creator: CLASS_NAME,
    title: topicText || 'Sunday School Lesson',
    // Document-wide default font. Albertus Medium matches the
    // PowerPoint slide convention used by the WFUMC suite — Word
    // viewers without the font installed will fall back to a system
    // serif, which is acceptable. All TextRuns inherit this unless
    // they override `font` explicitly.
    styles: {
      default: {
        document: {
          run: {
            font: 'Albertus Medium',
          },
        },
      },
    },
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
