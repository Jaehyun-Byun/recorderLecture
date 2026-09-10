import { PROVIDERS, ProviderError, type RefineResult } from './providers';
import { PROVIDER_META } from './providers/meta';
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

const TIMEOUT_MS = 30_000;

const KIND_TO_REASON: Record<ProviderError['kind'], RefineErrorReason> = {
  auth: 'auth',
  'rate-limit': 'rate-limit',
  truncated: 'truncated',
  'bad-response': 'bad-response',
  unknown: 'unknown',
};

/** Sends one sentence to the selected provider for cleanup + Korean translation. */
export async function refineSentence(
  text: string,
  settings: Settings,
): Promise<RefineResult> {
  const { apiKey, model, providerId, hasKey } = resolveActive(settings);
  if (!hasKey) {
    const label = PROVIDER_META[providerId].label;
    throw new RefineError('no-key', `${label} API 키가 없습니다. 설정에서 입력하세요.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const refine = await PROVIDERS[providerId].loadRefine();
    return await refine({ apiKey, model, text, signal: controller.signal });
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

/** Backs the "연결 테스트" button in the settings panel. */
export async function testConnection(
  settings: Settings,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await refineSentence('This is a connection test.', settings);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof RefineError ? err.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}
