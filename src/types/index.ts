/** Shared domain types for LectureCaption. */

/**
 * Processing state of one on-screen segment.
 * - `pending`    finalized, waiting its turn
 * - `processing` translation / note generation in flight
 * - `done`       output filled in as far as the mode goes
 * - `error`      failed (after a retry, if transient); `errorMessage` says why
 */
export type SegmentStatus = 'pending' | 'processing' | 'done' | 'error';

/**
 * One displayed unit of transcript.
 * - transcribe: a sentence — only `original`.
 * - translate:  a sentence — `original` + `translated` (browser translation).
 * - refine:     a ~20-sentence chunk — `original` (raw, reference) plus AI study
 *               notes: `notes` (개조식 재구성) and `concepts` (용어·개념 설명).
 */
export interface Segment {
  id: string;
  original: string;
  /** translate mode: faithful Korean translation. */
  translated: string | null;
  /** refine mode: 개조식 한국어 학습 노트 (발화 내용 재구성). */
  notes: string | null;
  /** refine mode: 개조식 어려운 용어·개념 설명 (없으면 빈 문자열). */
  concepts: string | null;
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
