/**
 * AIVA Dashboard - Main Page
 */

'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '../components/layout/sidebar';
import { Header } from '../components/layout/header';
import { ChatInterface } from '../components/chat/chat-interface';
import { DashboardWidget } from '../components/dashboard/dashboard-widget';
import { TaskList } from '../components/tasks/task-list';
import { ActivityFeed } from '../components/activity/activity-feed';

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState('dashboard');

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title={activeView.charAt(0).toUpperCase() + activeView.slice(1)}
          onMenuClick={() => setSidebarOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-6">
          {activeView === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <DashboardWidget
                  title="Tasks"
                  value="12"
                  subtitle="4 pending"
                  trend="+2"
                />
                <DashboardWidget
                  title="Notes"
                  value="28"
                  subtitle="This week"
                  trend="+5"
                />
                <DashboardWidget
                  title="Documents"
                  value="15"
                  subtitle="Processed"
                  trend="+1"
                />
                <DashboardWidget
                  title="Events"
                  value="6"
                  subtitle="Upcoming"
                  trend="+3"
                />
              </div>

              {/* Main Grid */}
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

          {activeView === 'chat' && <ChatInterface fullScreen />}
          {activeView === 'tasks' && <TaskList fullScreen />}
          {activeView === 'notes' && <div className="text-gray-500">Notes view coming soon</div>}
          {activeView === 'files' && <div className="text-gray-500">Files view coming soon</div>}
          {activeView === 'calendar' && <div className="text-gray-500">Calendar view coming soon</div>}
          {activeView === 'automation' && <div className="text-gray-500">Automation view coming soon</div>}
          {activeView === 'settings' && <div className="text-gray-500">Settings view coming soon</div>}
        </main>
      </div>
    </div>
  );
}
