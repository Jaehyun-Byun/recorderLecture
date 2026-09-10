import type { SpeechError } from '../types';

interface RecorderControlsProps {
  isSupported: boolean;
  isListening: boolean;
  isReconnecting: boolean;
  error: SpeechError | null;
  onStart: () => void;
  onStop: () => void;
}

/** Start/stop button, a listening / reconnecting indicator, and the error banner. */
export function RecorderControls({
  isSupported,
  isListening,
  isReconnecting,
  error,
  onStart,
  onStop,
}: RecorderControlsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={isListening ? onStop : onStart}
          disabled={!isSupported}
          className={
            'rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 ' +
            (isListening
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700')
          }
        >
          {isListening ? '중지' : '시작'}
        </button>

        {isListening && isReconnecting && (
          <span className="flex items-center gap-2 text-sm text-amber-600">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" />
            음성 인식 재연결 중…
          </span>
        )}

        {isListening && !isReconnecting && (
          <span className="flex items-center gap-2 text-sm text-red-600">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
            듣는 중…
          </span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {error.message}
        </div>
      )}
    </div>
  );
}
