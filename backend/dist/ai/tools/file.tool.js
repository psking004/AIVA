"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var FileTool_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileTool = void 0;
/**
 * File Tool — Provides file management capabilities to agents
 */
const common_1 = require("@nestjs/common");
let FileTool = FileTool_1 = class FileTool {
    logger = new common_1.Logger(FileTool_1.name);
    async execute(userId, action, params = {}) {
        this.logger.log(`FileTool executing: ${action} for user ${userId}`);
        return { success: true, action, params };
    }
};
exports.FileTool = FileTool;
exports.FileTool = FileTool = FileTool_1 = __decorate([
    (0, common_1.Injectable)()
], FileTool);
//# sourceMappingURL=file.tool.js.map