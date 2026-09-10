/** Shared domain types for LectureCaption. */

/**
 * Processing state of one on-screen segment.
 * - `pending`    finalized, waiting its turn
 * - `processing` translation / paragraph refinement in flight
 * - `done`       `corrected` / `translated` filled in as far as the mode goes
 * - `error`      failed (after a retry, if transient); `errorMessage` says why
 */
export type SegmentStatus = 'pending' | 'processing' | 'done' | 'error';

/**
 * One displayed unit of transcript. In transcribe / translate mode a segment is
 * a single sentence; in refine mode it's a paragraph (several sentences the
 * buffer flushed together). `corrected` / `translated` stay null until produced.
 */
export interface Segment {
  id: string;
  original: string;
  corrected: string | null;
  translated: string | null;
  status: SegmentStatus;
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
