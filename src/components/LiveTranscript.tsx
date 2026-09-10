interface LiveTranscriptProps {
  interimText: string;
  isListening: boolean;
  /** Whether any confirmed sentence is already on screen (rendered by SentenceList). */
  hasSentences: boolean;
}

/**
 * The current in-progress transcript (gray), shown under the confirmed
 * sentences. Also carries the empty-state hint. Purely presentational.
 */
export function LiveTranscript({
  interimText,
  isListening,
  hasSentences,
}: LiveTranscriptProps) {
  if (interimText) {
    return <p className="leading-relaxed text-slate-400">{interimText}</p>;
  }

  if (hasSentences) return null;

  return (
    <p className="text-sm text-slate-400">
      {isListening
        ? '말을 시작하면 여기에 전사 결과가 표시됩니다.'
        : '“시작”을 눌러 강의 전사를 시작하세요.'}
    </p>
  );
}
