import { PROVIDER_META } from './providers/meta';
import type { ProviderId } from './providers/types';

/**
 * - `transcribe` — 음성 → 텍스트만. API 키 불필요.
 * - `translate`  — 전사 + 한국어 번역(브라우저 내장 번역). API 키 불필요.
 * - `refine`     — 전사 + AI 교정 + AI 번역. LLM API 키 필요.
 */
export type AppMode = 'transcribe' | 'translate' | 'refine';

export const APP_MODES: AppMode[] = ['transcribe', 'translate', 'refine'];

export interface Settings {
  mode: AppMode;
  provider: ProviderId;
  /** One key per provider, so switching providers remembers each. */
  apiKeys: Partial<Record<ProviderId, string>>;
  /** Optional model override per provider (empty = provider default). */
  models: Partial<Record<ProviderId, string>>;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'translate',
  provider: 'gemini',
  apiKeys: {},
  models: {},
};

const STORAGE_KEY = 'lecturecaption.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      mode:
        parsed.mode && (APP_MODES as string[]).includes(parsed.mode)
          ? parsed.mode
          : DEFAULT_SETTINGS.mode,
      provider:
        parsed.provider && parsed.provider in PROVIDER_META
          ? parsed.provider
          : DEFAULT_SETTINGS.provider,
      apiKeys:
        parsed.apiKeys && typeof parsed.apiKeys === 'object' ? { ...parsed.apiKeys } : {},
      models:
        parsed.models && typeof parsed.models === 'object' ? { ...parsed.models } : {},
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable (private mode / quota) — nothing we can do.
  }
}

export interface ActiveConfig {
  providerId: ProviderId;
  apiKey: string;
  model: string;
  hasKey: boolean;
}

/** Resolves the settings for the currently-selected provider. */
export function resolveActive(settings: Settings): ActiveConfig {
  const def = PROVIDER_META[settings.provider];
  const apiKey = (settings.apiKeys[settings.provider] ?? '').trim();
  const model = (settings.models[settings.provider] ?? '').trim() || def.defaultModel;
  return { providerId: settings.provider, apiKey, model, hasKey: apiKey.length > 0 };
}
