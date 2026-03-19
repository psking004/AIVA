"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var SearchTool_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchTool = void 0;
/**
 * Search Tool — Provides search / web lookup capabilities to agents
 */
const common_1 = require("@nestjs/common");
let SearchTool = SearchTool_1 = class SearchTool {
    logger = new common_1.Logger(SearchTool_1.name);
    async execute(userId, query, params = {}) {
        this.logger.log(`SearchTool executing: "${query}" for user ${userId}`);
        return { success: true, query, params, results: [] };
    }
};
exports.SearchTool = SearchTool;
exports.SearchTool = SearchTool = SearchTool_1 = __decorate([
    (0, common_1.Injectable)()
], SearchTool);
//# sourceMappingURL=search.tool.js.map