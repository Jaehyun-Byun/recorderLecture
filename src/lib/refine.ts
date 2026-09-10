import { PROVIDERS, ProviderError } from './providers';
import { PROVIDER_META } from './providers/meta';
import {
  PARAGRAPH_SYSTEM_PROMPT,
  buildParagraphUser,
  parseRefineParagraph,
  type RefineParagraphRaw,
} from './providers/prompt';
import { resolveActive, type Settings } from './settings';

/** Why a refine call failed — the queue uses this to decide whether to retry. */
export type RefineErrorReason =
  | 'no-key'
  | 'auth'
  | 'rate-limit'
  | 'timeout'
  | 'network'
  | 'truncated'
  | 'bad-response'
  | 'unknown';

export class RefineError extends Error {
  readonly reason: RefineErrorReason;
  constructor(reason: RefineErrorReason, message: string) {
    super(message);
    this.name = 'RefineError';
    this.reason = reason;
  }
}

const TIMEOUT_MS = 60_000; // big paragraphs — allow plenty of time
const JSON_KEYS = ['corrected', 'translated', 'glossary', 'notes'];

const KIND_TO_REASON: Record<ProviderError['kind'], RefineErrorReason> = {
  auth: 'auth',
  'rate-limit': 'rate-limit',
  truncated: 'truncated',
  'bad-response': 'bad-response',
  unknown: 'unknown',
};

export interface RefineParagraphInput {
  newParagraph: string;
  /** Serialized running glossary ("en = ko ; ..."), empty on the first call. */
  glossary: string;
  /** Rolling notes on topic/tone, empty on the first call. */
  notes: string;
  /** The last corrected paragraph(s) joined, empty on the first call. */
  recentCorrected: string;
  settings: Settings;
}

/** Output tokens track input size — Korean is heavy, so ~1.5x chars, clamped. */
function maxTokensFor(chars: number): number {
  return Math.min(6144, Math.max(1024, Math.ceil(chars * 1.6)));
}

export async function refineParagraph(
  input: RefineParagraphInput,
): Promise<RefineParagraphRaw> {
  const { apiKey, model, providerId, hasKey } = resolveActive(input.settings);
  if (!hasKey) {
    throw new RefineError(
      'no-key',
      `${PROVIDER_META[providerId].label} API 키가 없습니다. 설정에서 입력하세요.`,
    );
  }

  const user = buildParagraphUser(
    input.glossary,
    input.notes,
    input.recentCorrected,
    input.newParagraph,
  );
  const maxTokens = maxTokensFor(user.length);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const chat = await PROVIDERS[providerId].loadChat();
    const raw = await chat({
      apiKey,
      model,
      system: PARAGRAPH_SYSTEM_PROMPT,
      user,
      maxTokens,
      signal: controller.signal,
      jsonKeys: JSON_KEYS,
    });
    return parseRefineParagraph(raw);
  } catch (err) {
    if (err instanceof ProviderError) {
      throw new RefineError(KIND_TO_REASON[err.kind], err.message);
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new RefineError('timeout', '요청 시간이 초과되었습니다. 다시 시도하세요.');
    }
    throw new RefineError(
      'network',
      '네트워크 오류로 요청에 실패했습니다. 인터넷 연결을 확인하세요.',
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Backs the "연결 테스트" button. */
export async function testConnection(
  settings: Settings,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await refineParagraph({
      newParagraph: 'so um this is a quick connection test you know',
      glossary: '',
      notes: '',
      recentCorrected: '',
      settings,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof RefineError ? err.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}
