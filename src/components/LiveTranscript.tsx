interface LiveTranscriptProps {
  finalizedSentences: string[];
  interimText: string;
  isListening: boolean;
}

/**
 * Shows every confirmed sentence as solid text, followed by the current
 * in-progress transcript in gray. Purely presentational.
 */
export function LiveTranscript({
  finalizedSentences,
  interimText,
  isListening,
}: LiveTranscriptProps) {
  const hasContent = finalizedSentences.length > 0 || interimText.length > 0;

  if (!hasContent) {
    return (
      <p className="text-sm text-slate-400">
        {isListening
          ? '말을 시작하면 여기에 전사 결과가 표시됩니다.'
          : '“시작”을 눌러 강의 전사를 시작하세요.'}
      </p>
    );
  }

  return (
    <div className="space-y-2 leading-relaxed">
      {finalizedSentences.map((sentence, index) => (
        <p key={index} className="text-slate-900">
          {sentence}
        </p>
      ))}
      {interimText && <p className="text-slate-400">{interimText}</p>}
    </div>
  );
}
