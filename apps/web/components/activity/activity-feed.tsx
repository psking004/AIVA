/**
 * ActivityFeed - Recent activity display
 */

'use client';

import { motion } from 'framer-motion';
import { FileText, CheckSquare, MessageSquare, Calendar, Zap } from 'lucide-react';

interface Activity {
  id: string;
  type: 'task' | 'note' | 'message' | 'event' | 'automation';
  title: string;
  time: string;
}

const recentActivity: Activity[] = [
  { id: '1', type: 'task', title: 'Completed "Review Q1 report"', time: '2 min ago' },
  { id: '2', type: 'note', title: 'Created note "Meeting notes"', time: '15 min ago' },
  { id: '3', type: 'message', title: 'Chat with AIVA', time: '1 hour ago' },
  { id: '4', type: 'event', title: 'Team standup at 10:00 AM', time: '2 hours ago' },
  { id: '5', type: 'automation', title: 'Automation "Daily Summary" triggered', time: '3 hours ago' },
];

const typeIcons = {
  task: CheckSquare,
  note: FileText,
  message: MessageSquare,
  event: Calendar,
  automation: Zap,
};

const typeColors = {
  task: 'text-blue-500 bg-blue-500/10',
  note: 'text-green-500 bg-green-500/10',
  message: 'text-purple-500 bg-purple-500/10',
  event: 'text-orange-500 bg-orange-500/10',
  automation: 'text-yellow-500 bg-yellow-500/10',
};

export function ActivityFeed() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="h-14 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center">
        <span className="font-medium">Recent Activity</span>
      </div>

      {/* Activity list */}
      <div className="p-4 space-y-4">
        {recentActivity.map((activity) => {
          const Icon = typeIcons[activity.type];
          const colorClass = typeColors[activity.type];

          return (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex gap-3"
            >
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                  ${colorClass}
                `}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{activity.title}</p>
                <p className="text-xs text-gray-500">{activity.time}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
