import { useCallback, useEffect, useState } from 'react';
import {
  getBrowserTranslatorStatus,
  prepareBrowserTranslator,
  type TranslatorStatus,
} from '../lib/translator';

export interface UseBrowserTranslatorResult {
  status: TranslatorStatus;
  /** 0..1 while the model downloads, else null. */
  progress: number | null;
  /** Kick off model download. Call from a user gesture (the Start click). */
  prepare: () => void;
}

/**
 * Tracks the built-in translator's readiness. `enabled` should be true only in
 * translate mode so we don't probe the API otherwise.
 */
export function useBrowserTranslator(enabled: boolean): UseBrowserTranslatorResult {
  const [status, setStatus] = useState<TranslatorStatus>('checking');
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus('checking');
    getBrowserTranslatorStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const prepare = useCallback(() => {
    if (!enabled) return;
    setProgress((p) => (p === null ? 0 : p));
    void prepareBrowserTranslator((fraction) => setProgress(fraction))
      .then(() => {
        setProgress(1);
        setStatus('available');
      })
      .catch(() => {
        setProgress(null);
        setStatus('unavailable');
      });
  }, [enabled]);

  return { status, progress, prepare };
}
