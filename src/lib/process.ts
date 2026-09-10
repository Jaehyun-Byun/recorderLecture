import {
  RefineError,
  refineParagraph,
  type RefineParagraphInput,
} from './refine';
import type { RefineParagraphRaw } from './providers/prompt';
import type { Settings } from './settings';
import { TranslatorError, translateToKorean } from './translator';

export interface SentenceResult {
  translated: string | null;
}

export type ParagraphResult = RefineParagraphRaw;

export class ProcessError extends Error {
  /** Whether an immediate automatic retry is worth trying. */
  readonly retriable: boolean;
  constructor(message: string, retriable: boolean) {
    super(message);
    this.name = 'ProcessError';
    this.retriable = retriable;
  }
}

/** transcribe / translate: one sentence at a time. */
export async function processSentence(
  text: string,
  settings: Settings,
): Promise<SentenceResult> {
  if (settings.mode === 'transcribe') return { translated: null };
  // translate mode
  try {
    return { translated: await translateToKorean(text) };
  } catch (err) {
    if (err instanceof TranslatorError) {
      throw new ProcessError(err.message, err.kind === 'failed');
    }
    throw new ProcessError('번역에 실패했습니다.', true);
  }
}

function refineErrorRetriable(reason: RefineError['reason']): boolean {
  return reason === 'network' || reason === 'timeout' || reason === 'unknown';
}

/** refine mode: one paragraph at a time, carrying rolling glossary + notes. */
export async function processParagraph(
  input: RefineParagraphInput,
): Promise<ParagraphResult> {
  try {
    return await refineParagraph(input);
  } catch (err) {
    if (err instanceof RefineError) {
      throw new ProcessError(err.message, refineErrorRetriable(err.reason));
    }
    throw new ProcessError('문단 교정에 실패했습니다.', false);
  }
}
