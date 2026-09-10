import { useCallback, useMemo, useState } from 'react';
import type { ProviderId } from '../lib/providers';
import {
  loadSettings,
  resolveActive,
  saveSettings,
  type ActiveConfig,
  type AppMode,
  type Settings,
} from '../lib/settings';

export interface UseSettingsResult {
  settings: Settings;
  active: ActiveConfig;
  setMode: (mode: AppMode) => void;
  setProvider: (provider: ProviderId) => void;
  setApiKey: (provider: ProviderId, key: string) => void;
  setModel: (provider: ProviderId, model: string) => void;
}

/** Mode / provider / API-key settings, persisted to localStorage. */
export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  const mutate = useCallback((fn: (prev: Settings) => Settings) => {
    setSettings((prev) => {
      const next = fn(prev);
      saveSettings(next);
      return next;
    });
  }, []);

  const setMode = useCallback(
    (mode: AppMode) => mutate((prev) => ({ ...prev, mode })),
    [mutate],
  );
  const setProvider = useCallback(
    (provider: ProviderId) => mutate((prev) => ({ ...prev, provider })),
    [mutate],
  );
  const setApiKey = useCallback(
    (provider: ProviderId, key: string) =>
      mutate((prev) => ({ ...prev, apiKeys: { ...prev.apiKeys, [provider]: key } })),
    [mutate],
  );
  const setModel = useCallback(
    (provider: ProviderId, model: string) =>
      mutate((prev) => ({ ...prev, models: { ...prev.models, [provider]: model } })),
    [mutate],
  );

  const active = useMemo(() => resolveActive(settings), [settings]);

  return { settings, active, setMode, setProvider, setApiKey, setModel };
}
