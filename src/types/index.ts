/** Shared domain types for LectureCaption. */

/**
 * Processing state of a single captured sentence.
 * Only `pending` is reachable in feature 1 (transcription only);
 * `correcting` / `done` / `error` arrive with the AI proxy (features 2–3).
 */
export type SentenceStatus = 'pending' | 'correcting' | 'done' | 'error';

/**
 * One finalized sentence and its downstream AI results.
 * `corrected` / `translated` stay null until the backend responds.
 */
export interface Sentence {
  id: string;
  original: string;
  corrected: string | null;
  translated: string | null;
  status: SentenceStatus;
}

/** User-facing error categories surfaced by useSpeechRecognition. */
export type SpeechErrorType =
  | 'not-supported'
  | 'permission-denied'
  | 'no-audio-device'
  | 'network'
  | 'unknown';

export interface SpeechError {
  type: SpeechErrorType;
  message: string;
}
