import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechError } from '../types';

/**
 * Wraps the browser Web Speech API (SpeechRecognition) and exposes a small,
 * React-friendly surface. All recognition logic lives here so that components
 * only render state — they never touch the browser API directly.
 */
export interface UseSpeechRecognitionResult {
  /** false when the browser has no SpeechRecognition implementation (non-Chromium). */
  isSupported: boolean;
  isListening: boolean;
  /** Current, not-yet-confirmed transcript. Rendered in gray. */
  interimText: string;
  /**
   * Confirmed sentences, in spoken order. A new entry means "a sentence ended"
   * — the hand-off point for AI correction/translation in later features.
   */
  finalizedSentences: string[];
  error: SpeechError | null;
  start: () => void;
  stop: () => void;
}

const getRecognitionCtor = (): SpeechRecognitionConstructor | null =>
  window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;

export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const ctorRef = useRef<SpeechRecognitionConstructor | null>(getRecognitionCtor());
  const isSupported = ctorRef.current !== null;

  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [finalizedSentences, setFinalizedSentences] = useState<string[]>([]);
  const [error, setError] = useState<SpeechError | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  /**
   * The user's intent, not the API's state. Web Speech API fires `onend` on its
   * own after short silences; we only auto-restart while this is true.
   */
  const wantListeningRef = useRef(false);

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

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      let interim = '';
      const newFinals: string[] = [];
      // Only walk results that changed since the last event.
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          const trimmed = transcript.trim();
          if (trimmed) newFinals.push(trimmed);
        } else {
          interim += transcript;
        }
      }
      setInterimText(interim);
      if (newFinals.length > 0) {
        setFinalizedSentences((prev) => [...prev, ...newFinals]);
      }
    };

    recognition.onerror = (event) => {
      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          wantListeningRef.current = false;
          setError({
            type: 'permission-denied',
            message:
              '마이크 권한이 거부되었습니다. 주소창의 자물쇠 아이콘에서 마이크를 허용한 뒤 다시 시작해 주세요.',
          });
          break;
        case 'audio-capture':
          wantListeningRef.current = false;
          setError({
            type: 'no-audio-device',
            message: '마이크를 찾을 수 없습니다. 장치 연결을 확인해 주세요.',
          });
          break;
        case 'network':
          setError({
            type: 'network',
            message:
              '네트워크 오류로 음성 인식에 실패했습니다. 인터넷 연결을 확인해 주세요.',
          });
          break;
        case 'no-speech':
        case 'aborted':
          // Benign: `onend` handles restart-or-stop.
          break;
        default:
          setError({
            type: 'unknown',
            message: `음성 인식 오류가 발생했습니다 (${event.error}).`,
          });
      }
    };

    recognition.onend = () => {
      if (wantListeningRef.current) {
        // Transparent restart so long pauses don't end the session.
        try {
          recognition.start();
        } catch {
          // start() throws if called too soon after end — retry once shortly.
          window.setTimeout(() => {
            if (wantListeningRef.current) {
              try {
                recognition.start();
              } catch {
                wantListeningRef.current = false;
                setIsListening(false);
              }
            }
          }, 250);
        }
        return;
      }
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      wantListeningRef.current = false;
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || wantListeningRef.current) return;
    setError(null);
    setInterimText('');
    wantListeningRef.current = true;
    try {
      recognition.start();
    } catch {
      // Already running — ignore.
    }
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    setInterimText('');
    recognitionRef.current?.stop();
  }, []);

  return {
    isSupported,
    isListening,
    interimText,
    finalizedSentences,
    error,
    start,
    stop,
  };
}
