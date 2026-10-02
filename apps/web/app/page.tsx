/**
 * AIVA Dashboard - Main Page
 * Futuristic AI Operating System Interface
 */

'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '../components/layout/sidebar';
import { Header } from '../components/layout/header';
import { ChatInterface } from '../components/chat/chat-interface';
import { DashboardWidget } from '../components/dashboard/dashboard-widget';
import { TaskList } from '../components/tasks/task-list';
import { ProjectList } from '../components/projects/project-list';
import { ActivityFeed } from '../components/activity/activity-feed';

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState('dashboard');
  useEffect(() => {
    // mounted effect if needed
  }, []);

  const getViewTitle = (view: string) => {
    const titles: Record<string, string> = {
      dashboard: 'System Core',
      chat: 'Neural Chat',
      vocal: 'Vocal Interface',
      projects: 'Project Protocols',
      tasks: 'Task Protocols',
      notes: 'Memory Archive',
      files: 'Data Storage',
      calendar: 'Timeline',
      automation: 'Automation Matrix',
      settings: 'System Settings',
    };
    return titles[view] || view;
  };

  return (
    <div className="flex h-screen bg-[#050505] overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <Header
          title={getViewTitle(activeView)}
          onMenuClick={() => setSidebarOpen(true)}
        />

        {/* Main Canvas */}
        <main className="flex-1 overflow-y-auto scrollbar-hide md:ml-0 pt-16 pb-8 px-4 md:px-8">
          {/* Ambient Background Glows */}
          <div className="ambient-glow-blue" style={{ top: '10%', left: '-10%' }} />
          <div className="ambient-glow-purple" style={{ bottom: '20%', right: '-5%' }} />

          <div className="relative z-10 max-w-7xl mx-auto">
            {/* Dashboard View */}
            {activeView === 'dashboard' && (
              <div className="space-y-8 mt-8">
                {/* AI Core Visualization - Centerpiece */}
                <div className="flex flex-col items-center justify-center py-12">
                  {/* System State Indicator */}
                  <div className="flex items-center gap-2 px-4 py-2 glass-panel rounded-full border border-blue-500/20 mb-8">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_8px_rgba(96,165,250,1)]" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-blue-400 uppercase">
                      AIVA: IDLE
                    </span>
                  </div>

                  {/* Central AI Core */}
                  <div className="relative flex items-center justify-center group cursor-pointer mb-12">
                    <div className="ai-pulse-core" />
                    <div className="ai-pulse-inner flex items-center justify-center overflow-hidden">
                      <span className="material-symbols-outlined text-5xl text-white drop-shadow-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        electric_bolt
                      </span>
                    </div>
                    {/* Data Ring */}
                    <svg className="absolute w-[360px] h-[360px] opacity-20 group-hover:opacity-40 transition-opacity duration-500" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" fill="none" r="48" stroke="#adc6ff" strokeDasharray="1, 4" strokeWidth="0.2" />
                      <circle cx="50" cy="50" fill="none" r="44" stroke="#adc6ff" strokeWidth="0.1" />
                    </svg>
                  </div>

                  {/* Quick Stats Row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-3xl">
                    <DashboardWidget
                      title="Tasks"
                      value="12"
                      subtitle="4 pending"
                      trend="+2"
                      icon="checklist"
                    />
                    <DashboardWidget
                      title="Notes"
                      value="28"
                      subtitle="This week"
                      trend="+5"
                      icon="description"
                    />
                    <DashboardWidget
                      title="Documents"
                      value="15"
                      subtitle="Processed"
                      trend="+1"
                      icon="folder"
                    />
                    <DashboardWidget
                      title="Events"
                      value="6"
                      subtitle="Upcoming"
                      trend="+3"
                      icon="calendar_today"
                    />
                  </div>
                </div>

                {/* Main Grid - Chat + Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Chat Interface - Takes 2 columns */}
                  <div className="lg:col-span-2">
                    <ChatInterface />
                  </div>

                  {/* Activity Feed */}
                  <div>
                    <ActivityFeed />
                  </div>
                </div>

                {/* Task List */}
                <div>
                  <TaskList />
                </div>
              </div>
            )}

            {/* Full Screen Views */}
            {activeView === 'chat' && (
              <div className="h-[calc(100vh-8rem)]">
                <ChatInterface fullScreen />
              </div>
            )}

            {activeView === 'projects' && (
              <div className="mt-8">
                <ProjectList fullScreen />
              </div>
            )}

            {activeView === 'tasks' && (
              <div className="mt-8">
                <TaskList fullScreen />
              </div>
            )}

            {activeView === 'vocal' && (
              <div className="flex flex-col items-center justify-center h-[60vh] mt-8">
                <div className="text-center space-y-6">
                  <div className="w-24 h-24 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center mx-auto neon-glow">
                    <span className="material-symbols-outlined text-blue-400 text-4xl">mic</span>
                  </div>
                  <div>
                    <h2 className="font-headline text-xl font-bold text-blue-400 mb-2">Vocal Interface</h2>
                    <p className="text-zinc-500 text-sm">Voice command module initializing...</p>
                  </div>
                  <button className="px-6 py-3 bg-blue-500 hover:bg-blue-400 text-zinc-950 rounded-xl font-bold text-sm transition-all neon-glow">
                    Activate Voice Input
                  </button>
                </div>
              </div>
            )}

            {activeView === 'notes' && (
              <div className="flex flex-col items-center justify-center h-[60vh] mt-8">
                <div className="text-center space-y-6">
                  <div className="w-24 h-24 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-purple-400 text-4xl">note</span>
                  </div>
                  <div>
                    <h2 className="font-headline text-xl font-bold text-purple-400 mb-2">Memory Archive</h2>
                    <p className="text-zinc-500 text-sm">Note management system loading...</p>
                  </div>
                </div>
              </div>
            )}

            {activeView === 'files' && (
              <div className="flex flex-col items-center justify-center h-[60vh] mt-8">
                <div className="text-center space-y-6">
                  <div className="w-24 h-24 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-green-400 text-4xl">folder</span>
                  </div>
                  <div>
                    <h2 className="font-headline text-xl font-bold text-green-400 mb-2">Data Storage</h2>
                    <p className="text-zinc-500 text-sm">File system interface initializing...</p>
                  </div>
                </div>
              </div>
            )}

            {activeView === 'calendar' && (
              <div className="flex flex-col items-center justify-center h-[60vh] mt-8">
                <div className="text-center space-y-6">
                  <div className="w-24 h-24 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-orange-400 text-4xl">calendar_month</span>
                  </div>
                  <div>
                    <h2 className="font-headline text-xl font-bold text-orange-400 mb-2">Timeline</h2>
                    <p className="text-zinc-500 text-sm">Calendar synchronization in progress...</p>
                  </div>
                </div>
              </div>
            )}

            {activeView === 'automation' && (
              <div className="flex flex-col items-center justify-center h-[60vh] mt-8">
                <div className="text-center space-y-6">
                  <div className="w-24 h-24 rounded-full bg-pink-500/20 border border-pink-500/40 flex items-center justify-center mx-auto neon-glow">
                    <span className="material-symbols-outlined text-pink-400 text-4xl">auto_awesome</span>
                  </div>
                  <div>
                    <h2 className="font-headline text-xl font-bold text-pink-400 mb-2">Automation Matrix</h2>
                    <p className="text-zinc-500 text-sm">Workflow engine standby...</p>
                  </div>
                </div>
              </div>
            )}

            {activeView === 'settings' && (
              <div className="flex flex-col items-center justify-center h-[60vh] mt-8">
                <div className="text-center space-y-6">
                  <div className="w-24 h-24 rounded-full bg-zinc-500/20 border border-zinc-500/40 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-zinc-400 text-4xl">settings</span>
                  </div>
                  <div>
                    <h2 className="font-headline text-xl font-bold text-zinc-400 mb-2">System Settings</h2>
                    <p className="text-zinc-500 text-sm">Configuration module loading...</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-safe">
          <div className="glass-panel-dark rounded-full mb-6 mx-auto w-fit px-6 border border-white/10 shadow-[0_0_30px_rgba(0,122,255,0.1)] flex items-center h-14 gap-6">
            <button
              onClick={() => setActiveView('vocal')}
              className={`transition-all active:scale-110 ${activeView === 'vocal' ? 'text-blue-400' : 'text-zinc-600 hover:text-blue-200'}`}
            >
              <span className="material-symbols-outlined text-2xl">mic_none</span>
            </button>
            <button
              onClick={() => setActiveView('chat')}
              className={`transition-all active:scale-110 ${activeView === 'chat' ? 'text-blue-400 shadow-[0_0_10px_rgba(0,122,255,0.5)]' : 'text-zinc-600 hover:text-blue-200'}`}
            >
              <span className="material-symbols-outlined text-2xl">keyboard</span>
            </button>
            <button
              onClick={() => setActiveView('dashboard')}
              className={`transition-all active:scale-110 ${activeView === 'dashboard' ? 'text-blue-400' : 'text-zinc-600 hover:text-blue-200'}`}
            >
              <span className="material-symbols-outlined text-2xl">apps</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
