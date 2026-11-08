/**
 * AIVA Unified Calendar Tool
 *
 * Coordinates calendar operations across LocalCalendarProvider (Prisma DB)
 * and GoogleCalendarProvider (Real Google Calendar REST API v3).
 * Explicitly states the provider for every action so local records are never
 * misattributed to Google Calendar.
 */

import { Injectable, Logger } from '@nestjs/common';
import { LocalCalendarProvider } from './calendar/local-calendar.provider';
import { GoogleCalendarProvider } from './calendar/google-calendar.provider';
import { CalendarProvider } from './calendar/calendar-provider.interface';

@Injectable()
export class CalendarTool {
  private readonly logger = new Logger(CalendarTool.name);

  constructor(
    private readonly localProvider: LocalCalendarProvider,
    private readonly googleProvider: GoogleCalendarProvider,
  ) {}

  private async resolveProvider(userId: string, requested?: unknown): Promise<CalendarProvider> {
    const req = String(requested || '').toLowerCase();
    if (req === 'google') {
      return this.googleProvider;
    }
    if (req === 'local') {
      return this.localProvider;
    }

    // Auto selection: prefer Google if connected, otherwise Local
    const googleStatus = await this.googleProvider.getStatus(userId);
    if (googleStatus.connected) {
      return this.googleProvider;
    }
    return this.localProvider;
  }

  async execute(userId: string, action: string, params: Record<string, unknown> = {}) {
    this.logger.log(`CalendarTool executing: ${action} for user ${userId} (target: ${params.provider || 'auto'})`);

    if (action === 'status') {
      const [localStatus, googleStatus] = await Promise.all([
        this.localProvider.getStatus(userId),
        this.googleProvider.getStatus(userId),
      ]);
      return {
        success: true,
        action,
        providers: {
          local: localStatus,
          google: googleStatus,
        },
      };
    }

    const provider = await this.resolveProvider(userId, params.provider);

    switch (action) {
      case 'create': {
        const title = String(params.title || params.input || 'New Event');
        const startTime = params.startTime ? new Date(params.startTime as string) : new Date();
        const endTime = params.endTime
          ? new Date(params.endTime as string)
          : new Date(startTime.getTime() + 3600000);

        const event = await provider.createEvent(userId, {
          title,
          description: params.description ? String(params.description) : null,
          location: params.location ? String(params.location) : null,
          startTime,
          endTime,
          isAllDay: Boolean(params.isAllDay),
          attendees: Array.isArray(params.attendees) ? (params.attendees as string[]) : [],
          meetingLink: params.meetingLink ? String(params.meetingLink) : null,
          timeZone: params.timeZone ? String(params.timeZone) : undefined,
        });

        return {
          success: true,
          action,
          provider: provider.name,
          message:
            provider.name === 'GOOGLE'
              ? `Event created in Google Calendar: "${event.title}"`
              : `Event created in AIVA local calendar: "${event.title}"`,
          event,
        };
      }

      case 'list': {
        const limit = typeof params.limit === 'number' ? params.limit : 20;
        const startTime = params.startTime ? new Date(params.startTime as string) : undefined;
        const endTime = params.endTime ? new Date(params.endTime as string) : undefined;

        const events = await provider.listEvents(userId, { startTime, endTime, limit });
        return {
          success: true,
          action,
          provider: provider.name,
          count: events.length,
          events,
        };
      }

      case 'get': {
        const eventId = String(params.eventId || params.id || '');
        const event = await provider.getEvent(userId, eventId);
        if (!event) {
          return { success: false, action, provider: provider.name, error: `Event not found: ${eventId}` };
        }
        return { success: true, action, provider: provider.name, event };
      }

      case 'update': {
        const eventId = String(params.eventId || params.id || '');
        const updates = (params.updates as Record<string, unknown>) || params;
        const event = await provider.updateEvent(userId, eventId, {
          title: updates.title ? String(updates.title) : undefined,
          description: updates.description !== undefined ? String(updates.description) : undefined,
          location: updates.location !== undefined ? String(updates.location) : undefined,
          startTime: updates.startTime ? new Date(updates.startTime as string) : undefined,
          endTime: updates.endTime ? new Date(updates.endTime as string) : undefined,
          isAllDay: updates.isAllDay !== undefined ? Boolean(updates.isAllDay) : undefined,
          attendees: Array.isArray(updates.attendees) ? (updates.attendees as string[]) : undefined,
        });
        return { success: true, action, provider: provider.name, event };
      }

      case 'delete': {
        const eventId = String(params.eventId || params.id || '');
        const deleted = await provider.deleteEvent(userId, eventId);
        return { success: deleted, action, provider: provider.name, eventId };
      }

      default:
        return { success: false, action, error: `Unsupported calendar action: ${action}` };
    }
  }
}
