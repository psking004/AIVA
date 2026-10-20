/**
 * AIVA OS Lens Navigation
 * Architectural control layer for switching operational environments within AIVA.
 *
 * Primary Lenses:
 * - NEXUS (System Core / Unified Horizon)
 * - DIALOGUE (Executive Briefing & Chat)
 * - VOICE (Acoustic Resonance Chamber)
 * - TASKS (Task Protocols)
 * - PROJECTS (Initiative Matrix)
 * - MEMORY (Memory Archive)
 * - TIMELINE (Temporal Coordinates / Calendar)
 * - FILES (Data Storage)
 */

'use client';

import React from 'react';
import {
  LayoutGrid,
  MessageSquareCode,
  Mic2,
  CheckSquare,
  Network,
  Brain,
  CalendarDays,
  FolderLock,
  Activity,
  ShieldCheck,
  LucideIcon,
} from 'lucide-react';

export type AivaLensId =
  | 'nexus'
  | 'dialogue'
  | 'voice'
  | 'tasks'
  | 'projects'
  | 'memory'
  | 'timeline'
  | 'files';

interface LensItem {
  id: AivaLensId;
  label: string;
  badgeLabel?: string;
  icon: LucideIcon;
}

const LENSES: LensItem[] = [
  { id: 'nexus', label: 'NEXUS', icon: LayoutGrid },
  { id: 'dialogue', label: 'DIALOGUE', icon: MessageSquareCode },
  { id: 'voice', label: 'VOICE', icon: Mic2 },
  { id: 'tasks', label: 'TASKS', icon: CheckSquare },
  { id: 'projects', label: 'PROJECTS', icon: Network },
  { id: 'memory', label: 'MEMORY', icon: Brain },
  { id: 'timeline', label: 'TIMELINE', icon: CalendarDays },
  { id: 'files', label: 'FILES', icon: FolderLock },
];

interface LensNavigationProps {
  activeLens: AivaLensId;
  onLensChange: (lens: AivaLensId) => void;
  systemHealth?: 'optimal' | 'standby' | 'error';
}

export function LensNavigation({
  activeLens,
  onLensChange,
  systemHealth = 'optimal',
}: LensNavigationProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 aiva-panel border-b border-white/5 px-4 md:px-8 flex items-center justify-between">
      {/* Brand Identity / Core State */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onLensChange('nexus')}
          className="flex items-center gap-2.5 focus:outline-none group text-left"
          title="Return to Nexus Home"
        >
          <div className="w-8 h-8 rounded-lg aiva-panel flex items-center justify-center border border-cyan-glow/30 group-hover:border-cyan-glow/60 transition-all">
            <span className="w-2 h-2 rounded-full bg-cyan-glow animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-telemetry text-sm font-bold tracking-wider text-on-surface">
                AIVA
              </span>
              <span className="text-[10px] font-telemetry tracking-widest text-cyan-glow uppercase bg-cyan-glow/10 px-1.5 py-0.2 rounded border border-cyan-glow/20">
                OS
              </span>
            </div>
            <p className="text-[9px] font-telemetry text-on-dim uppercase tracking-wider">
              Autonomous Intelligence
            </p>
          </div>
        </button>
      </div>

      {/* Central OS Lens Dock (Desktop / Tablet) */}
      <nav
        aria-label="AIVA OS Lenses"
        className="hidden md:flex items-center gap-1 p-1 rounded-xl aiva-panel aiva-border"
      >
        {LENSES.map((lens) => {
          const Icon = lens.icon;
          const isActive = activeLens === lens.id;

          return (
            <button
              key={lens.id}
              onClick={() => onLensChange(lens.id)}
              className={`
                relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg
                text-xs font-telemetry tracking-wider transition-all duration-200
                ${
                  isActive
                    ? 'text-cyan-glow bg-cyan-glow/10 aiva-border-cyan font-semibold shadow-aiva-subtle'
                    : 'text-on-muted hover:text-on-surface hover:bg-white/5 border border-transparent'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={14} className={isActive ? 'text-cyan-glow' : 'text-on-dim'} />
              <span>{lens.label}</span>

              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-cyan-glow" />
              )}
            </button>
          );
        })}
      </nav>

      {/* System Status / Health Verification */}
      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full aiva-panel aiva-border text-xs">
          <Activity size={12} className={systemHealth === 'optimal' ? 'text-emerald-pulse' : 'text-amber-solar'} />
          <span className="font-telemetry text-[10px] text-on-muted uppercase tracking-wider">
            Kernel: {systemHealth === 'optimal' ? 'Synchronized' : 'Standby'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full aiva-panel aiva-border text-xs text-on-dim" title="Security Enclave Active">
          <ShieldCheck size={13} className="text-cyan-glow" />
          <span className="font-telemetry text-[10px] hidden sm:inline tracking-wider">Enclave</span>
        </div>
      </div>

      {/* Mobile Lens Scroller (Shown on mobile screens) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 aiva-panel-elevated border-t border-white/10 px-2 py-2 flex items-center justify-around pb-safe">
        {LENSES.map((lens) => {
          const Icon = lens.icon;
          const isActive = activeLens === lens.id;
          return (
            <button
              key={lens.id}
              onClick={() => onLensChange(lens.id)}
              className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition-colors ${
                isActive ? 'text-cyan-glow' : 'text-on-dim'
              }`}
              title={lens.label}
            >
              <Icon size={18} />
              <span className="text-[8px] font-telemetry tracking-tighter mt-0.5">
                {lens.label}
              </span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
