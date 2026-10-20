/**
 * AIVA Nexus Home
 * Primary Autonomous Personal AI Operating System Environment
 *
 * Spatial Topology:
 * - Top: Consciousness / System Horizon (truthful stats from real backend APIs)
 * - Left Wing: Execution Horizon (live priority tasks from aivaClient.getTasks)
 * - Center Stage: AIVA Kinetic Resonant Core (visual identity, real state)
 * - Right Wing: Proactive Horizon (real deadlines, memory context, agenda alerts)
 * - Center Lower: Omni-Modal Command Conduit
 * - Lower Canvas: Active Initiatives Matrix (real projects from aivaClient.getProjects)
 *
 * Real data only. Truthful empty states.
 */

'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aivaClient } from '@aiva/api-client';
import { AivaCore, AivaCoreState } from './aiva-core';
import { OmniConduit } from './omni-conduit';
import {
  CheckSquare,
  Clock,
  Sparkles,
  ArrowRight,
  Layers,
  CheckCircle,
  AlertTriangle,
  FolderGit2,
  Calendar,
} from 'lucide-react';
import { AivaLensId } from './lens-navigation';

interface NexusHomeProps {
  onLensSwitch: (lens: AivaLensId) => void;
  onDirectiveSubmit: (directive: string) => void;
  onVoiceTrigger: () => void;
  aivaState?: AivaCoreState;
  truthfulStatus?: string;
}

