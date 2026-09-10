import { memo } from 'react';
import type { AppMode } from '../lib/settings';
import type { Sentence } from '../types';

interface SentenceRowProps {
  sentence: Sentence;
  processingLabel: string;
  onRetry: (id: string) => void;
}

/**
 * One sentence. Display is data-driven:
 *   - `corrected` present → 원문 작게 + 교정문 크게, else 원문 크게
 *   - `translated` present → 왼쪽 테두리로 번역 표시
 * plus the in-progress / error state.
 *
 * Memoized so an interim-transcript tick, or a status change on a different
 * sentence, doesn't re-render every row — keeps the main thread free for the
 * speech-recognition callbacks when hundreds of sentences pile up.
 */
const SentenceRow = memo(function SentenceRow({
  sentence,
  processingLabel,
  onRetry,
}: SentenceRowProps) {
  const hasCorrection = !!sentence.corrected && sentence.corrected !== sentence.original;

  return (
    <li className="space-y-1 leading-relaxed">
      <p className={hasCorrection ? 'text-xs text-slate-400' : 'text-slate-900'}>
        {sentence.original}
      </p>

      {hasCorrection && <p className="text-slate-900">{sentence.corrected}</p>}

      {sentence.translated && (
        <p className="border-l-2 border-slate-200 pl-3 text-sm text-slate-600">
          {sentence.translated}
        </p>
      )}

      {sentence.status === 'pending' && (
        <p className="text-sm text-slate-300">대기 중…</p>
      )}
      {sentence.status === 'correcting' && (
        <p className="text-sm text-slate-400">{processingLabel}</p>
      )}
      {sentence.status === 'error' && (
        <div className="flex items-start gap-2 text-sm text-amber-700">
          <span>{sentence.errorMessage ?? '처리에 실패했습니다.'}</span>
          <button
            type="button"
            onClick={() => onRetry(sentence.id)}
            className="shrink-0 rounded border border-amber-300 px-2 py-0.5 text-xs font-medium hover:bg-amber-50"
          >
            재시도
          </button>
        </div>
      )}
    </li>
  );
});

interface SentenceListProps {
  sentences: Sentence[];
  mode: AppMode;
  onRetry: (id: string) => void;
}

const PROCESSING_LABEL: Record<AppMode, string> = {
  transcribe: '처리 중…',
  translate: '번역 중…',
  refine: '교정 중…',
};

/**
 * Confirmed sentences in spoken order. Memoized: interim-transcript updates
 * don't touch `sentences`, so the whole list is skipped on those renders.
 */
export const SentenceList = memo(function SentenceList({
  sentences,
  mode,
  onRetry,
}: SentenceListProps) {
  const processingLabel = PROCESSING_LABEL[mode];
  return (
    <ol className="space-y-5">
      {sentences.map((sentence) => (
        <SentenceRow
          key={sentence.id}
          sentence={sentence}
          processingLabel={processingLabel}
          onRetry={onRetry}
        />
      ))}
    </ol>
  );
});
