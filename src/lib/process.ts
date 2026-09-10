import { RefineError, refineSentence } from './refine';
import type { Settings } from './settings';
import { TranslatorError, translateToKorean } from './translator';

export interface ProcessResult {
  corrected: string | null;
  translated: string | null;
}

export class ProcessError extends Error {
  /** Whether an immediate automatic retry is worth trying. */
  readonly retriable: boolean;
  constructor(message: string, retriable: boolean) {
    super(message);
    this.name = 'ProcessError';
    this.retriable = retriable;
  }
}

/**
 * Runs one finalized sentence through whatever the current mode requires:
 * - transcribe → nothing
 * - translate  → browser on-device translation
 * - refine     → the selected LLM (correction + translation in one call)
 */
export async function processSentence(
  text: string,
  settings: Settings,
): Promise<ProcessResult> {
  if (settings.mode === 'transcribe') {
    return { corrected: null, translated: null };
  }

  if (settings.mode === 'translate') {
    try {
      return { corrected: null, translated: await translateToKorean(text) };
    } catch (err) {
      if (err instanceof TranslatorError) {
        throw new ProcessError(err.message, err.kind === 'failed');
      }
      throw new ProcessError('번역에 실패했습니다.', true);
    }
  }

  // refine
  try {
    const result = await refineSentence(text, settings);
    return { corrected: result.corrected, translated: result.translated };
  } catch (err) {
    if (err instanceof RefineError) {
      const retriable =
        err.reason === 'network' || err.reason === 'timeout' || err.reason === 'unknown';
      throw new ProcessError(err.message, retriable);
    }
    throw new ProcessError('처리에 실패했습니다.', false);
  }
}