export function NexusHome({
  onLensSwitch,
  onDirectiveSubmit,
  onVoiceTrigger,
  aivaState = 'IDLE',
  truthfulStatus = 'All operational horizons synchronized.',
}: NexusHomeProps) {
  const queryClient = useQueryClient();

  // Real backend queries
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => aivaClient.getTasks(),
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => aivaClient.getProjects(),
  });

  const { data: events = [] } = useQuery({
    queryKey: ['calendar-events'],
    queryFn: () => aivaClient.getEvents(),
  });

  const { data: notes = [] } = useQuery({
    queryKey: ['notes'],
    queryFn: () => aivaClient.getNotes(),
  });

  // Task completion toggle mutation
  const toggleTaskMutation = useMutation({
    mutationFn: (args: { id: string; currentStatus: string }) =>
      aivaClient.updateTask(args.id, {
        status: args.currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // Active / pending tasks
  const pendingTasks = tasks.filter((t: any) => t.status !== 'COMPLETED');
  const criticalTasks = pendingTasks.filter(
    (t: any) => t.priority === 'CRITICAL' || t.priority === 'HIGH'
  );

  // Proactive synthesis items derived strictly from real data
  const upcomingDeadlines = pendingTasks.filter((t: any) => t.dueDate);
  const activeProjectsCount = projects.filter((p: any) => p.status !== 'COMPLETED').length;

  return (
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto pb-12">
      {/* 1. System Horizon Status Bar (Truthful Real Data Only) */}
      <section
        aria-label="System Horizon"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-1 rounded-2xl aiva-panel aiva-border"
      >
        <div className="p-3 rounded-xl aiva-border-subtle bg-white/[0.01]">
          <div className="flex items-center gap-2 text-on-dim text-xs font-telemetry uppercase tracking-wider mb-1">
            <CheckSquare size={13} className="text-cyan-glow" />
            <span>Active Tasks</span>
          </div>
          <p className="font-telemetry text-xl font-bold text-on-surface">
            {tasksLoading ? '...' : pendingTasks.length}
          </p>
          <p className="text-[10px] text-on-dim mt-0.5">
            {criticalTasks.length > 0
              ? `${criticalTasks.length} high priority`
              : 'All priorities stable'}
          </p>
        </div>

        <div className="p-3 rounded-xl aiva-border-subtle bg-white/[0.01]">
          <div className="flex items-center gap-2 text-on-dim text-xs font-telemetry uppercase tracking-wider mb-1">
            <FolderGit2 size={13} className="text-violet-glow" />
            <span>Initiatives</span>
          </div>
          <p className="font-telemetry text-xl font-bold text-on-surface">
            {projectsLoading ? '...' : activeProjectsCount}
          </p>
          <p className="text-[10px] text-on-dim mt-0.5">
            {projects.length} total protocols
          </p>
        </div>

        <div className="p-3 rounded-xl aiva-border-subtle bg-white/[0.01]">
          <div className="flex items-center gap-2 text-on-dim text-xs font-telemetry uppercase tracking-wider mb-1">
            <Calendar size={13} className="text-amber-solar" />
            <span>Timeline Events</span>
          </div>
          <p className="font-telemetry text-xl font-bold text-on-surface">
            {events.length}
          </p>
          <p className="text-[10px] text-on-dim mt-0.5">
            Scheduled coordinates
          </p>
        </div>

        <div className="p-3 rounded-xl aiva-border-subtle bg-white/[0.01]">
          <div className="flex items-center gap-2 text-on-dim text-xs font-telemetry uppercase tracking-wider mb-1">
            <Layers size={13} className="text-emerald-pulse" />
            <span>Memory Archive</span>
          </div>
          <p className="font-telemetry text-xl font-bold text-on-surface">
            {notes.length}
          </p>
          <p className="text-[10px] text-on-dim mt-0.5">
            Indexed knowledge records
          </p>
        </div>
      </section>

      {/* 2. Core Tripartite Spatial Stage (Execution Horizon | AIVA Nucleus | Proactive Horizon) */}
      <section
        aria-label="AIVA Central Workspace"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
      >
        {/* Left Wing: Execution Horizon (Tasks) */}
        <div className="lg:col-span-4 flex flex-col rounded-2xl aiva-panel aiva-border p-5">
          <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
            <div className="flex items-center gap-2">
              <CheckSquare size={16} className="text-cyan-glow" />
              <h2 className="font-telemetry text-sm font-bold tracking-wider text-on-surface uppercase">
                Execution Horizon
              </h2>
            </div>
            <button
              onClick={() => onLensSwitch('tasks')}
              className="text-[10px] font-telemetry text-cyan-glow hover:underline flex items-center gap-1 uppercase tracking-wider"
            >
              <span>Manage</span>
              <ArrowRight size={11} />
            </button>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[280px] scrollbar-hide pr-1">
            {pendingTasks.slice(0, 4).map((task: any) => (
              <div
                key={task.id}
                className="p-3 rounded-xl aiva-panel-elevated aiva-border-subtle flex items-start gap-3 hover:border-cyan-glow/30 transition-all group"
              >
                <button
                  onClick={() =>
                    toggleTaskMutation.mutate({
                      id: task.id,
                      currentStatus: task.status,
                    })
                  }
                  className="mt-0.5 w-4 h-4 rounded aiva-border border-on-dim hover:border-cyan-glow flex items-center justify-center transition-colors"
                  aria-label={`Complete task ${task.title}`}
                >
                  {task.status === 'COMPLETED' && (
                    <CheckCircle size={12} className="text-cyan-glow" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-body font-medium text-on-surface truncate group-hover:text-cyan-glow transition-colors">
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-[9px] font-telemetry px-1.5 py-0.2 rounded uppercase font-semibold ${
                        task.priority === 'CRITICAL'
                          ? 'text-red-400 bg-red-500/10'
                          : task.priority === 'HIGH'
                          ? 'text-amber-solar bg-amber-solar/10'
                          : 'text-on-dim bg-white/5'
                      }`}
                    >
                      {task.priority}
                    </span>
                    {task.dueDate && (
                      <span className="text-[10px] font-telemetry text-on-dim flex items-center gap-1">
                        <Clock size={10} />
                        {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {pendingTasks.length === 0 && !tasksLoading && (
              <div className="py-8 text-center text-on-dim text-xs font-body">
                No active execution protocols. All systems clear.
              </div>
            )}
          </div>
        </div>

        {/* Center Stage: The AIVA Resonant Nucleus */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center rounded-2xl aiva-panel aiva-border p-6 relative overflow-hidden">
          {/* Subtle ambient lens flares */}
          <div className="absolute w-48 h-48 rounded-full bg-cyan-glow/10 filter blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center">
            <AivaCore
              state={aivaState}
              statusText={truthfulStatus}
              size="hero"
              onClick={onVoiceTrigger}
            />

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={onVoiceTrigger}
                className="px-3.5 py-1.5 rounded-lg text-xs font-telemetry tracking-wider text-cyan-glow aiva-border border-cyan-glow/30 hover:bg-cyan-glow/10 transition-all flex items-center gap-1.5"
              >
                <Sparkles size={13} />
                <span>Vocal Interface</span>
              </button>
              <button
                onClick={() => onLensSwitch('dialogue')}
                className="px-3.5 py-1.5 rounded-lg text-xs font-telemetry tracking-wider text-on-muted aiva-border hover:text-on-surface hover:bg-white/5 transition-all flex items-center gap-1.5"
              >
                <span>Open Dialogue</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Wing: Proactive Horizon (Deadlines & Insights) */}
        <div className="lg:col-span-4 flex flex-col rounded-2xl aiva-panel aiva-border p-5">
          <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-violet-glow" />
              <h2 className="font-telemetry text-sm font-bold tracking-wider text-on-surface uppercase">
                Proactive Horizon
              </h2>
            </div>
            <span className="text-[9px] font-telemetry text-on-dim uppercase tracking-wider">
              Autonomous Watch
            </span>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[280px] scrollbar-hide pr-1">
            {/* Real upcoming deadlines */}
            {upcomingDeadlines.slice(0, 2).map((item: any) => (
              <div
                key={`deadline-${item.id}`}
                className="p-3 rounded-xl aiva-panel-elevated aiva-border-subtle border-l-2 border-l-amber-solar"
              >
                <div className="flex items-center gap-1.5 text-amber-solar text-[10px] font-telemetry font-bold uppercase">
                  <AlertTriangle size={11} />
                  <span>Approaching Deadline</span>
                </div>
                <p className="text-xs font-body font-medium text-on-surface mt-1 truncate">
                  {item.title}
                </p>
                <p className="text-[10px] font-telemetry text-on-dim mt-0.5">
                  Due {new Date(item.dueDate).toLocaleDateString()}
                </p>
              </div>
            ))}

            {/* Real recent memory note context */}
            {notes.slice(0, 2).map((note: any) => (
              <div
                key={`note-${note.id}`}
                className="p-3 rounded-xl aiva-panel-elevated aiva-border-subtle border-l-2 border-l-violet-glow"
              >
                <div className="flex items-center gap-1.5 text-violet-glow text-[10px] font-telemetry font-bold uppercase">
                  <Layers size={11} />
                  <span>Memory Synchronized</span>
                </div>
                <p className="text-xs font-body font-medium text-on-surface mt-1 truncate">
                  {note.title}
                </p>
                <p className="text-[10px] font-body text-on-dim mt-0.5 line-clamp-1">
                  {note.content || 'Indexed in episodic storage'}
                </p>
              </div>
            ))}

            {upcomingDeadlines.length === 0 && notes.length === 0 && (
              <div className="py-8 text-center text-on-dim text-xs font-body">
                No active proactive alerts. System vigilance active.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. Primary Command Conduit */}
      <section aria-label="Command Conduit">
        <OmniConduit
          onSubmitCommand={onDirectiveSubmit}
          onVoiceTrigger={onVoiceTrigger}
          onQuickAction={(action) => {
            if (action === 'task') onLensSwitch('tasks');
            if (action === 'project') onLensSwitch('projects');
            if (action === 'memory') onLensSwitch('memory');
            if (action === 'calendar') onLensSwitch('timeline');
          }}
        />
      </section>

      {/* 4. Lower Canvas: Active Initiatives Matrix (Real Projects) */}
      <section aria-label="Active Initiatives Matrix">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FolderGit2 size={16} className="text-cyan-glow" />
            <h2 className="font-telemetry text-sm font-bold tracking-wider text-on-surface uppercase">
              Active Initiatives Matrix
            </h2>
          </div>
          <button
            onClick={() => onLensSwitch('projects')}
            className="text-[11px] font-telemetry text-cyan-glow hover:underline uppercase tracking-wider flex items-center gap-1"
          >
            <span>Open Matrix</span>
            <ArrowRight size={12} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.slice(0, 3).map((project: any) => (
            <div
              key={project.id}
              onClick={() => onLensSwitch('projects')}
              className="p-4 rounded-xl aiva-panel aiva-border hover:aiva-border-cyan transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-telemetry text-sm font-bold text-on-surface group-hover:text-cyan-glow transition-colors truncate">
                  {project.title}
                </h3>
                <span className="text-[9px] font-telemetry px-2 py-0.5 rounded uppercase font-semibold text-cyan-glow bg-cyan-glow/10 aiva-border border-cyan-glow/20">
                  {project.status || 'ACTIVE'}
                </span>
              </div>

              {project.description && (
                <p className="font-body text-xs text-on-dim line-clamp-2 mb-3">
                  {project.description}
                </p>
              )}

              {/* Real Progress */}
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] font-telemetry text-on-muted">
                <span>Progress: {project.progress || 0}%</span>
                {project.deadline && (
                  <span>Due {new Date(project.deadline).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          ))}

          {projects.length === 0 && !projectsLoading && (
            <div className="col-span-3 p-8 rounded-xl aiva-panel aiva-border text-center text-on-dim text-xs font-body">
              No active initiatives registered. Dispatch a project protocol from the conduit.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
