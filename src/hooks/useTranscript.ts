import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ProcessError,
  processParagraph,
  processSentence,
} from '../lib/process';
import { parseGlossary, serializeGlossary } from '../lib/providers/prompt';
import type { Settings } from '../lib/settings';
import type { Segment } from '../types';

/**
 * Owns the transcript and drives it through the active mode.
 *
 * - transcribe: each finalized sentence → a `done` segment immediately.
 * - translate:  each sentence → one segment → browser translation (per sentence).
 * - refine:     sentences accumulate in a buffer; the buffer flushes into ONE
 *               paragraph segment (~10 sentences: 10 / 8s idle once >=8 / 90s max
 *               / stop). Paragraphs are refined **sequentially**, each carrying a
 *               rolling glossary (append-only, merged client-side so terms never
 *               drift), rolling notes, and the last two corrected paragraphs.
 */
export interface UseTranscriptResult {
  segments: Segment[];
  /** Sentences buffered but not yet flushed (refine mode) — for a live preview. */
  buffer: { text: string; count: number };
  enqueue: (text: string) => void;
  retry: (id: string) => void;
  retryAll: () => void;
  /** Flush any buffered sentences now (call on Stop). */
  finalize: () => void;
}

// Aim for a substantial paragraph: ~10 sentences. Flush at 10, or on a pause
// once we already have at least 8, or after a hard time cap for slow speakers.
const MAX_SENTENCES = 10;
const IDLE_MS = 8_000;
const IDLE_MIN_SENTENCES = 8;
const MAX_AGE_MS = 90_000;
const MAX_GLOSSARY_TERMS = 60;
const RECENT_PARAGRAPHS = 2;
const GENERIC_ERROR = '처리에 실패했습니다.';

let idCounter = 0;
const makeId = (): string => `s${(idCounter += 1)}`;

interface SentenceItem {
  id: string;
  text: string;
}
interface ParagraphItem {
  id: string;
  original: string;
}

type Attempt<T> = { ok: true; value: T } | { ok: false; message: string };

/** Run `fn`, retrying once on a transient ProcessError. */
async function attempt<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  let message = GENERIC_ERROR;
  for (let i = 0; i < 2; i += 1) {
    try {
      return { ok: true, value: await fn() };
    } catch (err) {
      if (err instanceof ProcessError) {
        message = err.message;
        if (i === 1 || !err.retriable) return { ok: false, message };
      } else {
        return { ok: false, message: GENERIC_ERROR };
      }
    }
  }
  return { ok: false, message };
}

const newSegment = (id: string, original: string, status: Segment['status']): Segment => ({
  id,
  original,
  corrected: null,
  translated: null,
  status,
  errorMessage: null,
});

