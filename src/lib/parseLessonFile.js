// Dispatcher: given an arbitrary File (DOCX or PDF), return a uniform
// { text, title, wordCount, kind } shape so the bulk importer can
// treat both types the same.

import { parseDocxLesson } from './parseDocxLesson';
import { extractPdfText } from './pdfText';

export async function parseLessonFile(file) {
  if (!file) throw new Error('No file provided.');
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.docx')) {
    const r = await parseDocxLesson(file);
    return { ...r, kind: 'docx' };
  }
  if (name.endsWith('.pdf')) {
    const r = await extractPdfText(file);
    return {
      text: r.text,
      title: guessTitleFromText(r.text),
      wordCount: r.text.split(/\s+/).filter(Boolean).length,
      pageCount: r.pageCount,
      kind: 'pdf',
    };
  }
  throw new Error(
    `Unsupported file type for "${file.name}". Only .docx and .pdf are supported.`
  );
}

function guessTitleFromText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.length > 250) continue;
    if (/excellent adventure/i.test(line)) continue;
    if (/sunday school class/i.test(line)) continue;
    return line;
  }
  return '';
}
