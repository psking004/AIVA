/**
 * AIVA Omni-Modal Conduit
 * Primary Operating System Command Surface
 *
 * Supports executive directives, voice invocation, file ingestion,
 * and immediate operational action dispatches.
 */

'use client';

import React, { useState, useRef } from 'react';
import {
  Mic,
  ArrowUpRight,
  Paperclip,
  CheckCircle2,
  FolderGit2,
  CalendarPlus,
  BookOpen,
} from 'lucide-react';

interface OmniConduitProps {
  onSubmitCommand: (command: string) => void;
  onVoiceTrigger?: () => void;
  onQuickAction?: (actionType: 'task' | 'project' | 'memory' | 'calendar') => void;
  onFileSelect?: (file: File) => void;
  placeholder?: string;
  isProcessing?: boolean;
  className?: string;
}

export function OmniConduit({
  onSubmitCommand,
  onVoiceTrigger,
  onQuickAction,
  onFileSelect,
  placeholder = 'Transmit directive or query to AIVA OS...',
  isProcessing = false,
  className = '',
}: OmniConduitProps) {
  const [input, setInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query || isProcessing) return;
    onSubmitCommand(query);
    setInput('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onFileSelect) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload document to AIVA"
      />

      {/* Main Command Conduit Housing */}
      <form
        onSubmit={handleSubmit}
        className="relative aiva-panel aiva-border rounded-2xl p-2.5 transition-all duration-300 focus-within:aiva-panel-glow-cyan focus-within:border-cyan-glow/50"
      >
        <div className="flex items-center gap-2">
          {/* File Attachment / Context Injection */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-on-dim hover:text-cyan-glow hover:bg-white/5 rounded-xl transition-colors"
            title="Ingest document into memory"
            aria-label="Ingest document"
          >
            <Paperclip size={18} />
          </button>

          {/* Primary Directive Input Field */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            placeholder={isProcessing ? 'AIVA is executing...' : placeholder}
            className="flex-1 bg-transparent border-none text-on-surface text-sm placeholder:text-on-dim focus:outline-none focus:ring-0 font-body py-1.5"
          />

          {/* Right Action Cluster */}
          <div className="flex items-center gap-1.5 pr-1">
            {/* Direct Voice Activation */}
            {onVoiceTrigger && (
              <button
                type="button"
                onClick={onVoiceTrigger}
                className="p-2 text-on-dim hover:text-violet-glow hover:bg-violet-glow/10 rounded-xl transition-all"
                title="Enter Acoustic Voice Chamber"
                aria-label="Activate Voice"
              >
                <Mic size={18} />
              </button>
            )}

            {/* Execute Directive Button */}
            <button
              type="submit"
              disabled={!input.trim() || isProcessing}
              className={`
                flex items-center justify-center w-9 h-9 rounded-xl font-bold transition-all duration-200
                ${
                  input.trim() && !isProcessing
                    ? 'bg-cyan-glow text-obsidian-950 shadow-aiva-cyan hover:bg-cyan-glow/90 active:scale-95'
                    : 'bg-white/5 text-on-dim cursor-not-allowed opacity-50'
                }
              `}
              aria-label="Submit Directive"
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
        </div>

        {/* Quick Action Protocol Ribbons */}
        {onQuickAction && (
          <div className="mt-2.5 pt-2 border-t border-white/5 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-telemetry uppercase tracking-wider text-on-dim mr-1">
              Protocols:
            </span>

            <button
              type="button"
              onClick={() => onQuickAction('task')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md aiva-border text-[11px] font-telemetry text-on-muted hover:text-cyan-glow hover:border-cyan-glow/40 transition-colors"
            >
              <CheckCircle2 size={12} className="text-cyan-glow" />
              <span>+ Task Protocol</span>
            </button>

            <button
              type="button"
              onClick={() => onQuickAction('project')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md aiva-border text-[11px] font-telemetry text-on-muted hover:text-violet-glow hover:border-violet-glow/40 transition-colors"
            >
              <FolderGit2 size={12} className="text-violet-glow" />
              <span>+ Initiative</span>
            </button>

            <button
              type="button"
              onClick={() => onQuickAction('memory')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md aiva-border text-[11px] font-telemetry text-on-muted hover:text-emerald-pulse hover:border-emerald-pulse/40 transition-colors"
            >
              <BookOpen size={12} className="text-emerald-pulse" />
              <span>+ Memory</span>
            </button>

            <button
              type="button"
              onClick={() => onQuickAction('calendar')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md aiva-border text-[11px] font-telemetry text-on-muted hover:text-amber-solar hover:border-amber-solar/40 transition-colors"
            >
              <CalendarPlus size={12} className="text-amber-solar" />
              <span>+ Horizon</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
