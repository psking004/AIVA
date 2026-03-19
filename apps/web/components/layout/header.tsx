/**
 * Header - Top navigation bar
 */

'use client';

import { Menu, Bell, Search, User } from 'lucide-react';

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
}

export function Header({ title, onMenuClick }: HeaderProps) {
  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 gap-4">
      {/* Menu button (mobile) */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Title */}
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h1>

      {/* Search bar */}
      <div className="flex-1 max-w-md ml-8 hidden md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search anything..."
            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-2">
        <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
          <User className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
