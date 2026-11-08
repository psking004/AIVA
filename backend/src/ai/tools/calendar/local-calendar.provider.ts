/**
 * Local Calendar Provider
 *
 * Implements CalendarProvider using the internal Prisma database.
 * Explicitly identifies all items as 'LOCAL' so AIVA never claims
 * a local Prisma record was created in Google Calendar.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  CalendarProvider,
  CalendarEventInput,
  CalendarEventUpdateInput,
  CalendarEventOutput,
  CalendarProviderStatus,
} from './calendar-provider.interface';

@Injectable()
export class LocalCalendarProvider implements CalendarProvider {
  readonly name = 'LOCAL' as const;
  private readonly logger = new Logger(LocalCalendarProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStatus(_userId: string): Promise<CalendarProviderStatus> {
    return {
      connected: true,
      provider: 'LOCAL',
      accountEmail: 'local@aiva.internal',
    };
  }

  async listEvents(
    userId: string,
    options?: { startTime?: Date; endTime?: Date; limit?: number },
  ): Promise<CalendarEventOutput[]> {
    const limit = options?.limit ?? 20;
    const where: any = { userId };

    if (options?.startTime || options?.endTime) {
      where.startTime = {};
      if (options.startTime) where.startTime.gte = options.startTime;
      if (options.endTime) where.startTime.lte = options.endTime;
    }

    const records = await this.prisma.calendarEvent.findMany({
      where,
      orderBy: { startTime: 'asc' },
      take: limit,
    });

    return records.map((e) => ({
      id: e.id,
      provider: 'LOCAL',
      title: e.title,
      description: e.description,
      location: e.location,
      startTime: e.startTime,
      endTime: e.endTime,
      isAllDay: e.isAllDay,
      attendees: e.attendees,
      meetingLink: e.meetingLink,
      status: e.status,
    }));
  }

  async getEvent(userId: string, eventId: string): Promise<CalendarEventOutput | null> {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, userId },
    });

    if (!event) return null;

    return {
      id: event.id,
      provider: 'LOCAL',
      title: event.title,
      description: event.description,
      location: event.location,
      startTime: event.startTime,
      endTime: event.endTime,
      isAllDay: event.isAllDay,
      attendees: event.attendees,
      meetingLink: event.meetingLink,
      status: event.status,
    };
  }

  async createEvent(userId: string, input: CalendarEventInput): Promise<CalendarEventOutput> {
    this.logger.log(`Creating local calendar event: "${input.title}" for user ${userId}`);

    const event = await this.prisma.calendarEvent.create({
      data: {
        userId,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        startTime: input.startTime,
        endTime: input.endTime,
        isAllDay: Boolean(input.isAllDay),
        attendees: input.attendees ?? [],
        meetingLink: input.meetingLink ?? null,
      },
    });

    return {
      id: event.id,
      provider: 'LOCAL',
      title: event.title,
      description: event.description,
      location: event.location,
      startTime: event.startTime,
      endTime: event.endTime,
      isAllDay: event.isAllDay,
      attendees: event.attendees,
      meetingLink: event.meetingLink,
      status: event.status,
    };
  }

  async updateEvent(
    userId: string,
    eventId: string,
    updates: CalendarEventUpdateInput,
  ): Promise<CalendarEventOutput> {
    this.logger.log(`Updating local calendar event ${eventId} for user ${userId}`);

    const data: any = {};
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.location !== undefined) data.location = updates.location;
    if (updates.startTime !== undefined) data.startTime = updates.startTime;
    if (updates.endTime !== undefined) data.endTime = updates.endTime;
    if (updates.isAllDay !== undefined) data.isAllDay = updates.isAllDay;
    if (updates.attendees !== undefined) data.attendees = updates.attendees;
    if (updates.meetingLink !== undefined) data.meetingLink = updates.meetingLink;

    const event = await this.prisma.calendarEvent.update({
      where: { id: eventId, userId },
      data,
    });

    return {
      id: event.id,
      provider: 'LOCAL',
      title: event.title,
      description: event.description,
      location: event.location,
      startTime: event.startTime,
      endTime: event.endTime,
      isAllDay: event.isAllDay,
      attendees: event.attendees,
      meetingLink: event.meetingLink,
      status: event.status,
    };
  }

  async deleteEvent(userId: string, eventId: string): Promise<boolean> {
    this.logger.log(`Deleting local calendar event ${eventId} for user ${userId}`);
    try {
      await this.prisma.calendarEvent.delete({
        where: { id: eventId, userId },
      });
      return true;
    } catch {
      return false;
    }
  }
}
