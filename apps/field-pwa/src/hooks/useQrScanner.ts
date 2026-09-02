import { useCallbackRef } from './useCallbackRef';
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/**
 * Détection de QR code depuis le flux caméra.
 *  - utilise l'API native `BarcodeDetector` quand elle existe (Android/Chrome) — rapide, économe
 *  - repli sur `jsQR` (WASM/JS) sinon (iOS Safari, Firefox) — décode un frame sur 2
 * Rend un `<video>` à monter dans l'UI + l'état (permission, torche, erreurs).
 */
export type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'denied' | 'unavailable' | 'error';

interface Options {
  onResult: (value: string) => void;
  /** anti-rebond : ignore la même valeur relue pendant N ms (défaut 2500) */
  dedupeMs?: number;
  paused?: boolean;
}

// BarcodeDetector n'est pas encore dans les lib.dom.d.ts stables
declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { BarcodeDetector?: any }
}

export function useQrScanner({ onResult, dedupeMs = 2500, paused = false }: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastHitRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onResultStable = useCallbackRef(onResult);

  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function emit(value: string) {
    const now = Date.now();
    if (value === lastHitRef.current.value && now - lastHitRef.current.at < dedupeMs) return;
    lastHitRef.current = { value, at: now };
    if (navigator.vibrate) navigator.vibrate(60);
    onResultStable(value);
  }

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    async function start() {
      setStatus('starting');
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable');
        setError("La caméra n'est pas accessible sur cet appareil / navigateur.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        video!.srcObject = stream;
        await video!.play();

        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(Boolean(caps.torch));

        const native = window.BarcodeDetector
          ? new window.BarcodeDetector({ formats: ['qr_code'] })
          : null;

        canvasRef.current = canvasRef.current ?? document.createElement('canvas');
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        let frame = 0;

        const tick = async () => {
          if (cancelled || !video || video.readyState < 2) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          try {
            if (native) {
              const codes = await native.detect(video);
              if (codes[0]?.rawValue) emit(codes[0].rawValue);
            } else if (frame++ % 2 === 0) {
              const w = (canvas.width = video.videoWidth);
              const h = (canvas.height = video.videoHeight);
              if (w && h) {
                ctx.drawImage(video, 0, 0, w, h);
                const img = ctx.getImageData(0, 0, w, h);
                const found = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
                if (found?.data) emit(found.data);
              }
            }
          } catch {
            /* frame illisible : on continue */
          }
          rafRef.current = requestAnimationFrame(tick);
        };

        setStatus('scanning');
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        const e = err as DOMException;
        if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
          setStatus('denied');
          setError("Accès caméra refusé. Autorisez la caméra dans les réglages du navigateur.");
        } else if (e.name === 'NotFoundError') {
          setStatus('unavailable');
          setError('Aucune caméra détectée.');
        } else {
          setStatus('error');
          setError(e.message || 'Erreur caméra.');
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
      setStatus('idle');
    };
  }, [paused, onResultStable, dedupeMs]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      // `torch` n'est pas encore dans les typings standard
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  return { videoRef, status, error, torchOn, torchSupported, toggleTorch };
}
