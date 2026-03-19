/**
 * TaskList - Tasks display component
 */

'use client';

import { useState } from 'react';
import { CheckSquare, Clock, AlertCircle, Plus, MoreVertical } from 'lucide-react';
import { motion } from 'framer-motion';

interface Task {
  id: string;
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dueDate?: string;
  completed: boolean;
}

const sampleTasks: Task[] = [
  { id: '1', title: 'Review Q1 report', priority: 'HIGH', dueDate: 'Today', completed: false },
  { id: '2', title: 'Update project documentation', priority: 'MEDIUM', dueDate: 'Tomorrow', completed: false },
  { id: '3', title: 'Team standup meeting', priority: 'MEDIUM', dueDate: 'Today', completed: true },
  { id: '4', title: 'Code review for PR #42', priority: 'CRITICAL', dueDate: 'Today', completed: false },
];

interface TaskListProps {
  fullScreen?: boolean;
}

export function TaskList({ fullScreen }: TaskListProps) {
  const [tasks, setTasks] = useState(sampleTasks);

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'HIGH':
        return <AlertCircle className="w-4 h-4 text-orange-500" />;
      case 'MEDIUM':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div
      className={`
        bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800
        ${fullScreen ? 'h-full' : ''}
      `}
    >
      {/* Header */}
      <div className="h-14 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-blue-500" />
          <span className="font-medium">Tasks</span>
        </div>
        <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* Task list */}
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {tasks.map((task) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`
              p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50
              ${task.completed ? 'opacity-60' : ''}
            `}
          >
            <button
              onClick={() => toggleTask(task.id)}
              className={`
                w-5 h-5 rounded border-2 flex items-center justify-center
                ${task.completed
                  ? 'bg-blue-500 border-blue-500'
                  : 'border-gray-300 dark:border-gray-600'
                }
              `}
            >
              {task.completed && <CheckSquare className="w-3 h-3 text-white" />}
            </button>

            <div className="flex-1 min-w-0">
              <p
                className={`
                  font-medium truncate
                  ${task.completed ? 'line-through text-gray-500' : ''}
                `}
              >
                {task.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {getPriorityIcon(task.priority)}
                <span className="text-xs text-gray-500">{task.priority}</span>
                {task.dueDate && (
                  <>
                    <span className="text-gray-300">•</span>
                    <span className="text-xs text-gray-500">{task.dueDate}</span>
                  </>
                )}
              </div>
            </div>

            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
              <MoreVertical className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </div>

      {/* Add task button */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <button className="w-full flex items-center justify-center gap-2 p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
          <Plus className="w-4 h-4" />
          <span>Add task</span>
        </button>
      </div>
    </div>
  );
}
