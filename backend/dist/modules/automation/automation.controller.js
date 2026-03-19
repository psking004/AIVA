"use strict";
/**
 * AutomationController - Automation HTTP endpoints
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
exports.AutomationController = void 0;
const common_1 = require("@nestjs/common");
const automation_service_1 = require("./automation.service");
let AutomationController = class AutomationController {
    automationService;
    constructor(automationService) {
        this.automationService = automationService;
    }
    async create(auth, body) {
        const userId = this.extractUserId(auth);
        return this.automationService.create(userId, body);
    }
    async findAll(auth, active) {
        const userId = this.extractUserId(auth);
        return this.automationService.findAll(userId, active !== 'false');
    }
    async findOne(auth, id) {
        const userId = this.extractUserId(auth);
        return this.automationService.findOne(userId, id);
    }
    async update(auth, id, body) {
        const userId = this.extractUserId(auth);
        return this.automationService.update(userId, id, body);
    }
    async activate(auth, id) {
        const userId = this.extractUserId(auth);
        return this.automationService.activate(userId, id);
    }
    async deactivate(auth, id) {
        const userId = this.extractUserId(auth);
        return this.automationService.deactivate(userId, id);
    }
    async trigger(auth, id) {
        const userId = this.extractUserId(auth);
        return this.automationService.trigger(userId, id);
    }
    async remove(auth, id) {
        const userId = this.extractUserId(auth);
        return this.automationService.remove(userId, id);
    }
    extractUserId(auth) {
        return 'user-id';
    }
};
exports.AutomationController = AutomationController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AutomationController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, Query('active')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AutomationController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AutomationController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], AutomationController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/activate'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AutomationController.prototype, "activate", null);
__decorate([
    (0, common_1.Post)(':id/deactivate'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AutomationController.prototype, "deactivate", null);
__decorate([
    (0, common_1.Post)(':id/trigger'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AutomationController.prototype, "trigger", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AutomationController.prototype, "remove", null);
exports.AutomationController = AutomationController = __decorate([
    (0, common_1.Controller)('automation'),
    __metadata("design:paramtypes", [automation_service_1.AutomationService])
], AutomationController);
//# sourceMappingURL=automation.controller.js.map