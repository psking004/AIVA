"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EmailTool_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailTool = void 0;
/**
 * Email Tool — Provides email integration capabilities to agents
 */
const common_1 = require("@nestjs/common");
let EmailTool = EmailTool_1 = class EmailTool {
    logger = new common_1.Logger(EmailTool_1.name);
    async execute(userId, action, params = {}) {
        this.logger.log(`EmailTool executing: ${action} for user ${userId}`);
        return { success: true, action, params };
    }
};
exports.EmailTool = EmailTool;
exports.EmailTool = EmailTool = EmailTool_1 = __decorate([
    (0, common_1.Injectable)()
], EmailTool);
//# sourceMappingURL=email.tool.js.map