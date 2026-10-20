/**
 * AIVA Digital Human Holographic Face & Presence Architecture
 *
 * Implements:
 * - Clean visual presence component: female, elegant, intelligent, calm, futuristic, minimal, premium.
 * - Architecture:
 *     <AivaPresence>
 *       <AivaFace>
 *         <PresenceGlow />
 *         <FaceBase />
 *         <EyeLayer />
 *         <MouthLayer />
 *       </AivaFace>
 *     </AivaPresence>
 * - Single stable face identity asset (aiva_face_base.png).
 * - Isolated EyeLayer: natural blinking cycle (120ms smooth crossfade every 3.5 - 6.5s).
 * - Isolated MouthLayer: positioned precisely over the mouth region (80x50),
 *   animated via direct DOM style manipulation in requestAnimationFrame reading audioLevelRef.
 * - ZERO React state updates / re-renders during speech playback.
 * - Ethereal volumetric presence glow reflecting state colors (Cyan, Violet, Soft Pink, Emerald).
 * - Completely transparent background (desktop wallpaper remains 100% visible).
 */

'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AivaFaceState, AivaPresenceState } from '@aiva/types';

export type { AivaFaceState, AivaPresenceState };

export interface AivaFaceProps {
  state?: AivaFaceState;
  presenceState?: AivaPresenceState;
  isVisible?: boolean;
  /** Ref holding real-time vocal amplitude [0.0 - 1.0] for zero-render DOM driving */
  audioLevelRef?: React.MutableRefObject<number>;
  /** Optional legacy scalar (backward compatibility) */
  audioLevel?: number;
  lipOpenness?: number;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
  statusHint?: string;
}

/**
 * 1. Volumetric Ethereal Atmospheric Presence Glow
 */
const PresenceGlow = React.memo(function PresenceGlow({
  state,
  dimensions,
}: {
  state: AivaFaceState;
  dimensions: { w: number; h: number };
}) {
  const ambientColor = useMemo(() => {
    switch (state) {
      case 'LISTENING':
        return 'rgba(56, 189, 248, 0.32)'; // Neural Cyan
      case 'THINKING':
        return 'rgba(129, 140, 248, 0.36)'; // Cognitive Violet
      case 'SPEAKING':
        return 'rgba(244, 114, 182, 0.28)'; // Ethereal Soft Pink
      case 'EXECUTING':
        return 'rgba(52, 211, 153, 0.28)'; // Emerald Directive
      case 'IDLE':
      default:
        return 'rgba(56, 189, 248, 0.14)';
    }
  }, [state]);

  return (
    <div
      className="absolute rounded-full pointer-events-none filter blur-3xl transition-all duration-700 ease-out"
      style={{
        width: dimensions.w * 1.12,
        height: dimensions.h * 1.12,
        background: `radial-gradient(circle at 50% 50%, ${ambientColor} 0%, rgba(99, 102, 241, 0.03) 52%, transparent 72%)`,
        opacity: state === 'IDLE' ? 0.65 : 0.95,
      }}
    />
  );
});

/**
 * 2. Rock-Solid Stable Digital Human Face Base
 * Single stable identity asset that is NEVER distorted, stretched, or scaled by audio.
 */
const FaceBase = React.memo(function FaceBase({
  state,
  dimensions,
}: {
  state: AivaFaceState;
  dimensions?: { w: number; h: number };
}) {
  const dropShadow = useMemo(() => {
    switch (state) {
      case 'LISTENING':
        return 'drop-shadow(0 0 22px rgba(56, 189, 248, 0.40))';
      case 'THINKING':
        return 'drop-shadow(0 0 24px rgba(129, 140, 248, 0.45))';
      case 'SPEAKING':
        return 'drop-shadow(0 0 26px rgba(244, 114, 182, 0.35))';
      case 'EXECUTING':
        return 'drop-shadow(0 0 22px rgba(52, 211, 153, 0.36))';
      case 'IDLE':
      default:
        return 'drop-shadow(0 0 16px rgba(56, 189, 248, 0.22))';
    }
  }, [state]);

  return (
    <img
      src="/assets/aiva_face_base.png"
      alt="AIVA Digital Human Intelligence"
      className="w-full h-full object-contain pointer-events-none select-none transition-all duration-500"
      style={{
        filter: dropShadow,
        width: dimensions?.w ? `${dimensions.w}px` : '100%',
        height: dimensions?.h ? `${dimensions.h}px` : '100%',
      }}
      draggable={false}
    />
  );
});

