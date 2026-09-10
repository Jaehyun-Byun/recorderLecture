import { SYSTEM_PROMPT, parseRefineResult } from './prompt';
import {
  ProviderError,
  type ProviderRefineArgs,
  type RefineResult,
} from './types';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

interface AnthropicContentBlock {
  type: string;
  input?: unknown;
}
interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
}
interface AnthropicErrorBody {
  error?: { message?: string };
}

async function mapHttpError(res: Response): Promise<ProviderError> {
  const body = (await res.json().catch(() => null)) as AnthropicErrorBody | null;
  const apiMessage = body?.error?.message;

  if (res.status === 401 || res.status === 403) {
    return new ProviderError(
      'auth',
      'Claude API 키가 유효하지 않습니다. console.anthropic.com 에서 확인하세요.',
    );
  }
  if (
    res.status === 400 &&
    typeof apiMessage === 'string' &&
    /credit balance|billing/i.test(apiMessage)
  ) {
    return new ProviderError(
      'auth',
      'Claude 크레딧이 부족합니다. console.anthropic.com 의 Billing에서 충전하세요.',
    );
  }
  if (res.status === 429) {
    return new ProviderError(
      'rate-limit',
      'Claude API 사용량 한도를 초과했습니다. 잠시 후 다시 시도하세요.',
    );
  }
  return new ProviderError(
    'unknown',
    `Claude API 오류 (${res.status})${apiMessage ? `: ${apiMessage}` : ''}.`,
  );
}

export async function anthropicRefine({
  apiKey,
  model,
  text,
  signal,
}: ProviderRefineArgs): Promise<RefineResult> {
  const res = await fetch(MESSAGES_URL, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: 'provide_refinement',
          description:
            'Return the cleaned-up English sentence and its Korean (한국어) translation.',
          input_schema: {
            type: 'object',
            properties: {
              corrected: { type: 'string', description: 'The cleaned-up English sentence.' },
              translated: {
                type: 'string',
                description: 'Natural Korean (한국어) translation of the corrected sentence.',
              },
            },
            required: ['corrected', 'translated'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'provide_refinement' },
      messages: [{ role: 'user', content: text }],
    }),
  });

  if (!res.ok) {
    throw await mapHttpError(res);
  }

  const data = (await res.json().catch(() => null)) as AnthropicResponse | null;
  if (data?.stop_reason === 'max_tokens') {
    throw new ProviderError('truncated', 'AI 응답이 최대 길이에 도달해 잘렸습니다.');
  }

  const toolUse = data?.content?.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new ProviderError('bad-response', 'Claude가 예상한 형식으로 응답하지 않았습니다.');
  }
  return parseRefineResult(toolUse.input);
}
