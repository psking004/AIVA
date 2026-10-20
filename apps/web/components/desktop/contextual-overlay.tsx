/**
 * AIVA Contextual Overlay Shell
 *
 * Houses summoned operational lenses above the desktop wallpaper.
 * Preserves all existing functionality inside the lens.
 * Can be dismissed with the Close button or voice command ("AIVA, close").
 */

'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic } from 'lucide-react';
import { OverlayLens } from '../../hooks/use-aiva-voice';

interface ContextualOverlayProps {
  overlayType: OverlayLens;
  onClose: () => void;
  children: React.ReactNode;
}

export function ContextualOverlay({ overlayType, onClose, children }: ContextualOverlayProps) {
  if (!overlayType) return null;

  const titles: Record<string, string> = {
    tasks: 'TASK PROTOCOLS',
    projects: 'INITIATIVE MATRIX',
    memory: 'MEMORY ARCHIVE',
    timeline: 'TEMPORAL COORDINATES',
    files: 'DATA STORAGE',
    dialogue: 'EXECUTIVE DIALOGUE',
    voice: 'ACOUSTIC VOICE CHAMBER',
    nexus: 'NEXUS OVERVIEW',
  };

  const title = titles[overlayType] || 'AIVA HORIZON';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 md:p-8 backdrop-blur-md bg-black/40">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="relative w-full max-w-5xl h-[88vh] max-h-[850px] aiva-panel-elevated aiva-border rounded-3xl overflow-hidden shadow-2xl flex flex-col"
        >
          {/* Overlay Navigation / Dismiss Bar */}
          <div className="h-14 px-6 aiva-border-b flex items-center justify-between bg-obsidian-900/80">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-cyan-glow animate-pulse" />
              <h2 className="font-telemetry text-xs font-bold tracking-widest text-on-surface uppercase">
                {title}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full aiva-panel border border-white/5 text-[10px] font-telemetry text-on-dim">
                <Mic size={11} className="text-cyan-glow" />
                <span>Say "AIVA, close" to dismiss</span>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-xl aiva-border hover:bg-white/10 text-on-dim hover:text-on-surface transition-colors"
                title="Dismiss overlay"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Child Lens Component Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {children}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
