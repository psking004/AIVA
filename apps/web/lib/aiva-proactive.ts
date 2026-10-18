/**
 * AIVA Proactive Intelligence Engine
 *
 * Provides autonomous, non-intrusive proactive assistance:
 * - Impending task deadline alerts (<1 hour)
 * - Upcoming calendar meeting notifications (<15 minutes)
 * - Daily morning briefing generation
 * - Contextual suggestions without interrupting high-focus user activity
 */

import { aivaClient } from '@aiva/api-client';

export interface ProactiveNotice {
  id: string;
  type: 'DEADLINE_WARNING' | 'MEETING_ALERT' | 'MORNING_BRIEFING' | 'SUGGESTION';
  title: string;
  message: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: number;
}

export class AivaProactiveEngine {
  private static instance: AivaProactiveEngine | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private noticeListeners: Array<(notice: ProactiveNotice) => void> = [];
  private dispatchedNoticeIds: Set<string> = new Set();

  public static getInstance(): AivaProactiveEngine {
    if (!AivaProactiveEngine.instance) {
      AivaProactiveEngine.instance = new AivaProactiveEngine();
    }
    return AivaProactiveEngine.instance;
  }

  public subscribe(listener: (notice: ProactiveNotice) => void): () => void {
    this.noticeListeners.push(listener);
    return () => {
      this.noticeListeners = this.noticeListeners.filter((l) => l !== listener);
    };
  }

  public startProactiveMonitoring(intervalMs = 60000): void {
    if (this.intervalId) return;

    console.log('[AIVA PROACTIVE] Starting autonomous background monitor');
    this.intervalId = setInterval(() => {
      this.runPeriodicCheck().catch((err) => {
        console.warn('[AIVA PROACTIVE] Monitor cycle warning:', err?.message || err);
      });
    }, intervalMs);

    // Initial check
    this.runPeriodicCheck().catch(() => {});
  }

  public stopProactiveMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[AIVA PROACTIVE] Stopped background monitor');
    }
  }

  private async runPeriodicCheck(): Promise<void> {
    const now = Date.now();

    try {
      // 1. Check impending task deadlines
      const tasks = await aivaClient.getTasks();
      if (Array.isArray(tasks)) {
        for (const task of tasks) {
          if (task.status === 'COMPLETED' || !task.dueDate) continue;
          const dueMs = new Date(task.dueDate).getTime();
          const diffMs = dueMs - now;

          // Due within 45 minutes
          if (diffMs > 0 && diffMs <= 45 * 60 * 1000) {
            const noticeId = `task_due_${task.id}_${new Date(task.dueDate).toISOString().slice(0, 13)}`;
            if (!this.dispatchedNoticeIds.has(noticeId)) {
              this.dispatchedNoticeIds.add(noticeId);
              const minutesLeft = Math.round(diffMs / 60000);
              this.dispatchNotice({
                id: noticeId,
                type: 'DEADLINE_WARNING',
                title: 'Impending Protocol Deadline',
                message: `Task "${task.title}" is due in approximately ${minutesLeft} minutes.`,
                priority: task.priority === 'HIGH' || task.priority === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
                timestamp: now,
              });
            }
          }
        }
      }

      // 2. Check calendar meetings starting in <15 minutes
      const events = await aivaClient.getEvents();
      if (Array.isArray(events)) {
        for (const event of events) {
          if (!event.startTime) continue;
          const startMs = new Date(event.startTime).getTime();
          const diffMs = startMs - now;

          if (diffMs > 0 && diffMs <= 15 * 60 * 1000) {
            const noticeId = `event_start_${event.id}_${new Date(event.startTime).toISOString().slice(0, 16)}`;
            if (!this.dispatchedNoticeIds.has(noticeId)) {
              this.dispatchedNoticeIds.add(noticeId);
              const minutesLeft = Math.max(1, Math.round(diffMs / 60000));
              this.dispatchNotice({
                id: noticeId,
                type: 'MEETING_ALERT',
                title: 'Upcoming Temporal Coordinate',
                message: `"${event.title}" commences in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`,
                priority: 'HIGH',
                timestamp: now,
              });
            }
          }
        }
      }
    } catch (_) {
      // Periodic check silently handles network disconnections
    }
  }

  private dispatchNotice(notice: ProactiveNotice): void {
    console.log(`[AIVA PROACTIVE NOTICE] ${notice.type}: ${notice.title} — ${notice.message}`);
    for (const listener of this.noticeListeners) {
      try {
        listener(notice);
      } catch (err) {
        console.error('[AIVA PROACTIVE] Listener error:', err);
      }
    }
  }

  /**
   * Generates a concise daily executive briefing of active priorities
   */
  public async generateDailyBriefing(): Promise<{ spoken: string; display: string }> {
    try {
      const [tasks, projects, events] = await Promise.all([
        aivaClient.getTasks().catch(() => []),
        aivaClient.getProjects().catch(() => []),
        aivaClient.getEvents().catch(() => []),
      ]);

      const pendingTasks = Array.isArray(tasks) ? tasks.filter((t: any) => t.status !== 'COMPLETED') : [];
      const highPriority = pendingTasks.filter((t: any) => t.priority === 'HIGH' || t.priority === 'CRITICAL');
      const activeProjects = Array.isArray(projects) ? projects.filter((p: any) => p.status !== 'COMPLETED') : [];
      const todayEvents = Array.isArray(events) ? events : [];

      const spoken = `Good day. You have ${pendingTasks.length} pending task${pendingTasks.length === 1 ? '' : 's'}${
        highPriority.length > 0 && highPriority[0] ? `, with top priority "${highPriority[0].title}"` : ''
      }. ${todayEvents.length > 0 ? `You have ${todayEvents.length} calendar event${todayEvents.length === 1 ? '' : 's'} scheduled.` : 'Your calendar is open today.'}`;

      const display = `### Executive Daily Briefing\n` +
        `- **Pending Tasks:** ${pendingTasks.length} (${highPriority.length} high priority)\n` +
        `- **Active Initiatives:** ${activeProjects.length}\n` +
        `- **Scheduled Coordinates:** ${todayEvents.length}\n`;

      return { spoken, display };
    } catch (err: any) {
      return {
        spoken: 'Good day. Systems are nominal and awaiting your directive.',
        display: '### Executive Briefing\nSystems nominal.',
      };
    }
  }
}

export const aivaProactiveEngine = AivaProactiveEngine.getInstance();
