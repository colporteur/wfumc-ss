// Claude helpers for the Sunday School app.
//
// Three exports:
//   draftLesson({ question, seedIdeas, images? })
//     → returns { opening_prompt, pastor_notes, closing_prompt }.
//     Optionally accepts images (already downsized + base64-encoded) for
//     vision input — pastor can attach whiteboard sketches, article
//     screenshots, photos that shape the lesson direction.
//
//   brainstormLesson({ question, seedIdeas })
//     → returns Array<string> — 4-6 short bullet ideas (one sentence
//     each) the pastor can pick from instead of getting one polished draft.
//
//   lookupScriptureNRSVUe(reference)
//     → ported from Sermons App. Returns plain prose verse text with
//     the reference appended after a blank line.

import { callClaude } from './supabase';

function extractText(response) {
  return response?.content?.find((c) => c.type === 'text')?.text ?? '';
}

function parseJsonLoose(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseJsonArrayLoose(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

// =====================================================================
// draftLesson — full lesson body (opening + notes + closing)
//
// "Pastor Todd" lessons follow a consistent voice and shape from the
// sample doc: a brief opening prompt, ~6-12 substantive bullet
// reflections in his thoughtful-but-conversational pastoral voice, then
// a closing discussion prompt. The Claude prompt is shaped to match
// that house style.
// =====================================================================
export async function draftLesson({
  question,
  seedIdeas = '',
  images = [],
} = {}) {
  if (!question || !question.trim()) {
    throw new Error('Cannot draft a lesson without a question.');
  }

  const system = [
    'You draft Sunday School class material for Pastor Todd Noren-Hentz',
    "(United Methodist) at Wedowee FUMC. The class is small and",
    'thoughtful: adult learners who like wrestling with real questions.',
    'Each week one class member proposes a question; the pastor prepares',
    "reflections to spark discussion. You're writing those reflections.",
    '',
    'OUTPUT STRUCTURE — exactly these three parts:',
    '  1. opening_prompt   (1-3 sentences inviting the class into the',
    '     question; conversational, not preachy)',
    '  2. pastor_notes     (6-12 substantive bullets, one thought per',
    '     bullet, in a pastoral-but-curious voice — willing to question,',
    "     name tension, draw from scripture/tradition/news/personal",
    "     experience. Bullets are NOT preachy summaries; they're things",
    '     the pastor would actually share to advance group discussion.)',
    '  3. closing_prompt   (1 short question inviting class response,',
    "     typically 'What are your thoughts?' or similar)",
    '',
    'VOICE GUIDELINES:',
    '  - Thoughtful, ecumenical, intellectually honest. Lean Wesleyan',
    '    but accessible to anyone.',
    '  - Comfortable with mystery and tension. Comfortable saying',
    "    'I'm not sure' or 'this is hard' when it is.",
    '  - Brings scripture, history, science, and contemporary life into',
    '    conversation without being academic.',
    '  - Avoids: religious-jargon walls, false certainty, sentimentality,',
    '    political tribalism, mocking other Christian traditions.',
    '',
    'OUTPUT FORMAT — return ONLY a JSON object, no prose around it:',
    '  { "opening_prompt": "...", "pastor_notes": "- bullet 1\\n- bullet 2\\n...", "closing_prompt": "..." }',
    '  pastor_notes is plain text with one bullet per line, each line',
    "  starting with '- '. No code fences. No markdown headers.",
  ].join('\n');

  const userParts = [];
  userParts.push(`This week's question: ${question.trim()}`);
  if (seedIdeas && seedIdeas.trim()) {
    userParts.push(
      `Pastor's seed ideas (incorporate these — they reflect angles the pastor wants to make sure are addressed):\n${seedIdeas.trim()}`
    );
  }
  if (images && images.length > 0) {
    userParts.push(
      `${images.length} image(s) attached — these may be article screenshots, photos, sketches, or other visual context. Read what's in them and let it shape the lesson where relevant.`
    );
  }
  userParts.push('Draft the lesson now.');

  // Build the user message with optional image blocks. Images come in
  // ahead of text per Anthropic vision best practices.
  const contentBlocks = [];
  for (const img of images || []) {
    contentBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType || 'image/jpeg',
        data: img.data,
      },
    });
  }
  contentBlocks.push({ type: 'text', text: userParts.join('\n\n') });

  const response = await callClaude(
    {
      system,
      messages: [{ role: 'user', content: contentBlocks }],
      max_tokens: 3000,
    },
    { timeoutMs: 120000 }
  );

  const text = extractText(response);
  const parsed = parseJsonLoose(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error("Couldn't parse Claude's draft response as JSON.");
  }
  return {
    opening_prompt:
      typeof parsed.opening_prompt === 'string'
        ? parsed.opening_prompt.trim()
        : '',
    pastor_notes:
      typeof parsed.pastor_notes === 'string'
        ? parsed.pastor_notes.trim()
        : '',
    closing_prompt:
      typeof parsed.closing_prompt === 'string'
        ? parsed.closing_prompt.trim()
        : 'What are your thoughts?',
  };
}

