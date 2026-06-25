// DOCX text extraction via mammoth. Used by the bulk-import flow to
// pull historical lesson handouts out of Word files.
//
// Returns { text, title? } where title is a best-guess first heading
// or first non-empty line.

import mammoth from 'mammoth';

export async function parseDocxLesson(file) {
  if (!file) throw new Error('No file provided.');
  const arrayBuffer = await file.arrayBuffer();
  // extractRawText is the lightweight path — gives us a flat text
  // dump with no styling. Plenty for our match-to-topic use case.
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = (result?.value || '').trim();
  if (!text) {
    throw new Error('Document appears to be empty or unreadable.');
  }
  return {
    text,
    title: guessTitle(text),
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}

// Heuristic: title is the first non-empty line that looks like a
// title (not too long, ends without punctuation, looks like a
// question or short phrase).
function guessTitle(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.length > 250) continue;
    // Skip the class banner if present.
    if (/excellent adventure/i.test(line)) continue;
    if (/sunday school class/i.test(line)) continue;
    return line;
  }
  return '';
}
