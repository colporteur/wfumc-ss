// Back-page export — one class copy showing:
//   - Possible Future Topics
//   - Past Topics
//   - Active Roster
//
// Pastor prints ONE copy of this for the class, separate from the
// per-person lesson handout. Layout uses three columns or stacked
// sections — we stack for simplicity and readability.

import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  LevelFormat,
  HeadingLevel,
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

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 120 },
    children: [
      new TextRun({
        text,
        italics: true,
        size: 24, // 12pt
        font: 'Albertus Medium',
      }),
    ],
  });
}

function bulletParagraph(text) {
  return new Paragraph({
    numbering: { reference: 'backpage-bullets', level: 0 },
    spacing: { after: 40 },
    // 10pt — pack density
    children: [new TextRun({ text, size: 20, font: 'Albertus Medium' })],
  });
}

export async function buildBackPageDocx({
  futureTopics = [],
  pastTopics = [],
  rosterMembers = [],
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
          size: 26,
          font: 'Albertus Medium',
        }),
      ],
    })
  );

  // Possible Future Topics
  paragraphs.push(sectionHeading('Possible Future Topics'));
  if (futureTopics.length === 0) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: '(none)', italics: true, color: '888888', size: 20, font: 'Albertus Medium' }),
        ],
      })
    );
  } else {
    for (const t of futureTopics) {
      paragraphs.push(bulletParagraph(t.text || ''));
    }
  }

  // Past Topics
  paragraphs.push(sectionHeading('Past Topics'));
  if (pastTopics.length === 0) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: '(none)', italics: true, color: '888888', size: 20, font: 'Albertus Medium' }),
        ],
      })
    );
  } else {
    for (const t of pastTopics) {
      paragraphs.push(bulletParagraph(t.text || ''));
    }
  }

  // Active Roster
  paragraphs.push(sectionHeading('Active Roster'));
  if (rosterMembers.length === 0) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: '(none)', italics: true, color: '888888', size: 20, font: 'Albertus Medium' }),
        ],
      })
    );
  } else {
    // Roster as a compact comma-separated list to save space; bullets
    // would chew through pages for 46 members.
    const names = rosterMembers.map((m) => m.display_name).join(', ');
    paragraphs.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: names, size: 20, font: 'Albertus Medium' })],
      })
    );
  }

  const doc = new Document({
    creator: CLASS_NAME,
    title: 'Class Back Page',
    // Document-wide default font — matches the lesson handout export
    // and the rest of the WFUMC suite. Word viewers without the font
    // installed will fall back to a system serif.
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
          reference: 'backpage-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 540, hanging: 360 } },
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
            size: { width: 12240, height: 15840 },
            margin: {
              top: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.9),
              right: convertInchesToTwip(0.9),
            },
          },
        },
        children: paragraphs,
      },
    ],
  });
  return Packer.toBlob(doc);
}

export async function exportBackPageDocx(opts) {
  const blob = await buildBackPageDocx(opts);
  const datePart = opts.dateForFilename
    ? safeFilename(opts.dateForFilename)
    : new Date().toISOString().slice(0, 10);
  const fname = `Class Back Page - ${datePart}.docx`;

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
