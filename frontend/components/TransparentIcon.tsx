'use client';

import { useEffect, useRef, useState } from 'react';

export function TransparentIcon({
  src,
  alt = '',
  className = '',
  /** Near-white threshold: pixels with all channels >= threshold become fully transparent. */
  whiteThreshold = 245,
}: {
  src: string;
  alt?: string;
  className?: string;
  whiteThreshold?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      // public assets are same-origin; this avoids tainting in common deployments.
      img.crossOrigin = 'anonymous';
      img.src = src;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
      }).catch(() => {
        // If it fails, just show nothing (avoid crashing the page).
        setReady(false);
      });

      if (cancelled) return;
      if (!img.naturalWidth || !img.naturalHeight) return;

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Turn near-white pixels into transparent.
        if (r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold) {
          data[i + 3] = 0;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      setReady(true);
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [src, whiteThreshold]);

  // Render the original image immediately to avoid a blank icon while the
  // canvas transparency pass is still running.
  return (
    <span className="relative inline-flex">
      <img
        src={src}
        alt={alt}
        className={className}
        aria-label={alt}
        role="img"
        style={{ opacity: ready ? 0 : 1 }}
      />
      <canvas
        ref={canvasRef}
        aria-label={alt}
        role="img"
        className={`${className} absolute inset-0`}
        style={{ opacity: ready ? 1 : 0 }}
      />
    </span>
  );
}

