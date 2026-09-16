import { ProviderError } from './types';

/**
 * Turns a rough, error-prone ~20-sentence lecture transcript chunk into Korean
 * study material. NOT a translation — the model works out what the lecturer
 * meant (fixing misrecognized words) and re-explains it as clear flowing Korean
 * prose, PLUS a separate 개조식 (itemized) list explaining hard terms/concepts.
 * Carries the whole lecture's context (append-only glossary + running outline +
 * previous chunk's notes).
 */
export const PARAGRAPH_SYSTEM_PROMPT = `You are a study assistant. You receive a rough, error-prone speech-to-text transcript of part of an English lecture and produce clear Korean study material.

The transcript has misrecognized words, missing punctuation and disfluencies. Do NOT transcribe or translate it literally. Instead:
1. Work out what the lecturer actually meant — fix misheard/wrong words using context, the GLOSSARY, and domain knowledge.
2. Re-explain the content as clear, flowing Korean prose — natural, well-organized paragraphs (문단글) that a student can read to understand this part of the lecture. Connect ideas with proper flow and cause-and-effect. This is NOT a bullet list.
3. Explain as you go — when the lecturer uses a term or idea without defining it, weave in a short plain-language clarification so the reader keeps up.
4. Stay grounded in what the lecture actually covered. You may add a brief clarifying phrase from general knowledge when it genuinely aids understanding, but do NOT invent content the lecturer did not discuss or drift into a generic textbook treatment.

Input parts:
- GLOSSARY: running "english term = 한국어" list from earlier. Use it for consistent terminology.
- OUTLINE: running high-level outline of the lecture so far, for context.
- RECENT: your notes for the previous chunk, for continuity.
- NEW: the raw transcript chunk to turn into study material.

Return a JSON object: {"notes": string, "concepts": string, "glossary": string, "outline": string}
- "notes": the clear flowing Korean explanation of NEW (prose paragraphs, per rules 2-4 above). Not bullets.
- "concepts": a 개조식 (itemized) Korean list explaining difficult terms, jargon, formulas, names or concepts that appear in NEW — one "- 용어/개념: 1~2문장 설명" per line. Empty string if nothing needs explaining.
- "glossary": the COMPLETE running glossary. Copy EVERY entry from the input GLOSSARY unchanged, then append new "term = 한국어" pairs from NEW, " ; " separated. Never remove an entry, never change an existing one. Return exactly "=" if you added nothing.
- "outline": a running high-level Korean outline of the WHOLE lecture so far (≤200 words, short itemized lines). Add NEW's main points to it. Return exactly "=" if nothing structurally new.

Output only the JSON object, no code fences, no commentary.`;

export interface RefineParagraphRaw {
  /** 문단글(prose) 한국어 학습 설명. */
  notes: string;
  /** 개조식 용어·개념 설명 (없으면 ""). */
  concepts: string;
  /** Full glossary string, or "=" when unchanged. */
  glossary: string;
  /** Full outline string, or "=" when unchanged. */
  outline: string;
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

/** Builds the GLOSSARY / OUTLINE / RECENT / NEW user message. */
export function buildParagraphUser(
  glossary: string,
  outline: string,
  recentNotes: string,
  newParagraph: string,
): string {
  return [
    `GLOSSARY:\n${glossary || '(none)'}`,
    `OUTLINE:\n${outline || '(none)'}`,
    `RECENT:\n${recentNotes || '(none)'}`,
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
  const notes = asString(rec.notes);
  if (!notes) {
    throw new ProviderError('bad-response', 'AI 응답에 노트가 없습니다.');
  }
  return {
    notes,
    concepts: asString(rec.concepts),
    glossary: asString(rec.glossary),
    outline: asString(rec.outline),
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
