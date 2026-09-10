import { PROVIDER_META, PROVIDER_META_LIST } from './meta';
import type { ProviderEntry, ProviderId } from './types';

/**
 * Registry: static metadata + a lazy loader for each adapter. The provider SDKs
 * (notably @google/genai) only enter the bundle when a refine actually runs.
 * OpenAI / Groq / OpenRouter / Mistral all share one OpenAI-compatible adapter.
 */
export const PROVIDERS: Record<ProviderId, ProviderEntry> = {
  gemini: {
    ...PROVIDER_META.gemini,
    loadRefine: () => import('./gemini').then((m) => m.geminiRefine),
  },
  anthropic: {
    ...PROVIDER_META.anthropic,
    loadRefine: () => import('./anthropic').then((m) => m.anthropicRefine),
  },
  openai: {
    ...PROVIDER_META.openai,
    loadRefine: () => import('./openai-compat').then((m) => m.openaiRefine),
  },
  groq: {
    ...PROVIDER_META.groq,
    loadRefine: () => import('./openai-compat').then((m) => m.groqRefine),
  },
  openrouter: {
    ...PROVIDER_META.openrouter,
    loadRefine: () => import('./openai-compat').then((m) => m.openrouterRefine),
  },
  mistral: {
    ...PROVIDER_META.mistral,
    loadRefine: () => import('./openai-compat').then((m) => m.mistralRefine),
  },
};

export const PROVIDER_LIST: ProviderEntry[] = PROVIDER_META_LIST.map(
  (meta) => PROVIDERS[meta.id],
);

export { PROVIDER_META } from './meta';
export * from './types';
