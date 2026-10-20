/**
 * AIVA Kinetic Resonant Core
 * Central Autonomous Personal AI Operating System Nucleus
 *
 * Geometric, multi-layered SVG/CSS resonant structure.
 * States: IDLE, LISTENING, THINKING, EXECUTING, SPEAKING.
 * Truthful status readout only — no fabricated chain-of-thought.
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';

export type AivaCoreState = 'IDLE' | 'LISTENING' | 'THINKING' | 'EXECUTING' | 'SPEAKING';

interface AivaCoreProps {
  state?: AivaCoreState;
  statusText?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  audioLevel?: number; // 0 to 1 for live audio reactivity
  onClick?: () => void;
  className?: string;
}

export function AivaCore({
  state = 'IDLE',
  statusText,
  size = 'hero',
  audioLevel = 0,
  onClick,
  className = '',
}: AivaCoreProps) {
  // Dimension definitions
  const dimensions = {
    sm: { width: 48, height: 48, radius: 20 },
    md: { width: 96, height: 96, radius: 42 },
    lg: { width: 160, height: 160, radius: 72 },
    hero: { width: 240, height: 240, radius: 108 },
  }[size];

  // Dynamic glow and color accents based on truthful state
  const stateColor = {
    IDLE: {
      primary: '#818CF8', // Hyper Violet
      secondary: '#6366F1',
      accent: '#38BDF8', // Cyan highlight
      glow: 'rgba(129, 140, 248, 0.25)',
      label: 'STANDBY',
    },
    LISTENING: {
      primary: '#38BDF8', // Neural Cyan
      secondary: '#0284C7',
      accent: '#818CF8',
      glow: 'rgba(56, 189, 248, 0.45)',
      label: 'PERCEIVING',
    },
    THINKING: {
      primary: '#38BDF8',
      secondary: '#818CF8',
      accent: '#34D399',
      glow: 'rgba(56, 189, 248, 0.4)',
      label: 'SYNTHESIZING',
    },
    EXECUTING: {
      primary: '#34D399', // Emerald Pulse
      secondary: '#10B981',
      accent: '#38BDF8',
      glow: 'rgba(52, 211, 153, 0.45)',
      label: 'DISPATCHING',
    },
    SPEAKING: {
      primary: '#38BDF8',
      secondary: '#818CF8',
      accent: '#F59E0B',
      glow: 'rgba(56, 189, 248, 0.4)',
      label: 'RESONATING',
    },
  }[state];

  // Dynamic audio responsive scale multiplier
  const responsiveScale = state === 'LISTENING' ? 1 + audioLevel * 0.25 : 1;

  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center select-none ${
        onClick ? 'cursor-pointer group' : ''
      } ${className}`}
      role="region"
      aria-label={`AIVA Core: ${statusText || stateColor.label}`}
    >
      {/* Outer Ambient Resonant Field */}
      <div
        className="absolute rounded-full pointer-events-none transition-all duration-700 ease-out"
        style={{
          width: dimensions.width * 1.5,
          height: dimensions.height * 1.5,
          background: `radial-gradient(circle, ${stateColor.glow} 0%, transparent 70%)`,
          filter: 'blur(30px)',
          transform: `scale(${responsiveScale})`,
        }}
      />

      {/* SVG Kinetic Geometric Nucleus */}
      <motion.div
        className="relative flex items-center justify-center"
        animate={{
          scale:
            state === 'SPEAKING'
              ? [1, 1.04, 1, 1.03, 1]
              : state === 'IDLE'
              ? [1, 1.02, 1]
              : responsiveScale,
        }}
        transition={{
          repeat: Infinity,
          duration: state === 'SPEAKING' ? 1.6 : state === 'IDLE' ? 4 : 0.8,
          ease: 'easeInOut',
        }}
        style={{ width: dimensions.width, height: dimensions.height }}
      >
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full overflow-visible"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Layer 1: Outermost Orbital Telemetry Ring with Precision Micro-Notches */}
          <g
            className={`${
              state === 'THINKING' ? 'animate-spin' : 'animate-orbital-slow'
            } origin-center`}
            style={{
              animationDuration: state === 'THINKING' ? '8s' : '28s',
            }}
          >
            <circle
              cx="100"
              cy="100"
              r="92"
              stroke={stateColor.primary}
              strokeOpacity="0.25"
              strokeWidth="1"
              strokeDasharray="4 8"
            />
            {/* Calibration nodes on the orbital perimeter */}
            <circle cx="100" cy="8" r="2.5" fill={stateColor.primary} fillOpacity="0.8" />
            <circle cx="192" cy="100" r="2" fill={stateColor.primary} fillOpacity="0.5" />
            <circle cx="100" cy="192" r="2.5" fill={stateColor.primary} fillOpacity="0.8" />
            <circle cx="8" cy="100" r="2" fill={stateColor.primary} fillOpacity="0.5" />
          </g>

          {/* Layer 2: Counter-Rotating Segmented Crystalline Prism Ring */}
          <g
            className={`${
              state === 'THINKING' ? 'animate-spin' : 'animate-orbital-reverse'
            } origin-center`}
            style={{
              animationDuration: state === 'THINKING' ? '12s' : '36s',
            }}
          >
            <circle
              cx="100"
              cy="100"
              r="76"
              stroke={stateColor.secondary}
              strokeOpacity="0.35"
              strokeWidth="1.5"
              strokeDasharray="24 16 8 16"
            />
            {/* Geometric vector crosshairs */}
            <path
              d="M100 24 L100 32 M100 168 L100 176 M24 100 L32 100 M168 100 L176 100"
              stroke={stateColor.accent}
              strokeWidth="1.5"
              strokeOpacity="0.6"
            />
          </g>

          {/* Layer 3: Reactive Hexagonal & Diamond Vector Cage */}
          <g className="origin-center">
            {/* Isometric diamond facet */}
            <polygon
              points="100,44 146,100 100,156 54,100"
              stroke={stateColor.primary}
              strokeWidth={state === 'LISTENING' ? '2' : '1.2'}
              strokeOpacity={state === 'LISTENING' ? '0.7' : '0.4'}
              fill={stateColor.primary}
              fillOpacity="0.03"
            />
            {/* Secondary offset polygon for crystalline refraction */}
            <polygon
              points="100,52 138,100 100,148 62,100"
              stroke={stateColor.accent}
              strokeWidth="1"
              strokeOpacity="0.3"
              strokeDasharray="6 6"
            />
          </g>

          {/* Layer 4: Action Dispatch Conduits (Visible in EXECUTING state) */}
          {state === 'EXECUTING' && (
            <g className="animate-pulse">
              <line x1="100" y1="100" x2="190" y2="40" stroke="#34D399" strokeWidth="2" strokeDasharray="3 3" />
              <line x1="100" y1="100" x2="10" y2="160" stroke="#34D399" strokeWidth="2" strokeDasharray="3 3" />
              <line x1="100" y1="100" x2="190" y2="160" stroke="#34D399" strokeWidth="2" strokeDasharray="3 3" />
            </g>
          )}

          {/* Layer 5: Acoustic Frequency Reactive Waves (Visible in LISTENING state) */}
          {state === 'LISTENING' && (
            <g>
              <circle
                cx="100"
                cy="100"
                r={58 + audioLevel * 14}
                stroke="#38BDF8"
                strokeWidth="1.5"
                strokeOpacity="0.6"
              />
              <circle
                cx="100"
                cy="100"
                r={44 + audioLevel * 20}
                stroke="#818CF8"
                strokeWidth="1"
                strokeOpacity="0.4"
                strokeDasharray="4 4"
              />
            </g>
          )}

          {/* Layer 6: Inner Quantum Node (Central Focal Locus) */}
          <circle
            cx="100"
            cy="100"
            r="28"
            fill={`url(#coreGradient-${size})`}
            filter={`url(#coreGlow-${size})`}
          />
          <circle cx="100" cy="100" r="14" fill="#FFFFFF" fillOpacity="0.85" />

          {/* Gradients and Filters */}
          <defs>
            <radialGradient id={`coreGradient-${size}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
              <stop offset="40%" stopColor={stateColor.primary} stopOpacity="0.8" />
              <stop offset="100%" stopColor={stateColor.secondary} stopOpacity="0.2" />
            </radialGradient>
            <filter id={`coreGlow-${size}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
        </svg>
      </motion.div>

      {/* Truthful Telemetry / Status Pill */}
      {size !== 'sm' && (
        <div className="mt-4 flex flex-col items-center gap-1.5 z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full aiva-panel aiva-border text-xs">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: stateColor.primary,
                boxShadow: `0 0 8px ${stateColor.primary}`,
              }}
            />
            <span className="font-telemetry text-[11px] font-medium tracking-widest text-on-surface uppercase">
              AIVA: {stateColor.label}
            </span>
          </div>

          {statusText && (
            <p className="font-body text-xs text-on-muted max-w-xs text-center truncate">
              {statusText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
