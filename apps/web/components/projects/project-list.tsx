/**
 * AIVA Project Tracker - Futuristic Project Management Interface
 * Glass panel design with progress rings, priority badges, and status trackers
 */

'use client';

import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { aivaClient } from '@aiva/api-client';

interface ProjectListProps {
  fullScreen?: boolean;
}

export function ProjectList({ fullScreen }: ProjectListProps) {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => aivaClient.getProjects(),
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'PLANNING':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'ON_HOLD':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      case 'COMPLETED':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
      default:
        return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30';
    }
  };

  return (
    <div className={`glass-panel rounded-2xl border border-white/10 ${fullScreen ? 'h-full' : ''}`}>
      {/* Header */}
      <div className="h-14 px-5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-emerald-400 text-sm">account_tree</span>
          </div>
          <div>
            <span className="font-headline text-sm font-bold text-on-surface">Project Protocols</span>
            <p className="text-[9px] text-zinc-500">{projects.length} tracking initiatives</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-zinc-500 text-sm">filter_list</span>
          </button>
        </div>
      </div>

      {/* Projects Grid / List */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map((project: any) => (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl glass-panel-dark border border-white/5 hover:border-blue-500/30 transition-all"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-headline text-sm font-bold text-on-surface">{project.title}</h4>
                {project.description && (
                  <p className="font-body text-xs text-zinc-400 line-clamp-2 mt-1">{project.description}</p>
                )}
              </div>
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${getStatusColor(project.status)}`}>
                {project.status}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                <span>Execution Progress</span>
                <span className="font-bold text-blue-400">{project.progress || 0}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${project.progress || 0}%` }}
                />
              </div>
            </div>

            {/* Linked Tasks count */}
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-500">
              <span>{project.tasks?.length || 0} linked tasks</span>
              {project.deadline && (
                <span>Due {new Date(project.deadline).toLocaleDateString()}</span>
              )}
            </div>
          </motion.div>
        ))}

        {projects.length === 0 && !isLoading && (
          <div className="col-span-2 py-8 text-center text-zinc-500 text-xs">
            No active project protocols registered. Initialize a new project to start tracking.
          </div>
        )}
      </div>
    </div>
  );
}
