/**
 * Sidebar - Main navigation sidebar
 */

'use client';

import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  MessageSquare,
  CheckSquare,
  FileText,
  Folder,
  Calendar,
  Zap,
  Settings,
  X,
  Sparkles,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
}

const navItems = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'tasks', icon: CheckSquare, label: 'Tasks' },
  { id: 'notes', icon: FileText, label: 'Notes' },
  { id: 'files', icon: Folder, label: 'Files' },
  { id: 'calendar', icon: Calendar, label: 'Calendar' },
  { id: 'automation', icon: Zap, label: 'Automation' },
];

export function Sidebar({ isOpen, onClose, activeView, onViewChange }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          x: isOpen ? 0 : '-100%',
          width: isOpen ? 260 : 0,
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`
          fixed lg:relative z-50 h-full
          bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
          flex flex-col
          lg:translate-x-0 lg:static
        `}
      >
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-gray-200 dark:border-gray-800">
          <Sparkles className="w-6 h-6 text-blue-500" />
          <span className="font-semibold text-lg">AIVA</span>
          <button
            onClick={onClose}
            className="ml-auto lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onViewChange(item.id);
                onClose();
              }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                transition-colors
                ${
                  activeView === item.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }
              `}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Settings at bottom */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={() => {
              onViewChange('settings');
              onClose();
            }}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
              transition-colors
              ${
                activeView === 'settings'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }
            `}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Settings</span>
          </button>
        </div>
      </motion.aside>
    </>
  );
}
