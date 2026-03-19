/**
 * CalendarService - Calendar events CRUD
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: CreateEventDto) {
    return this.prisma.calendarEvent.create({
      data: {
        userId,
        title: data.title,
        description: data.description,
        location: data.location,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        isAllDay: data.isAllDay || false,
        attendees: data.attendees || [],
        meetingLink: data.meetingLink,
        visibility: data.visibility || 'PRIVATE',
      },
    });
  }

  async findAll(userId: string, filters: CalendarFilters = {}) {
    const start = filters.startDate ? new Date(filters.startDate) : new Date();
    const end = filters.endDate ? new Date(filters.endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return this.prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: start },
        endTime: { lte: end },
        status: filters.status,
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    return this.prisma.calendarEvent.findFirst({
      where: { id, userId },
    });
  }

  async update(userId: string, id: string, data: UpdateEventDto) {
    return this.prisma.calendarEvent.update({
      where: { id, userId },
      data,
    });
  }

  async remove(userId: string, id: string) {
    return this.prisma.calendarEvent.delete({
      where: { id, userId },
    });
  }

  async findAvailability(userId: string, date: string, durationMinutes: number) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: dayStart },
        endTime: { lte: dayEnd },
      },
      orderBy: { startTime: 'asc' },
    });

    // Calculate available slots
    const slots: Array<{ start: string; end: string }> = [];
    const workingHours = { start: 9 * 60, end: 17 * 60 };

    let currentMinutes = workingHours.start;
    for (const event of events) {
      const eventStart = event.startTime.getHours() * 60 + event.startTime.getMinutes();
      if (currentMinutes < eventStart && eventStart - currentMinutes >= durationMinutes) {
        slots.push({
          start: this.formatTime(currentMinutes),
          end: this.formatTime(eventStart),
        });
      }
      currentMinutes = event.endTime.getHours() * 60 + event.endTime.getMinutes();
    }

    if (currentMinutes < workingHours.end && workingHours.end - currentMinutes >= durationMinutes) {
      slots.push({
        start: this.formatTime(currentMinutes),
        end: this.formatTime(workingHours.end),
      });
    }

    return slots;
  }

  private formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}`;
  }
}

interface CreateEventDto {
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  isAllDay?: boolean;
  attendees?: string[];
  meetingLink?: string;
  visibility?: 'PRIVATE' | 'PUBLIC' | 'INTERNAL';
}

interface CalendarFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
}

interface UpdateEventDto {
  title?: string;
  description?: string;
  location?: string;
  startTime?: Date;
  endTime?: Date;
  isAllDay?: boolean;
  attendees?: string[];
  meetingLink?: string;
  status?: string;
  visibility?: string;
}
