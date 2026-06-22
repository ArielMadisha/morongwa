'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';

type Html5QrcodeInstance = {
  start: (
    cameraIdOrConfig: string | { facingMode: string },
    configuration: { fps: number; qrbox: { width: number; height: number } },
    qrCodeSuccessCallback: (decodedText: string) => void,
    qrCodeErrorCallback: (errorMessage: string) => void
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
};

async function safeStopScanner(scanner: Html5QrcodeInstance | null, wasRunning: boolean) {
  if (!scanner || !wasRunning) return;
  try {
    await scanner.stop();
  } catch {
    /* html5-qrcode throws if camera never started or already stopped */
  }
  try {
    scanner.clear();
  } catch {
    /* ignore */
  }
}

type Props = {
  onScan: (decoded: string) => void;
  onClose?: () => void;
  active?: boolean;
  title?: string;
};

export function WalletQrScanner({ onScan, onClose, active = true, title = 'Scan QR code' }: Props) {
  const elementId = useId().replace(/:/g, '');
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const runningRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    const start = async () => {
      setStarting(true);
      setError(null);
      runningRef.current = false;
      scannerRef.current = null;

      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;

        const scanner = new Html5Qrcode(elementId) as unknown as Html5QrcodeInstance;
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            if (cancelled) return;
            cancelled = true;
            const s = scannerRef.current;
            const wasRunning = runningRef.current;
            scannerRef.current = null;
            runningRef.current = false;
            void (async () => {
              await safeStopScanner(s, wasRunning);
              onScanRef.current(text);
            })();
          },
          () => {}
        );

        if (cancelled) {
          await safeStopScanner(scanner, true);
          scannerRef.current = null;
          runningRef.current = false;
          return;
        }

        runningRef.current = true;
        setStarting(false);
      } catch {
        scannerRef.current = null;
        runningRef.current = false;
        if (!cancelled) {
          setError('Camera unavailable. Allow camera access or paste the code below.');
          setStarting(false);
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      const wasRunning = runningRef.current;
      scannerRef.current = null;
      runningRef.current = false;
      void safeStopScanner(s, wasRunning);
    };
  }, [active, elementId]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-black" role="region" aria-label={title}>
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 text-white text-sm">
        <span className="font-medium">{title}</span>
        {onClose ? (
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Close scanner">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div id={elementId} className="w-full min-h-[220px]" />
      {starting && !error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      ) : null}
      {error ? <p className="px-3 py-2 text-xs text-amber-200 bg-slate-900">{error}</p> : null}
    </div>
  );
}