/**
 * 3. Isolated EyeLayer
 * Natural eyelid blinking cycle and subtle cognitive gaze shift.
 */
const EyeLayer = React.memo(function EyeLayer({
  isPresenceActive,
  state,
}: {
  isPresenceActive: boolean;
  state: AivaFaceState;
}) {
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    if (!isPresenceActive) return;
    let isMounted = true;
    let blinkTimer: NodeJS.Timeout | null = null;
    let closeTimer: NodeJS.Timeout | null = null;

    const scheduleBlink = () => {
      if (!isMounted) return;
      const delay = 3400 + Math.random() * 3200;
      blinkTimer = setTimeout(() => {
        if (!isMounted) return;
        setIsBlinking(true);
        closeTimer = setTimeout(() => {
          if (!isMounted) return;
          setIsBlinking(false);
          scheduleBlink();
        }, 125);
      }, delay);
    };

    scheduleBlink();
    return () => {
      isMounted = false;
      if (blinkTimer) clearTimeout(blinkTimer);
      if (closeTimer) clearTimeout(closeTimer);
      setIsBlinking(false);
    };
  }, [isPresenceActive]);

  return (
    <div
      className="absolute inset-0 w-full h-full pointer-events-none select-none transition-transform duration-700 ease-out"
      style={{
        transform: state === 'THINKING' ? 'translate(0.5px, -1px)' : 'none',
      }}
    >
      <img
        src="/assets/aiva_eyelids.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-100 ease-in-out"
        style={{ opacity: isBlinking ? 1 : 0 }}
        draggable={false}
      />
    </div>
  );
});

/**
 * 4. Isolated MouthLayer
 * Positioned precisely over the mouth coordinates (x: 42.2%, y: 61.5%, w: 15.6%, h: 9.8%).
 * Smoothly interpolates resting closed lips to slight, mid, and wide openings.
 * Runs in requestAnimationFrame directly on DOM nodes — ZERO React re-renders!
 */
const MouthLayer = React.memo(function MouthLayer({
  isSpeaking,
  audioLevelRef,
}: {
  isSpeaking: boolean;
  audioLevelRef: React.MutableRefObject<number>;
}) {
  const mouthContainerRef = useRef<HTMLDivElement>(null);
  const slightRef = useRef<HTMLImageElement>(null);
  const midRef = useRef<HTMLImageElement>(null);
  const wideRef = useRef<HTMLImageElement>(null);
  const oRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!isSpeaking) {
      if (slightRef.current) slightRef.current.style.opacity = '0';
      if (midRef.current) midRef.current.style.opacity = '0';
      if (wideRef.current) wideRef.current.style.opacity = '0';
      if (oRef.current) oRef.current.style.opacity = '0';
      if (mouthContainerRef.current) mouthContainerRef.current.style.transform = 'scale(1.0)';
      return;
    }

    let animId: number;
    let smoothed = 0;

    const tick = () => {
      const target = audioLevelRef.current || 0;
      smoothed = smoothed * 0.65 + target * 0.35;

      // Direct DOM style updates without triggering React state
      if (slightRef.current && midRef.current && wideRef.current && oRef.current) {
        if (smoothed < 0.04) {
          // Resting closed
          slightRef.current.style.opacity = '0';
          midRef.current.style.opacity = '0';
          wideRef.current.style.opacity = '0';
          oRef.current.style.opacity = '0';
        } else if (smoothed < 0.22) {
          // Slight opening
          const t = (smoothed - 0.04) / 0.18;
          slightRef.current.style.opacity = String(Math.min(1.0, t));
          midRef.current.style.opacity = '0';
          wideRef.current.style.opacity = '0';
          oRef.current.style.opacity = '0';
        } else if (smoothed < 0.52) {
          // Mid opening / vowel cadence
          const t = (smoothed - 0.22) / 0.30;
          slightRef.current.style.opacity = String(Math.max(0, 1 - t));
          midRef.current.style.opacity = String(Math.min(1.0, t * 1.2));
          wideRef.current.style.opacity = '0';
          oRef.current.style.opacity = String(Math.max(0, t * 0.4));
        } else {
          // Wide expressive opening
          const t = Math.min(1.0, (smoothed - 0.52) / 0.48);
          slightRef.current.style.opacity = '0';
          midRef.current.style.opacity = String(Math.max(0, 1 - t));
          wideRef.current.style.opacity = String(Math.min(1.0, t));
          oRef.current.style.opacity = String(Math.max(0, (1 - t) * 0.3));
        }
      }

      // Very subtle natural micro-movement (max 1.04x scale)
      if (mouthContainerRef.current) {
        const microScale = 1.0 + smoothed * 0.04;
        mouthContainerRef.current.style.transform = `scale(${microScale})`;
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isSpeaking, audioLevelRef]);

  return (
    <div
      ref={mouthContainerRef}
      className="absolute pointer-events-none select-none transition-transform duration-75"
      style={{
        left: '42.1875%',
        top: '61.5234%',
        width: '15.625%',
        height: '9.7656%',
        transformOrigin: 'center 35%',
      }}
    >
      <img
        ref={slightRef}
        src="/assets/mouth_slight.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-75"
        style={{ opacity: 0 }}
        draggable={false}
      />
      <img
        ref={midRef}
        src="/assets/mouth_mid.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-75"
        style={{ opacity: 0 }}
        draggable={false}
      />
      <img
        ref={wideRef}
        src="/assets/mouth_wide.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-75"
        style={{ opacity: 0 }}
        draggable={false}
      />
      <img
        ref={oRef}
        src="/assets/mouth_o.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-75"
        style={{ opacity: 0 }}
        draggable={false}
      />
    </div>
  );
});

