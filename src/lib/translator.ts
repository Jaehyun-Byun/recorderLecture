/**
 * Wraps the browser's built-in Translator API (on-device, free, no API key).
 * Used by "번역 모드". Chrome 138+ desktop only.
 */

const SOURCE = 'en';
const TARGET = 'ko';

export type TranslatorStatus =
  | 'checking'
  | 'unsupported' // no Translator API in this browser
  | TranslatorAvailability; // available | downloadable | downloading | unavailable

export class TranslatorError extends Error {
  /** `failed` is retriable (one bad sentence); the others are not. */
  readonly kind: 'unsupported' | 'unavailable' | 'failed';
  constructor(kind: TranslatorError['kind'], message: string) {
    super(message);
    this.name = 'TranslatorError';
    this.kind = kind;
  }
}

function api(): TranslatorStatic | undefined {
  return typeof Translator === 'undefined' ? undefined : Translator;
}

export async function getBrowserTranslatorStatus(): Promise<TranslatorStatus> {
  const t = api();
  if (!t) return 'unsupported';
  try {
    return await t.availability({ sourceLanguage: SOURCE, targetLanguage: TARGET });
  } catch {
    return 'unavailable';
  }
}

let translatorPromise: Promise<TranslatorInstance> | null = null;

/**
 * Creates the translator, downloading the model if needed. The FIRST call must
 * happen inside a user gesture (e.g. the Start click) or the browser blocks the
 * download. `onProgress` receives a 0..1 fraction while downloading.
 */
export function prepareBrowserTranslator(
  onProgress?: (fraction: number) => void,
): Promise<TranslatorInstance> {
  const t = api();
  if (!t) {
    return Promise.reject(
      new TranslatorError(
        'unsupported',
        '이 브라우저는 내장 번역을 지원하지 않습니다. Chrome 138 이상(데스크톱)을 쓰거나 AI 교정 모드를 선택하세요.',
      ),
    );
  }
  if (!translatorPromise) {
    translatorPromise = t
      .create({
        sourceLanguage: SOURCE,
        targetLanguage: TARGET,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            onProgress?.(e.loaded);
          });
        },
      })
      .catch((err: unknown) => {
        translatorPromise = null; // let the user retry
        throw new TranslatorError(
          'unavailable',
          `번역 모델을 준비하지 못했습니다${err instanceof Error ? ` (${err.message})` : ''}.`,
        );
      });
  }
  return translatorPromise;
}

export async function translateToKorean(text: string): Promise<string> {
  const translator = await prepareBrowserTranslator();
  try {
    const out = (await translator.translate(text)).trim();
    if (!out) throw new Error('empty');
    return out;
  } catch {
    throw new TranslatorError('failed', '문장 번역에 실패했습니다.');
  }
}
