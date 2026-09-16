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
 * - refine:     sentences accumulate in a buffer; a 3-minute timer (started by
 *               the first sentence after a flush) decides when to close the
 *               chunk — time-based, not sentence-count-based — plus "Stop"
 *               flushes immediately. The chunk becomes ONE segment that the LLM
 *               turns into Korean study notes. Chunks are processed
 *               **sequentially**, each carrying rolling lecture memory: an
 *               append-only glossary (merged client-side so terms never drift),
 *               a running outline, and the previous chunk's notes.
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

// Close a chunk every 3 minutes of accumulated speech — time-based, regardless
// of how many sentences that turns out to be.
const CHUNK_INTERVAL_MS = 180_000;
const MAX_GLOSSARY_TERMS = 80;
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
  translated: null,
  notes: null,
  concepts: null,
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
  const chunkTimerRef = useRef<number | null>(null);

  const sentenceQueueRef = useRef<SentenceItem[]>([]);
  const paragraphQueueRef = useRef<ParagraphItem[]>([]);
  const workingRef = useRef(false);

  // Rolling lecture memory for refine mode. Advances only on a successful chunk.
  const glossaryRef = useRef<Record<string, string>>({});
  const outlineRef = useRef('');
  const recentNotesRef = useRef('');

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
              outline: outlineRef.current,
              recentNotes: recentNotesRef.current,
              settings: settingsRef.current,
            }),
          );
          if (result.ok) {
            const raw = result.value;
            patch(item.id, {
              status: 'done',
              notes: raw.notes,
              concepts: raw.concepts,
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
            if (raw.outline && raw.outline !== '=') outlineRef.current = raw.outline;
            recentNotesRef.current = raw.notes;
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
    if (chunkTimerRef.current !== null) {
      window.clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    const parts = bufferRef.current;
    bufferRef.current = [];
    setBuffer({ text: '', count: 0 });
    if (parts.length === 0) return;

    const chunk = parts.join(' ').replace(/\s+/g, ' ').trim();
    const id = makeId();
    setSegments((prev) => [...prev, newSegment(id, chunk, 'pending')]);
    paragraphQueueRef.current.push({ id, original: chunk });
    void drainQueues();
  }, [drainQueues]);

  const scheduleFlush = useCallback(() => {
    // The first sentence after a flush starts the 3-minute clock; later
    // sentences in the same window just accumulate until it fires.
    if (chunkTimerRef.current === null) {
      chunkTimerRef.current = window.setTimeout(flush, CHUNK_INTERVAL_MS);
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
      // refine — accumulate into the chunk buffer
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
      if (chunkTimerRef.current !== null) window.clearTimeout(chunkTimerRef.current);
    },
    [],
  );

  return { segments, buffer, enqueue, retry, retryAll, finalize };
}
