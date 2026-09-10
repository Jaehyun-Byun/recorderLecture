import { PROVIDER_META, PROVIDER_META_LIST } from './meta';
import type { ProviderEntry, ProviderId } from './types';

/**
 * Registry: static metadata + a lazy loader for each adapter. Provider SDKs
 * (notably @google/genai) only enter the bundle when a call actually runs.
 * OpenAI / Groq / OpenRouter / Mistral share one OpenAI-compatible adapter.
 */
export const PROVIDERS: Record<ProviderId, ProviderEntry> = {
  gemini: {
    ...PROVIDER_META.gemini,
    loadChat: () => import('./gemini').then((m) => m.geminiChat),
  },
  anthropic: {
    ...PROVIDER_META.anthropic,
    loadChat: () => import('./anthropic').then((m) => m.anthropicChat),
  },
  openai: {
    ...PROVIDER_META.openai,
    loadChat: () => import('./openai-compat').then((m) => m.openaiChat),
  },
  groq: {
    ...PROVIDER_META.groq,
    loadChat: () => import('./openai-compat').then((m) => m.groqChat),
  },
  openrouter: {
    ...PROVIDER_META.openrouter,
    loadChat: () => import('./openai-compat').then((m) => m.openrouterChat),
  },
  mistral: {
    ...PROVIDER_META.mistral,
    loadChat: () => import('./openai-compat').then((m) => m.mistralChat),
  },
};

export const PROVIDER_LIST: ProviderEntry[] = PROVIDER_META_LIST.map(
  (meta) => PROVIDERS[meta.id],
);

export { PROVIDER_META } from './meta';
export * from './types';
