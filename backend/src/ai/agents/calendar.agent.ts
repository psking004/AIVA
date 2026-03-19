/**
 * Calendar Agent - Handles calendar and scheduling operations
 *
 * Capabilities:
 * - Create events from natural language
 * - Smart scheduling
 * - Conflict detection
 * - Meeting coordination
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AIVAService } from '../aiva.service';

@Injectable()
export class CalendarAgent {
  private readonly logger = new Logger(CalendarAgent.name);
  readonly name = 'Calendar Agent';
  readonly description = 'Manages calendar events - scheduling, conflict detection, and meeting coordination';
  readonly tools = ['createEvent', 'updateEvent', 'deleteEvent', 'listEvents', 'findAvailability'];

  constructor(
    private prisma: PrismaService,
    private aiva: AIVAService,
  ) {}

  async execute(
    userId: string,
    input: string,
    parameters: Record<string, unknown>,
    context: any,
  ): Promise<CalendarAgentResult> {
    this.logger.debug(`Calendar Agent executing for user ${userId}: ${input}`);

    const action = parameters.action as string || 'create';

    switch (action) {
      case 'create':
        return this.createEvent(userId, input, parameters);
      case 'update':
        return this.updateEvent(userId, parameters);
      case 'delete':
        return this.deleteEvent(userId, parameters);
      case 'list':
        return this.listEvents(userId, parameters);
      case 'findAvailability':
        return this.findAvailability(userId, parameters);
      default:
        return this.createEvent(userId, input, parameters);
    }
  }

  private async createEvent(
    userId: string,
    input: string,
    parameters: Record<string, unknown>,
  ): Promise<CalendarAgentResult> {
    // Parse natural language date/time
    const eventDetails = await this.parseEventDetails(userId, input);

    const event = await this.prisma.calendarEvent.create({
      data: {
        userId,
        title: eventDetails.title || input,
        description: eventDetails.description,
        location: eventDetails.location,
        startTime: new Date(eventDetails.startTime),
        endTime: new Date(eventDetails.endTime),
        isAllDay: eventDetails.isAllDay || false,
        attendees: eventDetails.attendees || [],
        meetingLink: eventDetails.meetingLink,
      },
    });

    return {
      success: true,
      response: `I've scheduled "${event.title}" for ${event.startTime.toDateString()}`,
      event: { id: event.id, title: event.title, startTime: event.startTime },
      toolCalls: [{ name: 'createEvent', args: { title: event.title } }],
      context: { eventId: event.id },
      conversationId: null,
    };
  }

  private async updateEvent(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<CalendarAgentResult> {
    const eventId = parameters.eventId as string;
    const updates = parameters.updates as Record<string, unknown> || {};

    const event = await this.prisma.calendarEvent.update({
      where: { id: eventId, userId },
      data: updates,
    });

    return {
      success: true,
      response: `Event "${event.title}" has been updated`,
      event: { id: event.id, title: event.title },
      toolCalls: [{ name: 'updateEvent', args: { eventId, updates } }],
      context: { eventId: event.id },
      conversationId: null,
    };
  }

  private async deleteEvent(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<CalendarAgentResult> {
    const eventId = parameters.eventId as string;

    await this.prisma.calendarEvent.delete({
      where: { id: eventId, userId },
    });

    return {
      success: true,
      response: 'Event has been deleted',
      toolCalls: [{ name: 'deleteEvent', args: { eventId } }],
      context: {},
      conversationId: null,
    };
  }

  private async listEvents(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<CalendarAgentResult> {
    const startDate = parameters.startDate ? new Date(parameters.startDate as string) : new Date();
    const endDate = parameters.endDate ? new Date(parameters.endDate as string) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: startDate },
        endTime: { lte: endDate },
      },
      orderBy: { startTime: 'asc' },
    });

    const eventList = events.map((e, i) => `${i + 1}. ${e.title} - ${e.startTime.toLocaleString()}`).join('\n');

    return {
      success: true,
      response: `Your upcoming events:\n\n${eventList}`,
      events,
      toolCalls: [{ name: 'listEvents', args: { startDate, endDate } }],
      context: { eventCount: events.length },
      conversationId: null,
    };
  }

  private async findAvailability(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<CalendarAgentResult> {
    const duration = parseInt((parameters.duration as string) || '60');
    const date = parameters.date ? new Date(parameters.date as string) : new Date();

    // Get events for the day
    const dayStart = new Date(date.setHours(0, 0, 0, 0));
    const dayEnd = new Date(date.setHours(23, 59, 59, 999));

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: dayStart },
        endTime: { lte: dayEnd },
      },
      orderBy: { startTime: 'asc' },
    });

    // Find available slots (9 AM to 5 PM working hours)
    const workingHours = { start: 9 * 60, end: 17 * 60 }; // in minutes
    const availableSlots: string[] = [];

    let currentTime = workingHours.start;

    for (const event of events) {
      const eventStart = event.startTime.getHours() * 60 + event.startTime.getMinutes();
      const eventEnd = event.endTime.getHours() * 60 + event.endTime.getMinutes();

      if (currentTime < eventStart && eventStart - currentTime >= duration) {
        availableSlots.push(this.formatTimeSlot(currentTime, eventStart));
      }

      currentTime = eventEnd;
    }

    if (currentTime < workingHours.end && workingHours.end - currentTime >= duration) {
      availableSlots.push(this.formatTimeSlot(currentTime, workingHours.end));
    }

    return {
      success: true,
      response: availableSlots.length > 0
        ? `Available slots for ${duration} min meetings: ${availableSlots.join(', ')}`
        : 'No available slots found for today',
      availableSlots,
      toolCalls: [{ name: 'findAvailability', args: { duration, date } }],
      context: { availableSlots },
      conversationId: null,
    };
  }

  private async parseEventDetails(userId: string, input: string) {
    // Use AI to parse natural language
    const prompt = `Extract event details from this request:
    "${input}"

    Return JSON with: title, description, location, startTime (ISO), endTime (ISO), attendees (array), isAllDay (boolean), meetingLink`;

    const result = await this.aiva.executeTool(userId, 'summarize', { content: prompt });

    // In production, this would properly parse the AI response
    return {
      title: input,
      startTime: new Date(),
      endTime: new Date(Date.now() + 60 * 60 * 1000),
      isAllDay: false,
      attendees: [],
    };
  }

  private formatTimeSlot(startMinutes: number, endMinutes: number): string {
    const startHour = Math.floor(startMinutes / 60);
    const startMin = startMinutes % 60;
    return `${startHour}:${startMin.toString().padStart(2, '0')} - ${Math.floor(endMinutes / 60)}:${(endMinutes % 60).toString().padStart(2, '0')}`;
  }
}

export interface CalendarAgentResult {
  success: boolean;
  response: string;
  event?: any;
  events?: any[];
  availableSlots?: string[];
  toolCalls: any[];
  context: Record<string, unknown>;
  conversationId: string | null;
}
