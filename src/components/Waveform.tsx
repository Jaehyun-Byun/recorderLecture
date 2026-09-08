import { useEffect, useRef } from 'react';

interface WaveformProps {
  analyser: AnalyserNode | null;
  /** When false (or no analyser), the canvas shows a flat idle line. */
  active: boolean;
}

const IDLE_COLOR = '#cbd5e1'; // slate-300
const ACTIVE_COLOR = '#2563eb'; // blue-600

/**
 * Real-time mic waveform on a canvas. Purely presentational: it reads
 * time-domain samples from the passed AnalyserNode inside its own rAF loop
 * (drawing at 60fps via React state would thrash re-renders).
 */
export function Waveform({ analyser, active }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let rafId = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const drawLine = (color: string, samples?: Uint8Array) => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = color;
      ctx.beginPath();

      if (!samples) {
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
      } else {
        const sliceWidth = width / samples.length;
        let x = 0;
        for (let i = 0; i < samples.length; i += 1) {
          // 128 = silence; map 0..255 byte to vertical position.
          const y = (samples[i] / 128) * (height / 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
      }
      ctx.stroke();
    };

    if (!active || !analyser) {
      drawLine(IDLE_COLOR);
      return () => window.removeEventListener('resize', resize);
    }

    const buffer = new Uint8Array(analyser.fftSize);
    const render = () => {
      rafId = requestAnimationFrame(render);
      analyser.getByteTimeDomainData(buffer);
      drawLine(ACTIVE_COLOR, buffer);
    };
    render();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [analyser, active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="h-16 w-full rounded-md border border-slate-200 bg-slate-50"
    />
  );
}
