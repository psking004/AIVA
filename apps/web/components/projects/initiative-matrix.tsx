/**
 * AIVA Initiative Matrix
 * Autonomous Strategic Projects Horizon
 *
 * Connected directly to @aiva/api-client getProjects, createProject, updateProject, deleteProject.
 * Real data only. Truthful empty states.
 */

'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aivaClient } from '@aiva/api-client';
import {
  Network,
  Plus,
  Trash2,
  Calendar,
  X,
} from 'lucide-react';

interface InitiativeMatrixProps {
  fullScreen?: boolean;
}

export function InitiativeMatrix({ fullScreen }: InitiativeMatrixProps) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStatus, setNewStatus] = useState('ACTIVE');
  const [newProgress, setNewProgress] = useState(0);
  const [newDeadline, setNewDeadline] = useState('');

  // Real backend query
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => aivaClient.getProjects(),
  });

  const createProjectMutation = useMutation({
    mutationFn: () =>
      aivaClient.createProject({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        status: newStatus,
        progress: Number(newProgress),
        deadline: newDeadline ? new Date(newDeadline) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsCreateOpen(false);
      setNewTitle('');
      setNewDescription('');
      setNewStatus('ACTIVE');
      setNewProgress(0);
      setNewDeadline('');
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => aivaClient.deleteProject(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'text-cyan-glow bg-cyan-glow/10 aiva-border border-cyan-glow/30';
      case 'PLANNING':
        return 'text-violet-glow bg-violet-glow/10 aiva-border border-violet-glow/30';
      case 'ON_HOLD':
        return 'text-amber-solar bg-amber-solar/10 aiva-border border-amber-solar/30';
      case 'COMPLETED':
        return 'text-emerald-pulse bg-emerald-pulse/10 aiva-border border-emerald-pulse/30';
      default:
        return 'text-on-dim bg-white/5 aiva-border border-white/10';
    }
  };

  return (
    <div className={`aiva-panel rounded-2xl aiva-border flex flex-col ${fullScreen ? 'h-full' : ''}`}>
      {/* Header */}
      <div className="h-16 px-6 aiva-border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg aiva-panel border border-violet-glow/40 flex items-center justify-center">
            <Network size={16} className="text-violet-glow" />
          </div>
          <div>
            <h2 className="font-telemetry text-sm font-bold text-on-surface uppercase tracking-wider">
              Initiative Matrix
            </h2>
            <p className="text-[10px] font-telemetry text-on-dim">
              {projects.length} tracking initiatives
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="px-3.5 py-1.5 rounded-xl bg-violet-glow text-obsidian-950 font-telemetry text-xs font-bold tracking-wider hover:bg-violet-glow/90 shadow-aiva-violet flex items-center gap-1.5 transition-all"
        >
          <Plus size={14} />
          <span>New Initiative</span>
        </button>
      </div>

      {/* Projects Grid */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto max-h-[650px] scrollbar-hide">
        {projects.map((project: any) => (
          <div
            key={project.id}
            className="p-5 rounded-2xl aiva-panel-elevated aiva-border hover:aiva-border-violet transition-all group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-telemetry text-base font-bold text-on-surface group-hover:text-violet-glow transition-colors">
                  {project.title}
                </h3>
                <span className={`px-2.5 py-0.5 rounded text-[10px] font-telemetry uppercase font-bold ${getStatusBadge(project.status || 'ACTIVE')}`}>
                  {project.status || 'ACTIVE'}
                </span>
              </div>

              {project.description && (
                <p className="font-body text-xs text-on-muted line-clamp-3 mb-4">
                  {project.description}
                </p>
              )}
            </div>

            <div>
              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-telemetry text-on-dim">
                  <span>Execution Velocity</span>
                  <span className="font-bold text-on-surface">{project.progress || 0}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-glow to-cyan-glow rounded-full transition-all duration-500"
                    style={{ width: `${project.progress || 0}%` }}
                  />
                </div>
              </div>

              {/* Bottom Metadata & Actions */}
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-telemetry text-on-dim">
                <div className="flex items-center gap-3">
                  <span>{project.tasks?.length || 0} linked protocols</span>
                  {project.deadline && (
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {new Date(project.deadline).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => deleteProjectMutation.mutate(project.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-on-dim hover:text-red-400 transition-all rounded"
                  title="Delete Initiative"
                  aria-label="Delete Initiative"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {projects.length === 0 && !isLoading && (
          <div className="col-span-2 py-16 text-center text-on-dim text-xs font-body">
            No active strategic initiatives registered. Initialize a new initiative to begin tracking.
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md aiva-panel-elevated aiva-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 aiva-border-b">
              <h3 className="font-telemetry text-sm font-bold tracking-wider text-on-surface uppercase">
                Initialize Initiative
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
                  Initiative Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Autonomous Memory Orchestrator"
                  className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-sm text-on-surface focus:outline-none focus:border-violet-glow/50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                  Description
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Strategic scope and milestones..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-sm text-on-surface focus:outline-none focus:border-violet-glow/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                    Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-xs text-on-surface focus:outline-none focus:border-violet-glow/50"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PLANNING">PLANNING</option>
                    <option value="ON_HOLD">ON_HOLD</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                    Initial Progress %
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newProgress}
                    onChange={(e) => setNewProgress(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-xs text-on-surface focus:outline-none focus:border-violet-glow/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-telemetry uppercase tracking-wider text-on-dim mb-1">
                  Target Deadline
                </label>
                <input
                  type="date"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl aiva-panel aiva-border text-xs text-on-surface focus:outline-none focus:border-violet-glow/50"
                />
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
                disabled={!newTitle.trim() || createProjectMutation.isPending}
                onClick={() => createProjectMutation.mutate()}
                className="px-5 py-2 rounded-xl bg-violet-glow text-obsidian-950 text-xs font-telemetry font-bold hover:bg-violet-glow/90 disabled:opacity-50 transition-all"
              >
                Register Initiative
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
