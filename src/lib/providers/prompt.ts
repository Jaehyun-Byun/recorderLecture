import { ProviderError, type RefineResult } from './types';

/** Shared instruction for every provider. */
export const SYSTEM_PROMPT = `You clean up and translate ONE sentence at a time from a live English lecture transcript produced by imperfect speech-to-text.

Return a JSON object with exactly these two fields:

- "corrected": the sentence rewritten as clean, natural written English. Remove filler words (um, uh, "like", "you know"), false starts, and stutters/repetitions. Fix grammar, capitalization, and punctuation. If speech recognition clearly produced a wrong word, replace it with the most plausible intended word from context. Keep the original meaning and any technical terms or proper nouns. Do not add information or commentary. If the sentence is already clean, repeat it unchanged.

- "translated": a natural, fluent Korean translation of the "corrected" sentence. This field MUST be written in Korean (한국어). Never leave it in English, never leave it empty.

Example input: "so um the the mitochondria is basically the powerhouse of the cell you know"
Example output: {"corrected": "The mitochondria is basically the powerhouse of the cell.", "translated": "미토콘드리아는 기본적으로 세포의 발전소입니다."}

Output only the JSON object — no code fences, no commentary.`;

/** Pulls the first {...} block out of text, tolerating ```json fences / preamble. */
function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start !== -1 && end > start ? body.slice(start, end + 1) : body;
}

/** Parses a model's JSON output (string or already-parsed object) into RefineResult. */
export function parseRefineResult(raw: unknown): RefineResult {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(extractJsonObject(raw));
    } catch {
      throw new ProviderError('bad-response', 'AI 응답을 해석하지 못했습니다 (JSON 형식 아님).');
    }
  }
  const rec = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {};
  const corrected = typeof rec.corrected === 'string' ? rec.corrected.trim() : '';
  const translated = typeof rec.translated === 'string' ? rec.translated.trim() : '';
  if (!corrected) {
    throw new ProviderError('bad-response', 'AI 응답에 교정문이 없습니다.');
  }
  return { corrected, translated };
}
