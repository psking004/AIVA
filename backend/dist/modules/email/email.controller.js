"use strict";
/**
 * EmailController - Email HTTP endpoints
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
exports.EmailController = void 0;
const common_1 = require("@nestjs/common");
const email_service_1 = require("./email.service");
let EmailController = class EmailController {
    emailService;
    constructor(emailService) {
        this.emailService = emailService;
    }
    async connect(auth, body) {
        const userId = this.extractUserId(auth);
        return this.emailService.connectAccount(userId, body);
    }
    async getAccounts(auth) {
        const userId = this.extractUserId(auth);
        return this.emailService.getAccounts(userId);
    }
    async getMessages(auth, filters) {
        const userId = this.extractUserId(auth);
        const account = await this.emailService.getAccounts(userId).then(a => a[0]);
        if (!account)
            return { error: 'No email account connected' };
        return this.emailService.getEmails(account.id, filters);
    }
    async markAsRead(auth, id) {
        const userId = this.extractUserId(auth);
        return this.emailService.markAsRead(userId, id);
    }
    async markAsStarred(auth, id) {
        const userId = this.extractUserId(auth);
        return this.emailService.markAsStarred(userId, id);
    }
    async deleteEmail(auth, id) {
        const userId = this.extractUserId(auth);
        return this.emailService.deleteEmail(userId, id);
    }
    extractUserId(auth) {
        return 'user-id';
    }
};
exports.EmailController = EmailController;
__decorate([
    (0, common_1.Post)('connect'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "connect", null);
__decorate([
    (0, common_1.Get)('accounts'),
    __param(0, (0, common_1.Headers)('authorization')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "getAccounts", null);
__decorate([
    (0, common_1.Get)('messages'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Post)('messages/:id/read'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "markAsRead", null);
__decorate([
    (0, common_1.Post)('messages/:id/star'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "markAsStarred", null);
__decorate([
    (0, common_1.Delete)('messages/:id'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "deleteEmail", null);
exports.EmailController = EmailController = __decorate([
    (0, common_1.Controller)('email'),
    __metadata("design:paramtypes", [email_service_1.EmailService])
], EmailController);
//# sourceMappingURL=email.controller.js.map