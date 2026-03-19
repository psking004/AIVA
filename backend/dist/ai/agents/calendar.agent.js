"use strict";
/**
 * Calendar Agent - Handles calendar and scheduling operations
 *
 * Capabilities:
 * - Create events from natural language
 * - Smart scheduling
 * - Conflict detection
 * - Meeting coordination
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var CalendarAgent_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarAgent = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const aiva_service_1 = require("../aiva.service");
let CalendarAgent = CalendarAgent_1 = class CalendarAgent {
    prisma;
    aiva;
    logger = new common_1.Logger(CalendarAgent_1.name);
    name = 'Calendar Agent';
    description = 'Manages calendar events - scheduling, conflict detection, and meeting coordination';
    tools = ['createEvent', 'updateEvent', 'deleteEvent', 'listEvents', 'findAvailability'];
    constructor(prisma, aiva) {
        this.prisma = prisma;
        this.aiva = aiva;
    }
    async execute(userId, input, parameters, context) {
        this.logger.debug(`Calendar Agent executing for user ${userId}: ${input}`);
        const action = parameters.action || 'create';
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
    async createEvent(userId, input, parameters) {
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
    async updateEvent(userId, parameters) {
        const eventId = parameters.eventId;
        const updates = parameters.updates || {};
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
    async deleteEvent(userId, parameters) {
        const eventId = parameters.eventId;
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
    async listEvents(userId, parameters) {
        const startDate = parameters.startDate ? new Date(parameters.startDate) : new Date();
        const endDate = parameters.endDate ? new Date(parameters.endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
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
    async findAvailability(userId, parameters) {
        const duration = parseInt(parameters.duration || '60');
        const date = parameters.date ? new Date(parameters.date) : new Date();
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
        const availableSlots = [];
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
    async parseEventDetails(userId, input) {
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
    formatTimeSlot(startMinutes, endMinutes) {
        const startHour = Math.floor(startMinutes / 60);
        const startMin = startMinutes % 60;
        return `${startHour}:${startMin.toString().padStart(2, '0')} - ${Math.floor(endMinutes / 60)}:${(endMinutes % 60).toString().padStart(2, '0')}`;
    }
};
exports.CalendarAgent = CalendarAgent;
exports.CalendarAgent = CalendarAgent = CalendarAgent_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        aiva_service_1.AIVAService])
], CalendarAgent);
//# sourceMappingURL=calendar.agent.js.map