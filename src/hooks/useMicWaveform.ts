import { useEffect, useState } from 'react';

/**
 * Opens a dedicated mic stream and exposes an AnalyserNode for waveform drawing.
 *
 * Why a separate stream: the Web Speech API (useSpeechRecognition) captures the
 * mic internally and gives us no audio-level data, so we open our own
 * getUserMedia stream + Web Audio graph purely for visualization. Chromium
 * allows both captures at once; the mic permission is shared so there is no
 * extra prompt once granted.
 *
 * The stream is only held while `active` is true.
 */
export interface UseMicWaveformResult {
  analyser: AnalyserNode | null;
  error: string | null;
}

export function useMicWaveform(active: boolean): UseMicWaveformResult {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('이 브라우저에서는 입력 레벨을 표시할 수 없습니다.');
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((micStream) => {
        if (cancelled) {
          micStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = micStream;
        context = new AudioContext();
        // Autoplay policy can leave the context suspended; this effect runs
        // after the user clicked "시작", so resuming here is allowed.
        void context.resume();

        const source = context.createMediaStreamSource(micStream);
        const node = context.createAnalyser();
        node.fftSize = 2048;
        node.smoothingTimeConstant = 0.8;
        source.connect(node);
        // Intentionally not connected to context.destination — no playback.

        setError(null);
        setAnalyser(node);
      })
      .catch(() => {
        if (!cancelled) {
          setError('마이크 입력 레벨을 표시할 수 없습니다.');
        }
      });

    return () => {
      cancelled = true;
      setAnalyser(null);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
    };
  }, [active]);

  return { analyser, error };
}
