import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechError } from '../types';

/**
 * Wraps the browser Web Speech API (SpeechRecognition) and exposes a small,
 * React-friendly surface. All recognition logic lives here so that components
 * only render state — they never touch the browser API directly.
 *
 * Long-session robustness (so transcription never just stops):
 * - Every (re)start creates a FRESH `SpeechRecognition` instance. A Chrome
 *   speech session that has wedged does NOT recover via `.start()` on the same
 *   object — only a new object does. (Reusing one object + rapid stop/start was
 *   what made transcription die after ~50s.)
 * - The session is recycled to a fresh instance every few minutes so Chrome's
 *   ever-growing result list doesn't bloat memory / stall events.
 * - `onend` (Chrome ended it on its own) and a watchdog (no event for a while)
 *   both bring it back with a fresh instance, retrying forever with backoff
 *   while the user still wants to listen.
 */
export interface UseSpeechRecognitionOptions {
  /** Called once per finalized sentence — the "sentence ended" hand-off point. */
  onFinalSentence?: (text: string) => void;
}

export interface UseSpeechRecognitionResult {
  isSupported: boolean;
  isListening: boolean;
  /** Listening, but restarts are currently failing. */
  isReconnecting: boolean;
  interimText: string;
  error: SpeechError | null;
  start: () => void;
  stop: () => void;
}

const getRecognitionCtor = (): SpeechRecognitionConstructor | null =>
  window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;

const RECYCLE_MS = 150_000; // replace the instance with a fresh one this often
const RECYCLE_CHECK_MS = 10_000;
const WATCHDOG_IDLE_MS = 12_000; // no speech event this long => wedged, replace
const WATCHDOG_TICK_MS = 4_000;
const MAX_INTERIM_CHARS = 500;
const RESTART_BACKOFF_MS = [400, 800, 1500, 3000, 5000];

const capInterim = (text: string): string =>
  text.length > MAX_INTERIM_CHARS ? `…${text.slice(-MAX_INTERIM_CHARS)}` : text;

const isAlreadyStartedError = (err: unknown): boolean =>
  err instanceof DOMException &&
  (err.name === 'InvalidStateError' || /already started/i.test(err.message));

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

  const wantListeningRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const restartAttemptsRef = useRef(0);
  const sessionStartedAtRef = useRef(0);
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

    const clearRestartTimer = () => {
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
    };
    const markActivity = () => {
      lastEventAtRef.current = Date.now();
    };

    /** Detach + abort the current instance so its events can't fire our code. */
    const teardownCurrent = () => {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (!rec) return;
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        // ignore
      }
    };

    const scheduleRestart = (delay: number) => {
      clearRestartTimer();
      if (!wantListeningRef.current) return;
      restartTimerRef.current = window.setTimeout(startFresh, delay);
    };
    const scheduleRestartBackoff = () => {
      restartAttemptsRef.current = Math.min(
        restartAttemptsRef.current + 1,
        RESTART_BACKOFF_MS.length - 1,
      );
      if (restartAttemptsRef.current >= 3) setIsReconnecting(true);
      scheduleRestart(RESTART_BACKOFF_MS[restartAttemptsRef.current]);
    };

    /** Tear down whatever's there and start a brand-new recognition instance. */
    function startFresh() {
      clearRestartTimer();
      if (!wantListeningRef.current) return;
      teardownCurrent();

      const rec = new Ctor!();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        if (recognitionRef.current !== rec) return;
        setIsListening(true);
        setIsReconnecting(false);
        setError(null);
        restartAttemptsRef.current = 0;
        sessionStartedAtRef.current = Date.now();
        markActivity();
      };

      rec.onresult = (event) => {
        if (recognitionRef.current !== rec) return;
        markActivity();
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          if (result.isFinal) {
            const trimmed = transcript.trim();
            if (trimmed) onFinalSentenceRef.current?.(trimmed);
          } else {
            interim += transcript;
          }
        }
        setInterimText(capInterim(interim));
      };

      rec.onerror = (event) => {
        if (recognitionRef.current !== rec) return;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          wantListeningRef.current = false;
          clearRestartTimer();
          setIsReconnecting(false);
          setError({
            type: 'permission-denied',
            message:
              '마이크 권한이 거부되었습니다. 주소창의 자물쇠 아이콘에서 마이크를 허용한 뒤 다시 시작해 주세요.',
          });
        } else if (event.error === 'audio-capture') {
          wantListeningRef.current = false;
          clearRestartTimer();
          setIsReconnecting(false);
          setError({
            type: 'no-audio-device',
            message: '마이크를 찾을 수 없습니다. 장치 연결을 확인해 주세요.',
          });
        }
        // network / no-speech / aborted / other → `onend` handles the restart.
      };

      rec.onend = () => {
        if (recognitionRef.current !== rec) return;
        if (!wantListeningRef.current) {
          setIsListening(false);
          setIsReconnecting(false);
          return;
        }
        const lasted = Date.now() - sessionStartedAtRef.current;
        if (lasted > 3000) {
          restartAttemptsRef.current = 0;
          scheduleRestart(400); // normal silence timeout — quick fresh restart
        } else {
          scheduleRestartBackoff(); // ended almost immediately — back off
        }
      };

      recognitionRef.current = rec;
      sessionStartedAtRef.current = Date.now();
      markActivity();
      try {
        rec.start();
      } catch (err) {
        if (isAlreadyStartedError(err)) return;
        scheduleRestartBackoff();
      }
    }

    const recycleTimer = window.setInterval(() => {
      if (!wantListeningRef.current || sessionStartedAtRef.current === 0) return;
      if (Date.now() - sessionStartedAtRef.current > RECYCLE_MS) startFresh();
    }, RECYCLE_CHECK_MS);

    const watchdog = window.setInterval(() => {
      if (!wantListeningRef.current || sessionStartedAtRef.current === 0) return;
      if (Date.now() - lastEventAtRef.current < WATCHDOG_IDLE_MS) return;
      markActivity(); // don't re-trigger for another WATCHDOG_IDLE_MS
      startFresh();
    }, WATCHDOG_TICK_MS);

    beginRef.current = () => {
      if (wantListeningRef.current) return;
      setError(null);
      setInterimText('');
      setIsReconnecting(false);
      restartAttemptsRef.current = 0;
      sessionStartedAtRef.current = 0;
      wantListeningRef.current = true;
      startFresh();
    };

    endRef.current = () => {
      wantListeningRef.current = false;
      clearRestartTimer();
      setInterimText('');
      setIsReconnecting(false);
      teardownCurrent();
      setIsListening(false);
    };

    return () => {
      wantListeningRef.current = false;
      clearRestartTimer();
      window.clearInterval(recycleTimer);
      window.clearInterval(watchdog);
      teardownCurrent();
      beginRef.current = () => {};
      endRef.current = () => {};
    };
  }, []);

  const start = useCallback(() => beginRef.current(), []);
  const stop = useCallback(() => endRef.current(), []);

  return { isSupported, isListening, isReconnecting, interimText, error, start, stop };
}
