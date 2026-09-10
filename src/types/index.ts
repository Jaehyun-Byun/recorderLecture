/** Shared domain types for LectureCaption. (RefineResult lives in lib/providers.) */

/**
 * Processing state of a single captured sentence as it moves through the
 * correction queue:
 * - `pending`    finalized, waiting its turn in the queue
 * - `correcting` request to the AI provider is in flight
 * - `done`       `corrected` / `translated` are filled in
 * - `error`      the request failed (after a retry, if transient); `errorMessage`
 *                says why, user can retry manually
 */
export type SentenceStatus = 'pending' | 'correcting' | 'done' | 'error';

/**
 * One finalized sentence and its downstream AI results.
 * `corrected` / `translated` stay null until the provider responds.
 */
export interface Sentence {
  id: string;
  original: string;
  corrected: string | null;
  translated: string | null;
  status: SentenceStatus;
  /** Set only when status is `error`. */
  errorMessage: string | null;
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
