import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useMicWaveform } from './hooks/useMicWaveform';
import { useSentenceQueue } from './hooks/useSentenceQueue';
import { useSettings } from './hooks/useSettings';
import { useBrowserTranslator } from './hooks/useBrowserTranslator';
import { RecorderControls } from './components/RecorderControls';
import { SettingsPanel } from './components/SettingsPanel';
import { Waveform } from './components/Waveform';
import { SentenceList } from './components/SentenceList';
import { LiveTranscript } from './components/LiveTranscript';

/**
 * Composition root. Wires settings → sentence queue, speech hook → queue, and
 * everything into the presentational components.
 */
export default function App() {
  const { settings, setMode, setProvider, setApiKey, setModel } = useSettings();
  const translator = useBrowserTranslator(settings.mode === 'translate');
  const { sentences, enqueue, retry, retryAll } = useSentenceQueue(settings);
  const { isSupported, isListening, isReconnecting, interimText, error, start, stop } =
    useSpeechRecognition({ onFinalSentence: enqueue });
  const { analyser, error: waveformError } = useMicWaveform(isListening);

  const errorCount = sentences.reduce((n, s) => (s.status === 'error' ? n + 1 : n), 0);

  const handleStart = () => {
    // Model download needs a user gesture — this click is one.
    if (settings.mode === 'translate') translator.prepare();
    start();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 py-8">
      <header>
        <h1 className="text-xl font-bold text-slate-900">LectureCaption</h1>
        <p className="mt-1 text-sm text-slate-500">
          영어 강의를 실시간으로 전사하고, 선택한 모드로 번역·교정합니다.
        </p>
      </header>

      <SettingsPanel
        settings={settings}
        translatorStatus={translator.status}
        translatorProgress={translator.progress}
        onModeChange={setMode}
        onProviderChange={setProvider}
        onApiKeyChange={setApiKey}
        onModelChange={setModel}
        onPrepareTranslator={translator.prepare}
      />

      <RecorderControls
        isSupported={isSupported}
        isListening={isListening}
        isReconnecting={isReconnecting}
        error={error}
        onStart={handleStart}
        onStop={stop}
      />

      <section>
        <Waveform analyser={analyser} active={isListening} />
        {waveformError && (
          <p className="mt-1 text-xs text-slate-400">{waveformError}</p>
        )}
      </section>

      <main className="flex-1 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        {errorCount > 0 && (
          <div className="flex items-center justify-between rounded bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <span>처리 실패 {errorCount}건</span>
            <button
              type="button"
              onClick={retryAll}
              className="rounded border border-amber-300 px-2 py-0.5 font-medium hover:bg-amber-100"
            >
              모두 재시도
            </button>
          </div>
        )}
        <SentenceList sentences={sentences} mode={settings.mode} onRetry={retry} />
        <LiveTranscript
          interimText={interimText}
          isListening={isListening}
          hasSentences={sentences.length > 0}
        />
      </main>
    </div>
  );
}
