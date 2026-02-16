'use client';

import { useState, useEffect } from 'react';
import { API_BASE, getImageUrl } from '@/lib/api';

const FALLBACK_BACKGROUNDS = [
  '/images/login-bg.png',
  '/images/login-bg-2.png',
];

const INTERVAL_MS = 6000;

export default function AuthBackground() {
  const [backgrounds, setBackgrounds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    fetch(`${API_BASE}/api/landing-backgrounds`)
      .then((res) => res.json())
      .then((data) => {
        const items = data?.data ?? data ?? [];
        if (Array.isArray(items) && items.length > 0) {
          setBackgrounds(items.map((b: { imageUrl: string }) => getImageUrl(b.imageUrl)).filter(Boolean));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const list = backgrounds.length > 0 ? backgrounds : FALLBACK_BACKGROUNDS;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % list.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [backgrounds.length]);

  const list = backgrounds.length > 0 ? backgrounds : FALLBACK_BACKGROUNDS;

  return (
    <>
      {list.map((src, i) => (
        <div
          key={src}
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000"
          style={{
            backgroundImage: `url(${src})`,
            opacity: i === index ? 1 : 0,
            zIndex: i === index ? 0 : -1,
          }}
        />
      ))}
      <div className="absolute inset-0 bg-slate-900/50" style={{ zIndex: 1 }} />
    </>
  );
}
