import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useMicWaveform } from './hooks/useMicWaveform';
import { RecorderControls } from './components/RecorderControls';
import { Waveform } from './components/Waveform';
import { LiveTranscript } from './components/LiveTranscript';

/**
 * Composition root. Owns nothing beyond wiring the hooks to the
 * presentational components. Sentence correction/translation is added later.
 */
export default function App() {
  const {
    isSupported,
    isListening,
    interimText,
    finalizedSentences,
    error,
    start,
    stop,
  } = useSpeechRecognition();

  const { analyser, error: waveformError } = useMicWaveform(isListening);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-xl font-bold text-slate-900">LectureCaption</h1>
        <p className="mt-1 text-sm text-slate-500">
          영어 강의를 실시간으로 전사합니다.
        </p>
      </header>

      <RecorderControls
        isSupported={isSupported}
        isListening={isListening}
        error={error}
        onStart={start}
        onStop={stop}
      />

      <section>
        <Waveform analyser={analyser} active={isListening} />
        {waveformError && (
          <p className="mt-1 text-xs text-slate-400">{waveformError}</p>
        )}
      </section>

      <main className="flex-1 rounded-lg border border-slate-200 bg-white p-4">
        <LiveTranscript
          finalizedSentences={finalizedSentences}
          interimText={interimText}
          isListening={isListening}
        />
      </main>
    </div>
  );
}
