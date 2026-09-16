import { memo, useState } from 'react';
import type { AppMode } from '../lib/settings';
import type { Segment } from '../types';

interface SegmentRowProps {
  segment: Segment;
  mode: AppMode;
  onRetry: (id: string) => void;
}

const PROCESSING_LABEL: Record<AppMode, string> = {
  transcribe: '처리 중…',
  translate: '번역 중…',
  refine: '노트 만드는 중…',
};

/**
 * One segment. transcribe/translate show the sentence (+ translation). refine
 * shows the AI study notes prominently, with the raw transcript tucked behind a
 * "원문 보기" toggle since it's error-prone and only for reference.
 *
 * Memoized so an interim-transcript tick, or a status change on a different
 * segment, doesn't re-render every row — keeps the main thread free for the
 * speech-recognition callbacks when the transcript grows long.
 */
const SegmentRow = memo(function SegmentRow({
  segment,
  mode,
  onRetry,
}: SegmentRowProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const isRefine = mode === 'refine';

  return (
    <li className="space-y-1.5 leading-relaxed">
      {isRefine ? (
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          원문 {showOriginal ? '숨기기 ▲' : '보기 ▼'}
        </button>
      ) : (
        <p className={segment.translated ? 'text-xs text-slate-400' : 'text-slate-900'}>
          {segment.original}
        </p>
      )}
      {isRefine && showOriginal && (
        <p className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-400">
          {segment.original}
        </p>
      )}

      {segment.translated && (
        <p className="border-l-2 border-slate-200 pl-3 text-sm text-slate-600">
          {segment.translated}
        </p>
      )}

      {segment.notes && (
        <div className="whitespace-pre-wrap rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-slate-800">
          {segment.notes}
        </div>
      )}

      {segment.concepts && (
        <div className="space-y-0.5 border-l-2 border-blue-200 pl-3 text-xs text-slate-600">
          <p className="font-medium text-slate-500">💡 용어·개념</p>
          <p className="whitespace-pre-wrap">{segment.concepts}</p>
        </div>
      )}

      {segment.status === 'pending' && (
        <p className="text-sm text-slate-300">대기 중…</p>
      )}
      {segment.status === 'processing' && (
        <p className="text-sm text-slate-400">{PROCESSING_LABEL[mode]}</p>
      )}
      {segment.status === 'error' && (
        <div className="flex items-start gap-2 text-sm text-amber-700">
          <span>{segment.errorMessage ?? '처리에 실패했습니다.'}</span>
          <button
            type="button"
            onClick={() => onRetry(segment.id)}
            className="shrink-0 rounded border border-amber-300 px-2 py-0.5 text-xs font-medium hover:bg-amber-50"
          >
            재시도
          </button>
        </div>
      )}
    </li>
  );
});

interface SegmentListProps {
  segments: Segment[];
  mode: AppMode;
  onRetry: (id: string) => void;
}

/**
 * Confirmed segments in spoken order. Memoized: interim-transcript updates don't
 * touch `segments`, so the whole list is skipped on those renders.
 */
export const SegmentList = memo(function SegmentList({
  segments,
  mode,
  onRetry,
}: SegmentListProps) {
  return (
    <ol className="space-y-6">
      {segments.map((segment) => (
        <SegmentRow key={segment.id} segment={segment} mode={mode} onRetry={onRetry} />
      ))}
    </ol>
  );
});
