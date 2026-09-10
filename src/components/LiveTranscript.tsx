interface LiveTranscriptProps {
  interimText: string;
  /** Sentences buffered for the next paragraph (refine mode). */
  bufferText: string;
  bufferCount: number;
  isListening: boolean;
  /** Whether any confirmed segment is already on screen (rendered by SegmentList). */
  hasSegments: boolean;
}

/**
 * Below the confirmed segments: the paragraph buffer (medium gray) then the
 * current in-progress transcript (light gray). Also the empty-state hint.
 */
export function LiveTranscript({
  interimText,
  bufferText,
  bufferCount,
  isListening,
  hasSegments,
}: LiveTranscriptProps) {
  if (bufferText || interimText) {
    return (
      <div className="space-y-1 leading-relaxed">
        {bufferText && (
          <p className="text-slate-500">
            <span className="mr-1 text-xs text-slate-400">모으는 중 {bufferCount}문장</span>
            {bufferText}
          </p>
        )}
        {interimText && <p className="text-slate-400">{interimText}</p>}
      </div>
    );
  }

  if (hasSegments) return null;

  return (
    <p className="text-sm text-slate-400">
      {isListening
        ? '말을 시작하면 여기에 전사 결과가 표시됩니다.'
        : '“시작”을 눌러 강의 전사를 시작하세요.'}
    </p>
  );
}
