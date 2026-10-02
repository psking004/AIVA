/**
 * AIVA TaskList - Futuristic Task Management
 * Glass panel design with priority indicators
 */

'use client';


import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aivaClient } from '@aiva/api-client';

interface TaskListProps {
  fullScreen?: boolean;
}

export function TaskList({ fullScreen }: TaskListProps) {
  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => aivaClient.getTasks(),
  });

  const updateTask = useMutation({
    mutationFn: (args: { id: string, completed: boolean }) => 
      aivaClient.updateTask(args.id, { status: args.completed ? 'COMPLETED' : 'PENDING' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const toggleTask = (id: string, currentCompleted: boolean) => {
    updateTask.mutate({ id, completed: !currentCompleted });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'text-red-400 bg-red-500/10 border-red-500/30';
      case 'HIGH':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
      case 'MEDIUM':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      case 'LOW':
        return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30';
      default:
        return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30';
    }
  };


  return (
    <div
      className={`
        glass-panel rounded-2xl border border-white/10
        ${fullScreen ? 'h-full' : ''}
      `}
    >
      {/* Header */}
      <div className="h-14 px-5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-blue-400 text-sm">checklist</span>
          </div>
          <div>
            <span className="font-headline text-sm font-bold text-on-surface">Task Protocols</span>
            <p className="text-[9px] text-zinc-500">{tasks.filter((t: any) => t.status !== 'COMPLETED').length} active</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-zinc-500 text-sm">filter_list</span>
          </button>
          <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-zinc-500 text-sm">more_vert</span>
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="divide-y divide-white/5">
        {tasks.map((task) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className={`
              p-4 flex items-center gap-4 hover:bg-white/5 transition-colors
              ${task.status === 'COMPLETED' ? 'opacity-50' : ''}
            `}
          >
            {/* Checkbox */}
            <button
              onClick={() => toggleTask(task.id, task.status === 'COMPLETED')}
              className={`
                w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all
                ${task.status === 'COMPLETED'
                  ? 'bg-blue-500 border-blue-500'
                  : 'border-zinc-600 hover:border-blue-500/50'
                }
              `}
            >
              {task.status === 'COMPLETED' && (
                <span className="material-symbols-outlined text-white text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>
                  check
                </span>
              )}
            </button>

            {/* Task Content */}
            <div className="flex-1 min-w-0">
              <p
                className={`
                  font-body text-sm truncate
                  ${task.status === 'COMPLETED' ? 'line-through text-zinc-500' : 'text-on-surface'}
                `}
              >
                {task.title}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                {/* Priority Badge */}
                <span
                  className={`
                    px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border
                    ${getPriorityColor(task.priority)}
                  `}
                >
                  {task.priority}
                </span>

                {/* Due Date */}
                {task.dueDate && (
                  <div className="flex items-center gap-1 text-zinc-500">
                    <span className="material-symbols-outlined text-[10px]">schedule</span>
                    <span className="text-[10px]">{new Date(task.dueDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors opacity-0 hover:opacity-100">
              <span className="material-symbols-outlined text-zinc-500 text-sm">more_vert</span>
            </button>
          </motion.div>
        ))}
      </div>

      {/* Add task button */}
      <div className="p-4 border-t border-white/5">
        <button className="w-full flex items-center justify-center gap-2 p-3 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/5 rounded-xl transition-all group">
          <span className="material-symbols-outlined text-sm group-hover:scale-110 transition-transform">add_circle</span>
          <span className="text-sm font-medium">Initialize new protocol</span>
        </button>
      </div>
    </div>
  );
}
