"use strict";
/**
 * CalendarController - Calendar HTTP endpoints
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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarController = void 0;
const common_1 = require("@nestjs/common");
const calendar_service_1 = require("./calendar.service");
let CalendarController = class CalendarController {
    calendarService;
    constructor(calendarService) {
        this.calendarService = calendarService;
    }
    async create(auth, body) {
        const userId = this.extractUserId(auth);
        return this.calendarService.create(userId, body);
    }
    async findAll(auth, filters) {
        const userId = this.extractUserId(auth);
        return this.calendarService.findAll(userId, filters);
    }
    async findOne(auth, id) {
        const userId = this.extractUserId(auth);
        return this.calendarService.findOne(userId, id);
    }
    async update(auth, id, body) {
        const userId = this.extractUserId(auth);
        return this.calendarService.update(userId, id, body);
    }
    async remove(auth, id) {
        const userId = this.extractUserId(auth);
        return this.calendarService.remove(userId, id);
    }
    async availability(auth, date, duration) {
        const userId = this.extractUserId(auth);
        return this.calendarService.findAvailability(userId, date, parseInt(duration));
    }
    extractUserId(auth) {
        return 'user-id';
    }
};
exports.CalendarController = CalendarController;
__decorate([
    (0, common_1.Post)('events'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CalendarController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('events'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CalendarController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('events/:id'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CalendarController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)('events/:id'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], CalendarController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('events/:id'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CalendarController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('availability'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Query)('date')),
    __param(2, (0, common_1.Query)('duration')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], CalendarController.prototype, "availability", null);
exports.CalendarController = CalendarController = __decorate([
    (0, common_1.Controller)('calendar'),
    __metadata("design:paramtypes", [calendar_service_1.CalendarService])
], CalendarController);
//# sourceMappingURL=calendar.controller.js.map