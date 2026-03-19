"use strict";
/**
 * AIVA Root Module - Orchestrates all system modules
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const auth_module_1 = require("./modules/auth/auth.module");
const tasks_module_1 = require("./modules/tasks/tasks.module");
const notes_module_1 = require("./modules/notes/notes.module");
const files_module_1 = require("./modules/files/files.module");
const automation_module_1 = require("./modules/automation/automation.module");
const calendar_module_1 = require("./modules/calendar/calendar.module");
const email_module_1 = require("./modules/email/email.module");
const analytics_module_1 = require("./modules/analytics/analytics.module");
const ai_module_1 = require("./ai/ai.module");
const database_module_1 = require("./database/database.module");
const cache_module_1 = require("./cache/cache.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            // Configuration
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env.local', '.env'],
            }),
            // Rate limiting
            throttler_1.ThrottlerModule.forRoot([{
                    ttl: 60000,
                    limit: 100,
                }]),
            // Core modules
            database_module_1.DatabaseModule,
            cache_module_1.CacheModule,
            ai_module_1.AIModule,
            // Feature modules
            auth_module_1.AuthModule,
            tasks_module_1.TasksModule,
            notes_module_1.NotesModule,
            files_module_1.FilesModule,
            automation_module_1.AutomationModule,
            calendar_module_1.CalendarModule,
            email_module_1.EmailModule,
            analytics_module_1.AnalyticsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map