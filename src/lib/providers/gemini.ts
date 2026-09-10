import { ApiError, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { ProviderError, type ProviderChatArgs } from './types';

function statusOf(err: unknown): number | undefined {
  if (err instanceof ApiError && typeof err.status === 'number') return err.status;
  if (err && typeof err === 'object') {
    const s = (err as { status?: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return undefined;
}

export async function geminiChat({
  apiKey,
  model,
  system,
  user,
  maxTokens,
  signal,
  jsonKeys,
}: ProviderChatArgs): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  const properties: Record<string, { type: Type }> = {};
  for (const key of jsonKeys) properties[key] = { type: Type.STRING };

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: user,
      config: {
        abortSignal: signal,
        systemInstruction: system,
        temperature: 0.2,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties,
          required: jsonKeys,
          propertyOrdering: jsonKeys,
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    const status = statusOf(err);
    if (status === 429) {
      throw new ProviderError(
        'rate-limit',
        'Gemini 무료 사용량(분당/일일 한도)을 초과했습니다. 잠시 후 다시 시도하세요.',
      );
    }
    if (status === 400 || status === 401 || status === 403) {
      throw new ProviderError(
        'auth',
        'Gemini API 키가 유효하지 않습니다. aistudio.google.com/apikey 에서 확인하세요.',
      );
    }
    if (status === 404) {
      throw new ProviderError(
        'unknown',
        `Gemini 모델 "${model}"을 찾을 수 없습니다. 고급 설정에서 모델명을 확인하세요.`,
      );
    }
    throw new ProviderError(
      'unknown',
      `Gemini 오류: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new ProviderError('truncated', 'AI 응답이 최대 길이에 도달해 잘렸습니다.');
  }
  return response.text ?? '';
}
