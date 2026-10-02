/**
 * AIVA Header - Futuristic Top Navigation Bar
 * Glass panel with system status and monitoring indicators
 */

'use client';

import { useState } from 'react';

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
}

export function Header({ title, onMenuClick }: HeaderProps) {
  const [cpuUsage] = useState(12);
  const [memUsage] = useState(4.2);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-zinc-950/40 backdrop-blur-md border-b border-white/10 shadow-[0_0_20px_rgba(0,122,255,0.05)]">
      <div className="h-full px-4 md:px-8 flex items-center justify-between gap-4">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          {/* Mobile Menu Button */}
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-blue-400">menu</span>
          </button>

          {/* Bolt Icon & Title */}
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-blue-500 cursor-pointer hover:scale-110 transition-transform active:scale-95">
              bolt
            </span>
            <h1 className="font-headline uppercase tracking-widest text-[10px] md:text-xs font-bold text-blue-500 hidden sm:block">
              {title === 'dashboard' ? 'AIVA OS' : title}
            </h1>
          </div>
        </div>

        {/* Center - Search Bar (Desktop) */}
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <div className="relative w-full group">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-zinc-500 text-sm">search</span>
            </div>
            <input
              type="text"
              placeholder="Search protocols..."
              className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl
                         text-sm text-zinc-200 placeholder:text-zinc-600
                         focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
                         transition-all duration-300"
            />
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-4 md:gap-6">
          {/* System Status Pill */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 rounded-full border border-blue-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shadow-[0_0_8px_rgba(96,165,250,1)]" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400">
              Core: Optimal
            </span>
          </div>

          {/* CPU/Memory Stats */}
          <div className="hidden lg:flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-zinc-500 text-sm">memory</span>
              <span className="font-code-sm text-[10px] text-blue-400">CPU: {cpuUsage}%</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-zinc-500 text-sm">storage</span>
              <span className="font-code-sm text-[10px] text-zinc-500">MEM: {memUsage}GB</span>
            </div>
          </div>

          {/* Monitoring Button */}
          <button className="p-2 hover:bg-white/5 rounded-lg transition-colors group">
            <span className="material-symbols-outlined text-zinc-500 group-hover:text-blue-300 transition-colors">
              monitoring
            </span>
          </button>

          {/* Notifications */}
          <button className="relative p-2 hover:bg-white/5 rounded-lg transition-colors group">
            <span className="material-symbols-outlined text-zinc-500 group-hover:text-blue-300 transition-colors">
              notifications
            </span>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
          </button>

          {/* User Avatar */}
          <button className="hidden sm:flex items-center gap-2 p-1.5 pr-3 hover:bg-white/5 rounded-full transition-colors border border-white/10">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                person
              </span>
            </div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">User</span>
          </button>
        </div>
      </div>
    </header>
  );
}
