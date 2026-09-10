import { useCallback, useRef, useState } from 'react';
import { ProcessError, processSentence, type ProcessResult } from '../lib/process';
import type { Settings } from '../lib/settings';
import type { Sentence } from '../types';

/**
 * Owns the list of sentences and drives them through the active mode
 * (transcribe / translate / refine).
 *
 * Design:
 * - A sentence is appended to `sentences` the instant it's finalized, so the
 *   on-screen order always matches the spoken order regardless of when each
 *   response comes back.
 * - transcribe mode needs no processing → the sentence is appended as `done`.
 * - translate / refine go through a one-at-a-time worker queue that holds
 *   `{ id, original }` directly (not a bare id — `enqueue` runs before React
 *   re-renders, so a ref to `sentences` wouldn't have the new row yet).
 * - Current settings are read from a ref so the callbacks stay referentially
 *   stable (`enqueue` is handed to useSpeechRecognition, `retry` to a memoized list).
 */
export interface UseSentenceQueueResult {
  sentences: Sentence[];
  /** Enqueue a newly finalized sentence. */
  enqueue: (text: string) => void;
  /** Re-queue a sentence that ended in `error`. */
  retry: (id: string) => void;
  /** Re-queue every sentence currently in `error` (e.g. after fixing the key). */
  retryAll: () => void;
}

let idCounter = 0;
const makeId = (): string => `s${(idCounter += 1)}`;

interface QueueItem {
  id: string;
  original: string;
}

type Outcome =
  | { ok: true; value: ProcessResult }
  | { ok: false; message: string };

const GENERIC_ERROR = '처리에 실패했습니다.';

/** Retry once only on genuinely transient failures. */
async function attemptProcess(text: string, settings: Settings): Promise<Outcome> {
  let lastMessage = GENERIC_ERROR;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return { ok: true, value: await processSentence(text, settings) };
    } catch (err) {
      if (err instanceof ProcessError) {
        lastMessage = err.message;
        if (attempt === 1 || !err.retriable) return { ok: false, message: lastMessage };
      } else {
        return { ok: false, message: GENERIC_ERROR };
      }
    }
  }
  return { ok: false, message: lastMessage };
}

export function useSentenceQueue(settings: Settings): UseSentenceQueueResult {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const sentencesRef = useRef<Sentence[]>([]);
  sentencesRef.current = sentences;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const queueRef = useRef<QueueItem[]>([]);
  const workingRef = useRef(false);

  const patch = useCallback((id: string, next: Partial<Sentence>) => {
    setSentences((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)));
  }, []);

  const processQueue = useCallback(async () => {
    if (workingRef.current) return;
    workingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const item = queueRef.current.shift();
        if (!item) break;

        patch(item.id, { status: 'correcting', errorMessage: null });
        const outcome = await attemptProcess(item.original, settingsRef.current);
        patch(
          item.id,
          outcome.ok
            ? {
                status: 'done',
                corrected: outcome.value.corrected,
                translated: outcome.value.translated,
              }
            : { status: 'error', errorMessage: outcome.message },
        );
      }
    } finally {
      workingRef.current = false;
    }
  }, [patch]);

  const enqueue = useCallback(
    (text: string) => {
      const original = text.trim();
      if (!original) return;
      const id = makeId();
      const transcribeOnly = settingsRef.current.mode === 'transcribe';
      setSentences((prev) => [
        ...prev,
        {
          id,
          original,
          corrected: null,
          translated: null,
          status: transcribeOnly ? 'done' : 'pending',
          errorMessage: null,
        },
      ]);
      if (!transcribeOnly) {
        queueRef.current.push({ id, original });
        void processQueue();
      }
    },
    [processQueue],
  );

  const requeue = useCallback(
    (predicate: (s: Sentence) => boolean) => {
      const targets = sentencesRef.current.filter(predicate);
      if (targets.length === 0) return;
      for (const s of targets) {
        patch(s.id, { status: 'pending', errorMessage: null });
        queueRef.current.push({ id: s.id, original: s.original });
      }
      void processQueue();
    },
    [patch, processQueue],
  );

  const retry = useCallback(
    (id: string) => requeue((s) => s.id === id && s.status === 'error'),
    [requeue],
  );
  const retryAll = useCallback(
    () => requeue((s) => s.status === 'error'),
    [requeue],
  );

  return { sentences, enqueue, retry, retryAll };
}
