'use client';

import React, { useEffect, useMemo } from 'react';

type RunningMode = 'loop' | 'once' | 'off';

export interface QSpinnerProps {
  size?: number;
  ringWidth?: number;
  color?: string;
  trackColor?: string;
  speedMs?: number;
  running?: RunningMode;
  onCompleteOnce?: () => void;
  className?: string;
}

/**
 * QSpinner renders a circular "Q" badge with a dot that orbits once or continuously.
 * - SVG viewBox: 0 0 36 36, center at (18, 18)
 */
export const QSpinner: React.FC<QSpinnerProps> = ({
  size = 28,
  ringWidth = 3.5,
  color = '#0ea5e9',
  trackColor = '#e0f2fe',
  speedMs = 900,
  running = 'off',
  onCompleteOnce,
  className = '',
}) => {
  const radius = 14;
  const center = 18;

  const animStyle = useMemo<React.CSSProperties>(() => {
    const base = {
      transformOrigin: `${center}px ${center}px`,
      willChange: 'transform',
    } as React.CSSProperties;

    if (running === 'loop') {
      return {
        ...base,
        animation: `q-rotate ${speedMs}ms linear infinite`,
      };
    }
    if (running === 'once') {
      return {
        ...base,
        animation: `q-rotate ${speedMs}ms linear 1 forwards`,
      };
    }
    return base;
  }, [running, speedMs]);

  useEffect(() => {
    if (running !== 'once') return;
    const t = setTimeout(() => {
      onCompleteOnce?.();
    }, speedMs);
    return () => clearTimeout(t);
  }, [running, speedMs, onCompleteOnce]);

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-hidden={running === 'off' ? undefined : true}
      role="img"
      aria-label={running !== 'off' ? 'Loading' : 'Idle'}
    >
      <svg width={size} height={size} viewBox="0 0 36 36" focusable="false">
        <defs>
          <linearGradient id="qBlue" x1="0" x2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>
        {/* Outer static track ring */}
        <circle
          cx={center}
          cy={center}
          r={16}
          fill="none"
          stroke={trackColor}
          strokeWidth={ringWidth}
        />
        {/* Foreground blue ring (static) */}
        <circle
          cx={center}
          cy={center}
          r={16}
          fill="none"
          stroke="url(#qBlue)"
          strokeWidth={ringWidth}
          strokeDasharray={2 * Math.PI * 16}
          strokeDashoffset={0}
          opacity={0.45}
        />
        {/* Q inner cutout (make center look hollow) */}
        <circle cx={center} cy={center} r={11} fill="white" />
        {/* Q tail at ~4 o'clock */}
        <path
          d="M 26 23 Q 28 24 27 26 Q 26 28 24 27"
          fill="none"
          stroke={color}
          strokeWidth={ringWidth}
          strokeLinecap="round"
        />
        {/* Orbit group: rotate this <g> so dot circles around */}
        <g style={animStyle}>
          <circle cx={center + radius} cy={center} r={2.8} fill={color} />
        </g>
        {/* Optional: subtle inner ring accent */}
        <circle
          cx={center}
          cy={center}
          r={12.5}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0.18}
        />
      </svg>
      <style>{`
        @keyframes q-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .q-no-motion, .q-no-motion * {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
};
