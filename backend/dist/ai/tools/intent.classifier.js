"use strict";
/**
 * Intent Classifier - Classifies user intent and routes to appropriate agent
 *
 * Uses pattern matching and LLM-based classification to determine:
 * - What type of request the user is making
 * - Which agent should handle it
 * - What parameters need to be extracted
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var IntentClassifier_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntentClassifier = void 0;
const common_1 = require("@nestjs/common");
let IntentClassifier = IntentClassifier_1 = class IntentClassifier {
    logger = new common_1.Logger(IntentClassifier_1.name);
    // Intent patterns for rule-based classification
    intentPatterns = {
        task: {
            patterns: [
                /create (?:a )?task/i,
                /add (?:a )?todo/i,
                /remind me to/i,
                /i need to/i,
                /don't forget to/i,
                /schedule task/i,
                /set up task/i,
                /my tasks?/i,
                /pending tasks?/i,
                /todo list/i,
            ],
            agent: 'task',
        },
        calendar: {
            patterns: [
                /schedule (?:a )?meeting/i,
                /create event/i,
                /add to calendar/i,
                /do you have any events?/i,
                /am i free/i,
                /check availability/i,
                /find availability/i,
                /when am i busy/i,
                /upcoming events?/i,
                /calendar/i,
            ],
            agent: 'calendar',
        },
        email: {
            patterns: [
                /check (?:my )?emails?/i,
                /summarize emails?/i,
                /unread emails?/i,
                /new emails?/i,
                /inbox/i,
                /email from/i,
                /did i get an email/i,
                /read my emails?/i,
            ],
            agent: 'email',
        },
        research: {
            patterns: [
                /search for/i,
                /find information/i,
                /look up/i,
                /research/i,
                /what do i know about/i,
                /show me (?:my )?notes?/i,
                /where did i save/i,
                /find document/i,
                /knowledge base/i,
            ],
            agent: 'research',
        },
        automation: {
            patterns: [
                /automate/i,
                /create rule/i,
                /set up automation/i,
                /whenever/i,
                /always (?:do )?when/i,
                /trigger when/i,
                /workflow/i,
                /auto (?:create|send|add)/i,
            ],
            agent: 'automation',
        },
    };
    /**
     * Classify user intent from message
     */
    async classify(message, context) {
        this.logger.debug(`Classifying intent for: "${message.substring(0, 100)}"`);
        // Try rule-based classification first (fast)
        const ruleBased = this.classifyByPatterns(message);
        if (ruleBased && ruleBased.confidence > 0.7) {
            return ruleBased;
        }
        // Fall back to LLM-based classification for ambiguous cases
        return this.classifyByLLM(message, context);
    }
    /**
     * Rule-based classification using patterns
     */
    classifyByPatterns(message) {
        let bestMatch = null;
        for (const [intentType, config] of Object.entries(this.intentPatterns)) {
            for (const pattern of config.patterns) {
                if (pattern.test(message)) {
                    const confidence = 0.8; // Base confidence for pattern match
                    if (!bestMatch || confidence > bestMatch.confidence) {
                        bestMatch = { agent: config.agent, confidence };
                    }
                }
            }
        }
        if (bestMatch) {
            return {
                type: bestMatch.agent,
                agentType: bestMatch.agent,
                confidence: bestMatch.confidence,
                requiresAgent: true,
                parameters: this.extractParameters(message, bestMatch.agent),
            };
        }
        return null;
    }
    /**
     * Extract parameters from message based on intent type
     */
    extractParameters(message, agentType) {
        const params = {};
        // Task parameters
        if (agentType === 'task') {
            params.action = 'create';
            // Extract priority
            const priorityMatch = message.match(/(?:urgent|high priority|asap)/i);
            if (priorityMatch)
                params.priority = 'HIGH';
            // Extract due date references
            if (/tomorrow/i.test(message))
                params.dueDate = 'tomorrow';
            if (/next week/i.test(message))
                params.dueDate = 'next_week';
            if (/today/i.test(message))
                params.dueDate = 'today';
        }
        // Calendar parameters
        if (agentType === 'calendar') {
            params.action = /create|schedule|add/.test(message) ? 'create' : 'list';
            // Extract time references
            const timeMatch = message.match(/at (\d+(?::\d+)?\s*(?:am|pm)?)/i);
            if (timeMatch)
                params.time = timeMatch[1];
            const dateMatch = message.match(/(tomorrow|next week|on \w+)/i);
            if (dateMatch)
                params.date = dateMatch[1];
        }
        // Email parameters
        if (agentType === 'email') {
            params.action = /summarize|check|show/.test(message) ? 'summarize' : 'list';
            params.unreadOnly = /unread|new/i.test(message);
        }
        return params;
    }
    /**
     * LLM-based classification for ambiguous messages
     * In production, would call LLM to classify
     */
    classifyByLLM(message, context) {
        // Heuristic fallback for general messages
        const lowerMessage = message.toLowerCase();
        // Question detection
        if (message.includes('?')) {
            if (lowerMessage.includes('task') || lowerMessage.includes('todo')) {
                return {
                    type: 'task',
                    agentType: 'task',
                    confidence: 0.6,
                    requiresAgent: true,
                    parameters: { action: 'list' },
                };
            }
            if (lowerMessage.includes('event') || lowerMessage.includes('meeting')) {
                return {
                    type: 'calendar',
                    agentType: 'calendar',
                    confidence: 0.6,
                    requiresAgent: true,
                    parameters: { action: 'list' },
                };
            }
        }
        // Default: general conversation (no agent routing)
        return {
            type: 'general',
            agentType: null,
            confidence: 0.5,
            requiresAgent: false,
            parameters: {},
        };
    }
    /**
     * Get all available intent types
     */
    getAvailableIntents() {
        return Object.entries(this.intentPatterns).map(([type, config]) => ({
            type,
            agent: config.agent,
            patternCount: config.patterns.length,
        }));
    }
};
exports.IntentClassifier = IntentClassifier;
exports.IntentClassifier = IntentClassifier = IntentClassifier_1 = __decorate([
    (0, common_1.Injectable)()
], IntentClassifier);
//# sourceMappingURL=intent.classifier.js.map