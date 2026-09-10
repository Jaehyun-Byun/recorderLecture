import { SYSTEM_PROMPT, parseRefineResult } from './prompt';
import {
  ProviderError,
  type ProviderRefineArgs,
  type ProviderRefineFn,
  type RefineResult,
} from './types';

/**
 * One adapter for every OpenAI-compatible `/chat/completions` API
 * (OpenAI, Groq, OpenRouter, Mistral, …). They all accept the same request
 * shape and are CORS-enabled for direct browser calls.
 */
interface OpenAiCompatConfig {
  baseUrl: string; // e.g. https://api.openai.com/v1
  label: string;
  /** Extra headers (OpenRouter uses HTTP-Referer / X-Title for attribution). */
  extraHeaders?: () => Record<string, string>;
}

interface ChatChoice {
  message?: { content?: string };
  finish_reason?: string;
}
interface ChatResponse {
  choices?: ChatChoice[];
}
interface ChatErrorBody {
  error?: { message?: string } | string;
}

function errorMessageOf(body: ChatErrorBody | null): string | undefined {
  if (!body) return undefined;
  if (typeof body.error === 'string') return body.error;
  return body.error?.message;
}

export function makeOpenAiCompatRefine(config: OpenAiCompatConfig): ProviderRefineFn {
  return async function refine({
    apiKey,
    model,
    text,
    signal,
  }: ProviderRefineArgs): Promise<RefineResult> {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        ...(config.extraHeaders?.() ?? {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ChatErrorBody | null;
      const apiMessage = errorMessageOf(body);
      if (res.status === 401 || res.status === 403) {
        throw new ProviderError(
          'auth',
          `${config.label} API 키가 유효하지 않습니다.`,
        );
      }
      if (
        res.status === 402 ||
        (res.status === 400 && /credit|quota|billing|payment/i.test(apiMessage ?? ''))
      ) {
        throw new ProviderError('auth', `${config.label} 크레딧이 부족합니다.`);
      }
      if (res.status === 429) {
        throw new ProviderError(
          'rate-limit',
          `${config.label} 사용량 한도를 초과했습니다. 잠시 후 다시 시도하세요.`,
        );
      }
      throw new ProviderError(
        'unknown',
        `${config.label} 오류 (${res.status})${apiMessage ? `: ${apiMessage}` : ''}.`,
      );
    }

    const data = (await res.json().catch(() => null)) as ChatResponse | null;
    const choice = data?.choices?.[0];
    if (choice?.finish_reason === 'length') {
      throw new ProviderError('truncated', 'AI 응답이 최대 길이에 도달해 잘렸습니다.');
    }
    return parseRefineResult(choice?.message?.content ?? '');
  };
}

export const openaiRefine = makeOpenAiCompatRefine({
  baseUrl: 'https://api.openai.com/v1',
  label: 'OpenAI',
});

export const groqRefine = makeOpenAiCompatRefine({
  baseUrl: 'https://api.groq.com/openai/v1',
  label: 'Groq',
});

export const openrouterRefine = makeOpenAiCompatRefine({
  baseUrl: 'https://openrouter.ai/api/v1',
  label: 'OpenRouter',
  extraHeaders: () => ({
    'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://lecturecaption.app',
    'X-Title': 'LectureCaption',
  }),
});

export const mistralRefine = makeOpenAiCompatRefine({
  baseUrl: 'https://api.mistral.ai/v1',
  label: 'Mistral',
});
