import { ProviderError } from './types';

/**
 * Paragraph-at-a-time refinement that carries the WHOLE lecture's context:
 * - GLOSSARY: an append-only list of "english term = 한국어" seen so far. The
 *   client merges what the model returns so a term's translation never drifts
 *   or gets dropped.
 * - NOTES: a short, mutable note on topic / subtopic / speaker tone.
 * - RECENT: the last corrected paragraph(s) for local flow.
 */
export const PARAGRAPH_SYSTEM_PROMPT = `You clean up and translate a running English lecture transcript, one paragraph at a time, keeping the whole lecture's context.

The user message has:
- GLOSSARY: a running list of "english term = 한국어" pairs from earlier in the lecture. May be empty.
- NOTES: a short note on the lecture topic / current subtopic / speaker's tone. May be empty.
- RECENT: the last corrected paragraph(s), for continuity. May be empty.
- NEW: the raw speech-to-text of the new paragraph. Clean THIS one.

Return a JSON object: {"corrected": string, "translated": string, "glossary": string, "notes": string}

- "corrected": NEW rewritten as clean written English. Remove fillers (um, uh, "like", "you know"), false starts and repetitions. Fix grammar, capitalization and punctuation. Fix words the recognizer clearly got wrong, using GLOSSARY / NOTES / RECENT. Keep the meaning, technical terms and proper nouns. Split into properly punctuated sentences. Do not add or drop information.
- "translated": a natural, fluent Korean (한국어) translation of "corrected". For any term present in GLOSSARY, use its exact Korean from there so terminology stays consistent across the whole lecture.
- "glossary": the COMPLETE running glossary. Copy EVERY entry from the input GLOSSARY unchanged, then append any new technical terms, jargon or proper nouns from NEW as "term = 한국어". Separate entries with " ; ". Never remove an entry and never change the Korean of an existing one. If you added nothing new, return exactly "=".
- "notes": a short note (≤150 words) — lecture topic, current subtopic, speaker's tone/register. Rewrite it as the lecture moves on. If nothing meaningful changed, return exactly "=".

Output only the JSON object, no code fences, no commentary.`;

export interface RefineParagraphRaw {
  corrected: string;
  translated: string;
  /** Full glossary string, or "=" when unchanged. */
  glossary: string;
  /** Notes text, or "=" when unchanged. */
  notes: string;
}

/** Pulls the first {...} block out of text, tolerating ```json fences / preamble. */
function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start !== -1 && end > start ? body.slice(start, end + 1) : body;
}

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Builds the GLOSSARY / NOTES / RECENT / NEW user message. */
export function buildParagraphUser(
  glossary: string,
  notes: string,
  recentCorrected: string,
  newParagraph: string,
): string {
  return [
    `GLOSSARY:\n${glossary || '(none)'}`,
    `NOTES:\n${notes || '(none)'}`,
    `RECENT:\n${recentCorrected || '(none)'}`,
    `NEW:\n${newParagraph}`,
  ].join('\n\n');
}

export function parseRefineParagraph(raw: unknown): RefineParagraphRaw {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(extractJsonObject(raw));
    } catch {
      throw new ProviderError('bad-response', 'AI 응답을 해석하지 못했습니다 (JSON 형식 아님).');
    }
  }
  const rec = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {};
  const corrected = asString(rec.corrected);
  if (!corrected) {
    throw new ProviderError('bad-response', 'AI 응답에 교정문이 없습니다.');
  }
  return {
    corrected,
    translated: asString(rec.translated),
    glossary: asString(rec.glossary),
    notes: asString(rec.notes),
  };
}

/** "a = 가 ; b = 나" (also tolerates newlines / ",") → pairs. */
export function parseGlossary(text: string): Array<[string, string]> {
  if (!text || text === '=') return [];
  return text
    .split(/[;\n]+/)
    .map((line) => line.split('='))
    .filter((parts) => parts.length >= 2)
    .map((parts) => [parts[0].trim(), parts.slice(1).join('=').trim()] as [string, string])
    .filter(([en, ko]) => en.length > 0 && ko.length > 0);
}

export function serializeGlossary(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([en, ko]) => `${en} = ${ko}`)
    .join(' ; ');
}