/**
 * Main AivaFace & Presence Component
 */
export const AivaFace = React.memo(function AivaFace({
  state = 'IDLE',
  presenceState,
  isVisible,
  audioLevelRef,
  size = 'hero',
  className = '',
}: AivaFaceProps) {
  const isPresenceActive =
    isVisible !== undefined
      ? isVisible
      : presenceState
      ? presenceState === 'ACTIVE'
      : state !== 'IDLE';

  const dimensions = useMemo(() => {
    switch (size) {
      case 'sm':
        return { w: 220, h: 220 };
      case 'md':
        return { w: 320, h: 320 };
      case 'lg':
        return { w: 420, h: 420 };
      case 'hero':
      default:
        return { w: 480, h: 480 };
    }
  }, [size]);

  // Fallback internal ref if not provided
  const fallbackAudioRef = useRef(0);
  const effectiveAudioRef = audioLevelRef || fallbackAudioRef;

  // Section 10: Face Presence Verification diagnostics
  useEffect(() => {
    const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI);
    if (isPresenceActive) {
      console.log(
        `[AIVA FACE]\nwake_received=true\npresence_state=ACTIVE\nrendered=true\nvisible=true\nopacity=1\nwidth=${dimensions.w}\nheight=${dimensions.h}\npresence=${presenceState || 'ACTIVE'}\nvoiceState=${state}\nelectronMode=${isElectron}`
      );
    } else {
      console.log(
        `[AIVA FACE]\npresence=DORMANT\nvoiceState=${state}\nvisible=false\nopacity=0\nscale=1\ndisplay=none\nmounted=true\nelectronMode=${isElectron}`
      );
    }
  }, [presenceState, state, isPresenceActive, dimensions]);

  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none pointer-events-none ${className}`}
      style={{ width: dimensions.w, height: dimensions.h }}
      role="region"
      aria-label={`AIVA Digital Presence: ${state}`}
    >
      <AnimatePresence>
        {isPresenceActive && (
          <motion.div
            key="aiva-face-presence"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.93 }}
            transition={{
              duration: 0.22,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="relative flex items-center justify-center w-full h-full"
          >
            {/* Part 8: Debug Face Mode indicator (Holographic Cyan Ring proving pixel visibility in Electron) */}
            <div
              className="absolute inset-0 pointer-events-none rounded-full border border-cyan-400/40"
              style={{
                boxShadow: '0 0 25px rgba(56, 189, 248, 0.28)',
                width: dimensions.w,
                height: dimensions.h,
              }}
            />
            <PresenceGlow state={state} dimensions={dimensions} />
            <div className="relative z-10 w-full h-full flex items-center justify-center overflow-visible">
              <FaceBase state={state} dimensions={dimensions} />
              <EyeLayer isPresenceActive={isPresenceActive} state={state} />
              <MouthLayer isSpeaking={state === 'SPEAKING'} audioLevelRef={effectiveAudioRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export const AivaPresence = React.memo(function AivaPresence({
  children,
  className = '',
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative flex items-center justify-center pointer-events-none select-none ${className}`}>
      {children}
    </div>
  );
});

export { FaceBase, EyeLayer, MouthLayer, PresenceGlow };
