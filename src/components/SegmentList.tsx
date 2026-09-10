import { memo } from 'react';
import type { AppMode } from '../lib/settings';
import type { Segment } from '../types';

interface SegmentRowProps {
  segment: Segment;
  processingLabel: string;
  onRetry: (id: string) => void;
}

/**
 * One segment (sentence or paragraph). Display is data-driven:
 *   - `corrected` present → 원문 작게 + 교정문 크게, else 원문 크게
 *   - `translated` present → 왼쪽 테두리로 번역
 * plus the in-progress / error state.
 *
 * Memoized so an interim-transcript tick, or a status change on a different
 * segment, doesn't re-render every row — keeps the main thread free for the
 * speech-recognition callbacks when the transcript grows long.
 */
const SegmentRow = memo(function SegmentRow({
  segment,
  processingLabel,
  onRetry,
}: SegmentRowProps) {
  const hasCorrection = !!segment.corrected && segment.corrected !== segment.original;

  return (
    <li className="space-y-1 leading-relaxed">
      <p className={hasCorrection ? 'text-xs text-slate-400' : 'text-slate-900'}>
        {segment.original}
      </p>

      {hasCorrection && <p className="text-slate-900">{segment.corrected}</p>}

      {segment.translated && (
        <p className="border-l-2 border-slate-200 pl-3 text-sm text-slate-600">
          {segment.translated}
        </p>
      )}

      {segment.status === 'pending' && (
        <p className="text-sm text-slate-300">대기 중…</p>
      )}
      {segment.status === 'processing' && (
        <p className="text-sm text-slate-400">{processingLabel}</p>
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

const PROCESSING_LABEL: Record<AppMode, string> = {
  transcribe: '처리 중…',
  translate: '번역 중…',
  refine: '교정 중…',
};

/**
 * Confirmed segments in spoken order. Memoized: interim-transcript updates don't
 * touch `segments`, so the whole list is skipped on those renders.
 */
export const SegmentList = memo(function SegmentList({
  segments,
  mode,
  onRetry,
}: SegmentListProps) {
  const processingLabel = PROCESSING_LABEL[mode];
  return (
    <ol className="space-y-5">
      {segments.map((segment) => (
        <SegmentRow
          key={segment.id}
          segment={segment}
          processingLabel={processingLabel}
          onRetry={onRetry}
        />
      ))}
    </ol>
  );
});
