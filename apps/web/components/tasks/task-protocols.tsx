/**
 * AIVA Task Protocols
 * Autonomous Task Management Horizon
 *
 * Connected directly to @aiva/api-client getTasks, createTask, updateTask, deleteTask.
 * Real data only. Truthful empty states.
 */

'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aivaClient } from '@aiva/api-client';
import { Priority, TaskStatus } from '@aiva/types';
import {
  CheckSquare,
  Plus,
  Clock,
  CheckCircle2,
  Trash2,
  X,
} from 'lucide-react';

interface TaskProtocolsProps {
  fullScreen?: boolean;
}

export function TaskProtocols({ fullScreen }: TaskProtocolsProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'CRITICAL'>('ALL');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('MEDIUM');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // Real backend queries
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => aivaClient.getTasks(),
  });

  // Mutations
  const updateTaskMutation = useMutation({
    mutationFn: (args: { id: string; status: TaskStatus }) =>
      aivaClient.updateTask(args.id, { status: args.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => aivaClient.deleteTask(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const createTaskMutation = useMutation({
    mutationFn: () =>
      aivaClient.createTask({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        priority: newPriority,
        dueDate: newDueDate ? new Date(newDueDate) : undefined,
        status: 'PENDING',
        tags: [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsCreateOpen(false);
      setNewTitle('');
      setNewDescription('');
      setNewDueDate('');
      setNewPriority('MEDIUM');
    },
  });

  // Filtered task set
  const filteredTasks = tasks.filter((task: any) => {
    if (filter === 'ACTIVE') return task.status !== 'COMPLETED';
    if (filter === 'COMPLETED') return task.status === 'COMPLETED';
    if (filter === 'CRITICAL') return task.priority === 'CRITICAL' || task.priority === 'HIGH';
    return true;
  });

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'text-red-400 bg-red-500/10 aiva-border border-red-500/30';
      case 'HIGH':
        return 'text-amber-solar bg-amber-solar/10 aiva-border border-amber-solar/30';
      case 'MEDIUM':
        return 'text-cyan-glow bg-cyan-glow/10 aiva-border border-cyan-glow/30';
      default:
        return 'text-on-dim bg-white/5 aiva-border border-white/10';
    }
  };

  return (
    <div className={`aiva-panel rounded-2xl aiva-border flex flex-col ${fullScreen ? 'h-full' : ''}`}>
      {/* Header & Controls */}
      <div className="h-16 px-6 aiva-border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg aiva-panel border border-cyan-glow/40 flex items-center justify-center">
            <CheckSquare size={16} className="text-cyan-glow" />
          </div>
          <div>
            <h2 className="font-telemetry text-sm font-bold text-on-surface uppercase tracking-wider">
              Task Protocols
            </h2>
            <p className="text-[10px] font-telemetry text-on-dim">
              {tasks.filter((t: any) => t.status !== 'COMPLETED').length} active protocols
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Filter Pills */}
          <div className="hidden sm:flex items-center gap-1 aiva-panel p-1 rounded-xl aiva-border text-xs">
            {(['ALL', 'ACTIVE', 'CRITICAL', 'COMPLETED'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                className={`px-2.5 py-1 rounded-lg font-telemetry text-[10px] tracking-wider transition-colors ${
                  filter === mode
                    ? 'bg-cyan-glow/15 text-cyan-glow font-bold'
                    : 'text-on-dim hover:text-on-surface'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-cyan-glow text-obsidian-950 font-telemetry text-xs font-bold tracking-wider hover:bg-cyan-glow/90 shadow-aiva-cyan flex items-center gap-1.5 transition-all"
          >
            <Plus size={14} />
            <span>New Protocol</span>
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="p-6 divide-y divide-white/5 overflow-y-auto max-h-[600px] scrollbar-hide">
        {filteredTasks.map((task: any) => {
          const isDone = task.status === 'COMPLETED';

          return (
            <div
              key={task.id}
              className={`py-3.5 flex items-start gap-4 transition-all group ${
                isDone ? 'opacity-40' : ''
              }`}
            >
              {/* Checkbox toggle */}
              <button
                onClick={() =>
                  updateTaskMutation.mutate({
                    id: task.id,
                    status: isDone ? 'PENDING' : 'COMPLETED',
                  })
                }
                className={`mt-0.5 w-5 h-5 rounded-md aiva-border flex items-center justify-center transition-all ${
                  isDone
                    ? 'bg-cyan-glow border-cyan-glow text-obsidian-950'
                    : 'hover:border-cyan-glow text-transparent'
                }`}
                aria-label={`Toggle task completion: ${task.title}`}
              >
                <CheckCircle2 size={13} className={isDone ? 'stroke-[3]' : ''} />
              </button>

              {/* Task Details */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-body font-medium truncate ${
                    isDone ? 'line-through text-on-dim' : 'text-on-surface'
                  }`}
                >
                  {task.title}
                </p>

                {task.description && (
                  <p className="text-xs font-body text-on-dim line-clamp-2 mt-0.5">
                    {task.description}
                  </p>
                )}

                <div className="flex items-center gap-2.5 mt-2">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-telemetry uppercase font-bold ${getPriorityStyle(task.priority)}`}>
                    {task.priority}
                  </span>

                  {task.dueDate && (
                    <span className="text-[10px] font-telemetry text-on-dim flex items-center gap-1">
                      <Clock size={11} />
                      Due: {new Date(task.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Delete Action */}
              <button
                onClick={() => deleteTaskMutation.mutate(task.id)}
                className="opacity-0 group-hover:opacity-100 p-2 text-on-dim hover:text-red-400 transition-all rounded-lg hover:bg-white/5"
                title="Delete Protocol"
                aria-label="Delete Protocol"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}

        {filteredTasks.length === 0 && !isLoading && (
          <div className="py-12 text-center text-on-dim text-xs font-body">
            No task protocols matching criteria. Initialize a new protocol to register an operational objective.
          </div>
        )}
      </div>

      {/* Creation Modal / Popover */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md aiva-panel-elevated aiva-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 aiva-border-b">
              <h3 className="font-telemetry text-sm font-bold tracking-wider text-on-surface uppercase">
                Initialize Protocol
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-on-dim hover:text-on-surface p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                  Protocol Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Audit vector ingestion pipelines"
                  className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-sm text-on-surface focus:outline-none focus:border-cyan-glow/50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                  Description (Optional)
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Operational details and deliverables..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-sm text-on-surface focus:outline-none focus:border-cyan-glow/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                    Priority
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as Priority)}
                    className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-xs text-on-surface focus:outline-none focus:border-cyan-glow/50"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-xs text-on-surface focus:outline-none focus:border-cyan-glow/50"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 aiva-border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-telemetry text-on-dim hover:text-on-surface aiva-border"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newTitle.trim() || createTaskMutation.isPending}
                onClick={() => createTaskMutation.mutate()}
                className="px-5 py-2 rounded-xl bg-cyan-glow text-obsidian-950 text-xs font-telemetry font-bold hover:bg-cyan-glow/90 disabled:opacity-50 transition-all"
              >
                Initialize
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
