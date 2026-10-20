/**
 * AIVA Subtle Clock
 * Real-time minimalistic system time and date coordinate.
 * Positioned subtly at the top-right of the desktop overlay.
 * No account icons, no notification cards, no telemetry widgets.
 */

'use client';

import React, { useState, useEffect } from 'react';

export function SubtleClock({ className = '' }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) {
    return null;
  }

  const timeStr = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div
      className={`select-none text-right flex flex-col items-end pointer-events-none opacity-80 hover:opacity-100 transition-opacity ${className}`}
      aria-label="System Time & Date"
    >
      <span className="font-telemetry text-2xl font-bold tracking-wider text-on-surface drop-shadow-sm">
        {timeStr}
      </span>
      <span className="font-body text-xs text-on-dim font-medium tracking-wide">
        {dateStr}
      </span>
    </div>
  );
}
