"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TaskTool_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskTool = void 0;
/**
 * Task Tool — Provides task management capabilities to agents
 */
const common_1 = require("@nestjs/common");
let TaskTool = TaskTool_1 = class TaskTool {
    logger = new common_1.Logger(TaskTool_1.name);
    async execute(userId, action, params = {}) {
        this.logger.log(`TaskTool executing: ${action} for user ${userId}`);
        return { success: true, action, params };
    }
};
exports.TaskTool = TaskTool;
exports.TaskTool = TaskTool = TaskTool_1 = __decorate([
    (0, common_1.Injectable)()
], TaskTool);
//# sourceMappingURL=task.tool.js.map