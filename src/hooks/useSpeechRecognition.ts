import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechError } from '../types';

/**
 * Wraps the browser Web Speech API (SpeechRecognition) and exposes a small,
 * React-friendly surface. All recognition logic lives here so that components
 * only render state — they never touch the browser API directly.
 *
 * Long-session robustness (so transcription never just stops):
 * - The session is recycled at sentence boundaries. Chrome keeps the whole
 *   result list in memory for a `continuous` session and eventually stops
 *   emitting events; short sessions avoid that.
 * - `onend` restarts are retried forever with backoff while the user wants to
 *   listen — the hook never gives up on its own.
 * - A watchdog force-restarts a session that died without firing any event.
 */
export interface UseSpeechRecognitionOptions {
  /**
   * Called once per finalized sentence — the "sentence ended" hand-off point.
   * The queue owns those sentences (id/status), so this hook does not keep them.
   */
  onFinalSentence?: (text: string) => void;
}

export interface UseSpeechRecognitionResult {
  /** false when the browser has no SpeechRecognition implementation (non-Chromium). */
  isSupported: boolean;
  isListening: boolean;
  /** Listening, but the session dropped and restarts are currently failing. */
  isReconnecting: boolean;
  /** Current, not-yet-confirmed transcript. Rendered in gray. */
  interimText: string;
  error: SpeechError | null;
  start: () => void;
  stop: () => void;
}

const getRecognitionCtor = (): SpeechRecognitionConstructor | null =>
  window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;

// Recycle the recognition session to keep each one short.
const RECYCLE_AFTER_FINALS = 30;
const RECYCLE_SOFT_MS = 50_000; // recycle at the next sentence boundary past this age
const RECYCLE_HARD_MS = 90_000; // recycle now, boundary or not

// No speech event for this long while listening => the session died silently.
const WATCHDOG_IDLE_MS = 15_000;
const WATCHDOG_TICK_MS = 5_000;

const MAX_INTERIM_CHARS = 500;
const RESTART_BACKOFF_MS = [0, 500, 1000, 2000, 3000];

function capInterim(text: string): string {
  return text.length > MAX_INTERIM_CHARS
    ? `…${text.slice(-MAX_INTERIM_CHARS)}`
    : text;
}