// =====================================================================
// brainstormLesson — 4-6 short angle ideas instead of a full draft
// =====================================================================
export async function brainstormLesson({ question, seedIdeas = '' } = {}) {
  if (!question || !question.trim()) {
    throw new Error('Cannot brainstorm without a question.');
  }

  const system = [
    'You generate 4-6 short ANGLE IDEAS for a Sunday School lesson at a',
    'small thoughtful adult class. Each idea is a single sketch the pastor',
    'can later develop, NOT a full lesson.',
    '',
    'Guidelines:',
    '  - Each idea is 1-3 short sentences.',
    '  - Each idea takes a DIFFERENT angle (scripture angle, historical,',
    '    contemporary-life, philosophical, contrarian, etc.) so the pastor',
    '    has real choice.',
    '  - Voice: thoughtful, pastoral, intellectually honest. Wesleyan but',
    '    ecumenical. Comfortable with tension and questions.',
    '',
    'Output a JSON array of strings — one short idea per element.',
    '  ["Idea 1...", "Idea 2...", ...]',
    'No prose around the array. No code fence.',
  ].join('\n');

  const userParts = [`This week's question: ${question.trim()}`];
  if (seedIdeas && seedIdeas.trim()) {
    userParts.push(
      `Pastor's seed ideas to inform the brainstorm:\n${seedIdeas.trim()}`
    );
  }
  userParts.push('Produce 4-6 angle ideas now.');

  const response = await callClaude(
    {
      system,
      messages: [{ role: 'user', content: userParts.join('\n\n') }],
      max_tokens: 1500,
    },
    { timeoutMs: 90000 }
  );

  const text = extractText(response);
  const parsed = parseJsonArrayLoose(text);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Claude returned no usable brainstorm ideas.');
  }
  return parsed
    .filter((s) => typeof s === 'string' && s.trim())
    .map((s) => s.trim());
}

// =====================================================================
// matchLessonToTopic — given a lesson body excerpt + a list of past
// topics, ask Claude which topic this lesson most likely belongs to.
// Used by the bulk-import flow to backfill historical lesson handouts.
//
// Returns { topicId: string|null, confidence: 'high'|'medium'|'low'|'none', reasoning: string }
// =====================================================================
export async function matchLessonToTopic({ lessonText, candidates }) {
  const text = (lessonText || '').trim();
  if (!text) {
    return {
      topicId: null,
      confidence: 'none',
      reasoning: 'Lesson body is empty.',
    };
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      topicId: null,
      confidence: 'none',
      reasoning: 'No candidate topics provided.',
    };
  }

  // Cap input — Claude doesn't need the whole 5-page lesson to pick a
  // topic. First ~3000 chars is plenty.
  const snippet = text.length > 3000 ? text.slice(0, 3000) + '\n…' : text;

  // Build a compact candidate list. Cap at 200 to avoid token blowups
  // on huge archives (the pastor has ~150 past topics so this is fine).
  const list = candidates.slice(0, 200).map((c, idx) => ({
    n: idx,
    id: c.id,
    text: c.text,
  }));

  const system = [
    'You match a historical Sunday School lesson handout to one of the',
    "class's past discussion topics. The lesson body is given below;",
    'the candidate topics are numbered 0..N. Pick the single best match.',
    '',
    'Output a JSON object:',
    '  { "n": 5, "confidence": "high", "reasoning": "the lesson opens by quoting the question verbatim" }',
    '',
    "Use 'high' confidence when the question text appears in the lesson",
    "(verbatim or near-verbatim). 'medium' when the lesson is clearly",
    'about the topic theme even if the question isn\'t quoted exactly.',
    "'low' when there's a plausible thematic match but no strong",
    "evidence. 'none' when no candidate is a good match — in that case",
    'return n: null.',
    '',
    'No prose around the JSON. No code fence.',
  ].join('\n');

  const userParts = [
    'CANDIDATE TOPICS:',
    list.map((c) => `${c.n}. ${c.text}`).join('\n'),
    '',
    'LESSON BODY (excerpt):',
    snippet,
  ].join('\n');

  const response = await callClaude(
    {
      system,
      messages: [{ role: 'user', content: userParts }],
      max_tokens: 400,
    },
    { timeoutMs: 60000 }
  );
  const out = extractText(response);
  const parsed = parseJsonLoose(out);
  if (!parsed) {
    return {
      topicId: null,
      confidence: 'none',
      reasoning: 'Could not parse Claude response.',
    };
  }
  const n = Number.isInteger(parsed.n) ? parsed.n : null;
  const matched = n !== null && n >= 0 && n < list.length ? list[n] : null;
  return {
    topicId: matched?.id ?? null,
    confidence: ['high', 'medium', 'low', 'none'].includes(parsed.confidence)
      ? parsed.confidence
      : 'none',
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  };
}

// =====================================================================
// lookupScriptureNRSVUe — ported from Sermons App. Returns prose +
// blank line + reference on its own line.
// =====================================================================
export async function lookupScriptureNRSVUe(reference) {
  const ref = (reference || '').trim();
  if (!ref) throw new Error('No scripture reference provided.');
  const result = await callClaude(
    {
      system:
        'You are providing a scripture passage for a Sunday School lesson handout. When asked for a scripture passage, return ONLY the verse text — no verse numbers, no brackets, no introduction, no commentary, no copyright notice. Run the verses together as continuous prose. After all the verses, output a blank line, then the full scripture reference on its own line (e.g. "Acts 17:23"). Use plain text only — no markdown.',
      messages: [
        {
          role: 'user',
          content: `Please provide ${ref} in the NRSVUe translation.`,
        },
      ],
      max_tokens: 2000,
    },
    { timeoutMs: 60000 }
  );
  const text = result?.content?.[0]?.text?.trim();
  if (!text) throw new Error('Claude returned no text.');
  return text;
}