export function useTranscript(settings: Settings): UseTranscriptResult {
  const [segments, setSegments] = useState<Segment[]>([]);
  const segmentsRef = useRef<Segment[]>([]);
  segmentsRef.current = segments;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [buffer, setBuffer] = useState<{ text: string; count: number }>({
    text: '',
    count: 0,
  });
  const bufferRef = useRef<string[]>([]);
  const idleTimerRef = useRef<number | null>(null);
  const maxAgeTimerRef = useRef<number | null>(null);

  const sentenceQueueRef = useRef<SentenceItem[]>([]);
  const paragraphQueueRef = useRef<ParagraphItem[]>([]);
  const workingRef = useRef(false);

  // Rolling lecture memory for refine mode. Advances only on a successful paragraph.
  const glossaryRef = useRef<Record<string, string>>({});
  const notesRef = useRef('');
  const recentRef = useRef<string[]>([]);

  const patch = useCallback((id: string, next: Partial<Segment>) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)));
  }, []);

  const drainQueues = useCallback(async () => {
    if (workingRef.current) return;
    workingRef.current = true;
    try {
      while (
        paragraphQueueRef.current.length > 0 ||
        sentenceQueueRef.current.length > 0
      ) {
        if (paragraphQueueRef.current.length > 0) {
          const item = paragraphQueueRef.current.shift();
          if (!item) continue;
          patch(item.id, { status: 'processing', errorMessage: null });
          const result = await attempt(() =>
            processParagraph({
              newParagraph: item.original,
              glossary: serializeGlossary(glossaryRef.current),
              notes: notesRef.current,
              recentCorrected: recentRef.current.join('\n\n'),
              settings: settingsRef.current,
            }),
          );
          if (result.ok) {
            const raw = result.value;
            patch(item.id, {
              status: 'done',
              corrected: raw.corrected,
              translated: raw.translated,
            });
            // Merge glossary: append-only, keep the first Korean seen for a term.
            if (raw.glossary && raw.glossary !== '=') {
              for (const [en, ko] of parseGlossary(raw.glossary)) {
                if (
                  !glossaryRef.current[en] &&
                  Object.keys(glossaryRef.current).length < MAX_GLOSSARY_TERMS
                ) {
                  glossaryRef.current[en] = ko;
                }
              }
            }
            if (raw.notes && raw.notes !== '=') notesRef.current = raw.notes;
            recentRef.current = [...recentRef.current, raw.corrected].slice(
              -RECENT_PARAGRAPHS,
            );
          } else {
            patch(item.id, { status: 'error', errorMessage: result.message });
          }
        } else {
          const item = sentenceQueueRef.current.shift();
          if (!item) continue;
          patch(item.id, { status: 'processing', errorMessage: null });
          const result = await attempt(() =>
            processSentence(item.text, settingsRef.current),
          );
          patch(
            item.id,
            result.ok
              ? { status: 'done', translated: result.value.translated }
              : { status: 'error', errorMessage: result.message },
          );
        }
      }
    } finally {
      workingRef.current = false;
    }
  }, [patch]);

  const flush = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (maxAgeTimerRef.current !== null) {
      window.clearTimeout(maxAgeTimerRef.current);
      maxAgeTimerRef.current = null;
    }
    const parts = bufferRef.current;
    bufferRef.current = [];
    setBuffer({ text: '', count: 0 });
    if (parts.length === 0) return;

    const paragraph = parts.join(' ').replace(/\s+/g, ' ').trim();
    const id = makeId();
    setSegments((prev) => [...prev, newSegment(id, paragraph, 'pending')]);
    paragraphQueueRef.current.push({ id, original: paragraph });
    void drainQueues();
  }, [drainQueues]);

  const scheduleFlush = useCallback(() => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    if (bufferRef.current.length >= MAX_SENTENCES) {
      flush();
      return;
    }
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      // Only close a paragraph on a pause if enough has piled up; otherwise wait
      // for more sentences (or the MAX_AGE backstop / Stop).
      if (bufferRef.current.length >= IDLE_MIN_SENTENCES) flush();
    }, IDLE_MS);
    if (maxAgeTimerRef.current === null) {
      maxAgeTimerRef.current = window.setTimeout(flush, MAX_AGE_MS);
    }
  }, [flush]);

  const enqueue = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const mode = settingsRef.current.mode;

      if (mode === 'transcribe') {
        setSegments((prev) => [...prev, newSegment(makeId(), trimmed, 'done')]);
        return;
      }
      if (mode === 'translate') {
        const id = makeId();
        setSegments((prev) => [...prev, newSegment(id, trimmed, 'pending')]);
        sentenceQueueRef.current.push({ id, text: trimmed });
        void drainQueues();
        return;
      }
      // refine — accumulate into the paragraph buffer
      bufferRef.current = [...bufferRef.current, trimmed];
      setBuffer({
        text: bufferRef.current.join(' '),
        count: bufferRef.current.length,
      });
      scheduleFlush();
    },
    [drainQueues, scheduleFlush],
  );

  const requeue = useCallback(
    (predicate: (s: Segment) => boolean) => {
      const targets = segmentsRef.current.filter(predicate);
      if (targets.length === 0) return;
      const mode = settingsRef.current.mode;
      for (const s of targets) {
        patch(s.id, { status: 'pending', errorMessage: null });
        if (mode === 'refine') {
          paragraphQueueRef.current.push({ id: s.id, original: s.original });
        } else {
          sentenceQueueRef.current.push({ id: s.id, text: s.original });
        }
      }
      void drainQueues();
    },
    [drainQueues, patch],
  );

  const retry = useCallback(
    (id: string) => requeue((s) => s.id === id && s.status === 'error'),
    [requeue],
  );
  const retryAll = useCallback(() => requeue((s) => s.status === 'error'), [requeue]);
  const finalize = useCallback(() => flush(), [flush]);

  // Switching away from refine mode: flush whatever was buffered.
  useEffect(() => {
    if (settings.mode !== 'refine') flush();
  }, [settings.mode, flush]);

  useEffect(
    () => () => {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
      if (maxAgeTimerRef.current !== null) window.clearTimeout(maxAgeTimerRef.current);
    },
    [],
  );

  return { segments, buffer, enqueue, retry, retryAll, finalize };
}
