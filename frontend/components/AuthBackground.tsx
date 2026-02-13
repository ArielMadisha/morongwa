'use client';

import { useState, useEffect } from 'react';

const BACKGROUNDS = [
  '/images/login-bg.png',
  '/images/login-bg-2.png',
] as const;

const INTERVAL_MS = 6000;

export default function AuthBackground() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % BACKGROUNDS.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {BACKGROUNDS.map((src, i) => (
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
