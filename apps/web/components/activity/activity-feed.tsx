/**
 * AIVA ActivityFeed - Recent Activity Display
 * Glass panel design with animated icons
 */

'use client';

import { motion } from 'framer-motion';

interface Activity {
  id: string;
  type: 'task' | 'note' | 'message' | 'event' | 'automation';
  title: string;
  time: string;
}

const recentActivity: Activity[] = [
  { id: '1', type: 'task', title: 'Completed "Review Q1 report"', time: '2 min ago' },
  { id: '2', type: 'note', title: 'Created note "Meeting notes"', time: '15 min ago' },
  { id: '3', type: 'message', title: 'Neural chat session', time: '1 hour ago' },
  { id: '4', type: 'event', title: 'Team sync at 10:00 AM', time: '2 hours ago' },
  { id: '5', type: 'automation', title: 'Daily Summary triggered', time: '3 hours ago' },
];

const typeConfig: Record<string, { icon: string; color: string; bg: string }> = {
  task: { icon: 'checklist', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  note: { icon: 'description', color: 'text-green-400', bg: 'bg-green-500/10' },
  message: { icon: 'forum', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  event: { icon: 'calendar_today', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  automation: { icon: 'auto_awesome', color: 'text-pink-400', bg: 'bg-pink-500/10' },
};

export function ActivityFeed() {
  return (
    <div className="glass-panel rounded-2xl border border-white/10 h-full">
      {/* Header */}
      <div className="h-14 px-5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-purple-400 text-sm">history</span>
          </div>
          <span className="font-headline text-sm font-bold text-on-surface">Activity Log</span>
        </div>
        <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
          <span className="material-symbols-outlined text-zinc-500 text-sm">more_vert</span>
        </button>
      </div>

      {/* Activity list */}
      <div className="p-4 space-y-3">
        {recentActivity.map((activity, index) => {
          const config = typeConfig[activity.type];
          if (!config) return null;

          return (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer"
            >
              {/* Icon */}
              <div
                className={`
                  w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
                  ${config.bg} border border-white/5
                  group-hover:scale-110 transition-transform
                `}
              >
                <span className={`material-symbols-outlined text-sm ${config.color}`}>
                  {config.icon}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">{activity.title}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">{activity.time}</p>
              </div>

              {/* Arrow */}
              <span className="material-symbols-outlined text-zinc-600 text-sm opacity-0 group-hover:opacity-100 transition-opacity self-center">
                chevron_right
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* View All */}
      <div className="p-4 border-t border-white/5">
        <button className="w-full flex items-center justify-center gap-2 p-2 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/5 rounded-xl transition-all">
          <span className="text-[10px] uppercase font-bold tracking-wider">View Complete Log</span>
          <span className="material-symbols-outlined text-xs">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
