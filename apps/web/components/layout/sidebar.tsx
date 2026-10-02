/**
 * AIVA Sidebar - Futuristic Navigation Drawer
 * Glass panel design with neon accents and system status
 */

'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
}

interface NavItem {
  id: string;
  icon: string;
  label: string;
  iconFill?: boolean;
}

const navItems: NavItem[] = [
  { id: 'dashboard', icon: 'grid_view', label: 'System Core' },
  { id: 'vocal', icon: 'mic', label: 'Vocal Interface' },
  { id: 'chat', icon: 'forum', label: 'Neural Chat' },
  { id: 'projects', icon: 'account_tree', label: 'Project Protocols' },
  { id: 'tasks', icon: 'checklist', label: 'Task Protocols' },
  { id: 'notes', icon: 'description', label: 'Memory Archive' },
  { id: 'files', icon: 'folder', label: 'Data Storage' },
  { id: 'calendar', icon: 'calendar_month', label: 'Timeline' },
  { id: 'automation', icon: 'auto_awesome', label: 'Automation' },
];

export function Sidebar({ isOpen, onClose, activeView, onViewChange }: SidebarProps) {
  const [memoryLoad] = useState(42);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Navigation Drawer */}
      <motion.aside
        initial={false}
        animate={{
          x: isOpen ? 0 : '-100%',
          width: isOpen ? 288 : 0,
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`
          fixed lg:relative z-50 h-full
          bg-zinc-950/60 backdrop-blur-2xl
          border-r border-white/5 shadow-2xl
          flex flex-col
          lg:translate-x-0 lg:static lg:w-72
        `}
      >
        {/* Logo Section */}
        <div className="p-8 pt-24 border-b border-white/5 pb-6">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-900 flex items-center justify-center neon-glow-blue">
              <span className="material-symbols-outlined text-white text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                smart_toy
              </span>
            </div>
            <div>
              <h3 className="font-headline text-[18px] text-blue-400 font-bold tracking-tight">AIVA v2.4</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">System: Optimal</span>
              </div>
            </div>
          </div>

          {/* System Status */}
          <div className="flex gap-4 mb-4">
            <div className="flex-1 glass-panel p-3 rounded-xl">
              <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-bold">CPU</p>
              <p className="text-sm text-blue-400 font-mono">12%</p>
            </div>
            <div className="flex-1 glass-panel p-3 rounded-xl">
              <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-bold">Memory</p>
              <p className="text-sm text-purple-400 font-mono">4.2GB</p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onViewChange(item.id);
                onClose();
              }}
              className={`
                w-full flex items-center gap-4 py-3 px-6 rounded-lg
                transition-all duration-300 ease-out
                font-headline text-sm tracking-tight
                ${
                  activeView === item.id
                    ? 'text-blue-400 bg-blue-500/10 border-l-2 border-blue-500'
                    : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200 border-l-2 border-transparent'
                }
              `}
            >
              <span
                className="material-symbols-outlined text-lg"
                style={{ fontVariationSettings: item.iconFill ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Settings & Memory */}
        <div className="p-6 border-t border-white/5">
          {/* Memory Load Indicator */}
          <div className="glass-panel p-4 rounded-xl border border-white/5 mb-4">
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2 font-bold">Memory Load</p>
            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${memoryLoad}%` }}
              />
            </div>
            <p className="text-[10px] text-zinc-500 mt-2 text-right">{memoryLoad}% utilized</p>
          </div>

          {/* Settings Button */}
          <button
            onClick={() => {
              onViewChange('settings');
              onClose();
            }}
            className={`
              w-full flex items-center gap-4 py-3 px-6 rounded-lg
              transition-all duration-300 ease-out
              font-headline text-sm tracking-tight
              ${
                activeView === 'settings'
                  ? 'text-blue-400 bg-blue-500/10 border-l-2 border-blue-500'
                  : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200 border-l-2 border-transparent'
              }
            `}
          >
            <span className="material-symbols-outlined text-lg">settings</span>
            <span>System Settings</span>
          </button>
        </div>
      </motion.aside>
    </>
  );
}