function isAlreadyStartedError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'InvalidStateError' || /already started/i.test(err.message))
  );
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionResult {
  const ctorRef = useRef<SpeechRecognitionConstructor | null>(getRecognitionCtor());
  const isSupported = ctorRef.current !== null;

  const [isListening, setIsListening] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<SpeechError | null>(null);

  const onFinalSentenceRef = useRef(options.onFinalSentence);
  onFinalSentenceRef.current = options.onFinalSentence;

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  /** The user's intent, not the API's state. */
  const wantListeningRef = useRef(false);

  // Restart / recycle bookkeeping.
  const restartAttemptsRef = useRef(0);
  const restartTimerRef = useRef<number | null>(null);
  const recyclingRef = useRef(false);
  const sessionStartedAtRef = useRef(0);
  const finalsThisSessionRef = useRef(0);
  const lastEventAtRef = useRef(0);

  // Set inside the effect; called by the returned start()/stop().
  const beginRef = useRef<() => void>(() => {});
  const endRef = useRef<() => void>(() => {});

  useEffect(() => {
    const Ctor = ctorRef.current;
    if (!Ctor) {
      setError({
        type: 'not-supported',
        message:
          '이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge에서 열어 주세요.',
      });
      return;
    }

    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    const clearRestartTimer = () => {
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
    };

    const markActivity = () => {
      lastEventAtRef.current = Date.now();
    };

    /** start() the recognition; on failure retry with backoff, forever. */
    const attemptStart = () => {
      clearRestartTimer();
      if (!wantListeningRef.current) return;
      try {
        recognition.start();
      } catch (err) {
        if (isAlreadyStartedError(err)) return; // it's actually running
        restartAttemptsRef.current = Math.min(
          restartAttemptsRef.current + 1,
          RESTART_BACKOFF_MS.length - 1,
        );
        if (restartAttemptsRef.current >= 2) setIsReconnecting(true);
        restartTimerRef.current = window.setTimeout(
          attemptStart,
          RESTART_BACKOFF_MS[restartAttemptsRef.current],
        );
      }
    };

    const scheduleRestart = (delay: number) => {
      clearRestartTimer();
      if (!wantListeningRef.current) return;
      restartTimerRef.current = window.setTimeout(attemptStart, delay);
    };

    const maybeRecycle = (hadFinal: boolean) => {
      if (!wantListeningRef.current || recyclingRef.current) return;
      const age = Date.now() - sessionStartedAtRef.current;
      const soft =
        hadFinal &&
        (finalsThisSessionRef.current >= RECYCLE_AFTER_FINALS || age > RECYCLE_SOFT_MS);
      if (soft || age > RECYCLE_HARD_MS) {
        recyclingRef.current = true;
        try {
          recognition.stop(); // onend restarts immediately (seamless)
        } catch {
          recyclingRef.current = false;
        }
      }
    };

    recognition.onstart = () => {
      setIsListening(true);
      setIsReconnecting(false);
      setError(null);
      restartAttemptsRef.current = 0;
      sessionStartedAtRef.current = Date.now();
      finalsThisSessionRef.current = 0;
      markActivity();
    };

    recognition.onresult = (event) => {
      markActivity();
      let interim = '';
      let hadFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          const trimmed = transcript.trim();
          if (trimmed) {
            onFinalSentenceRef.current?.(trimmed);
            finalsThisSessionRef.current += 1;
            hadFinal = true;
          }
        } else {
          interim += transcript;
        }
      }
      setInterimText(capInterim(interim));
      maybeRecycle(hadFinal);
    };

    recognition.onerror = (event) => {
      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          wantListeningRef.current = false;
          clearRestartTimer();
          setIsReconnecting(false);
          setError({
            type: 'permission-denied',
            message:
              '마이크 권한이 거부되었습니다. 주소창의 자물쇠 아이콘에서 마이크를 허용한 뒤 다시 시작해 주세요.',
          });
          break;
        case 'audio-capture':
          wantListeningRef.current = false;
          clearRestartTimer();
          setIsReconnecting(false);
          setError({
            type: 'no-audio-device',
            message: '마이크를 찾을 수 없습니다. 장치 연결을 확인해 주세요.',
          });
          break;
        case 'network':
        case 'no-speech':
        case 'aborted':
          // Transient — `onend` handles restart. Only surfaced if restarts fail.
          break;
        default:
          setError({
            type: 'unknown',
            message: `음성 인식 오류 (${event.error}). 자동으로 재연결을 시도합니다.`,
          });
      }
    };

    recognition.onend = () => {
      if (!wantListeningRef.current) {
        setIsListening(false);
        setIsReconnecting(false);
        return;
      }
      if (recyclingRef.current) {
        recyclingRef.current = false;
        attemptStart(); // seamless
        return;
      }
      // Unexpected drop. Restart immediately, but if the session barely lasted,
      // wait a beat so silence doesn't cause a hot restart loop.
      const sessionAge = Date.now() - sessionStartedAtRef.current;
      scheduleRestart(sessionAge < 1000 ? 1000 : 0);
    };

    recognitionRef.current = recognition;

    const watchdog = window.setInterval(() => {
      if (!wantListeningRef.current || sessionStartedAtRef.current === 0) return;
      if (Date.now() - lastEventAtRef.current < WATCHDOG_IDLE_MS) return;
      // Session died without an event — force a restart.
      markActivity(); // don't re-trigger for another WATCHDOG_IDLE_MS
      recyclingRef.current = true;
      try {
        recognition.abort(); // should fire onend -> attemptStart
      } catch {
        recyclingRef.current = false;
      }
      scheduleRestart(1500); // belt and suspenders if onend never comes
    }, WATCHDOG_TICK_MS);

    beginRef.current = () => {
      if (wantListeningRef.current) return;
      setError(null);
      setInterimText('');
      setIsReconnecting(false);
      restartAttemptsRef.current = 0;
      recyclingRef.current = false;
      sessionStartedAtRef.current = 0;
      wantListeningRef.current = true;
      markActivity();
      attemptStart();
    };

    endRef.current = () => {
      wantListeningRef.current = false;
      clearRestartTimer();
      setInterimText('');
      setIsReconnecting(false);
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };

    return () => {
      wantListeningRef.current = false;
      clearRestartTimer();
      window.clearInterval(watchdog);
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
      beginRef.current = () => {};
      endRef.current = () => {};
    };
  }, []);

  const start = useCallback(() => beginRef.current(), []);
  const stop = useCallback(() => endRef.current(), []);

  return { isSupported, isListening, isReconnecting, interimText, error, start, stop };
}
