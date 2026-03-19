"use strict";
/**
 * CalendarService - Calendar events CRUD
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
let CalendarService = class CalendarService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(userId, data) {
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
    async findAll(userId, filters = {}) {
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
    async findOne(userId, id) {
        return this.prisma.calendarEvent.findFirst({
            where: { id, userId },
        });
    }
    async update(userId, id, data) {
        return this.prisma.calendarEvent.update({
            where: { id, userId },
            data,
        });
    }
    async remove(userId, id) {
        return this.prisma.calendarEvent.delete({
            where: { id, userId },
        });
    }
    async findAvailability(userId, date, durationMinutes) {
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
        const slots = [];
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
    formatTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}:${mins.toString().padStart(2, '0')}`;
    }
};
exports.CalendarService = CalendarService;
exports.CalendarService = CalendarService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CalendarService);
//# sourceMappingURL=calendar.service.js.map