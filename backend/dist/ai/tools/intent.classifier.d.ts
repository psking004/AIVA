/**
 * Intent Classifier - Classifies user intent and routes to appropriate agent
 *
 * Uses pattern matching and LLM-based classification to determine:
 * - What type of request the user is making
 * - Which agent should handle it
 * - What parameters need to be extracted
 */
export declare class IntentClassifier {
    private readonly logger;
    private readonly intentPatterns;
    /**
     * Classify user intent from message
     */
    classify(message: string, context?: any): Promise<ClassifiedIntent>;
    /**
     * Rule-based classification using patterns
     */
    private classifyByPatterns;
    /**
     * Extract parameters from message based on intent type
     */
    private extractParameters;
    /**
     * LLM-based classification for ambiguous messages
     * In production, would call LLM to classify
     */
    private classifyByLLM;
    /**
     * Get all available intent types
     */
    getAvailableIntents(): IntentInfo[];
}
export interface ClassifiedIntent {
    type: string;
    agentType: string | null;
    confidence: number;
    requiresAgent: boolean;
    parameters: Record<string, unknown>;
}
export interface IntentInfo {
    type: string;
    agent: string;
    patternCount: number;
}
//# sourceMappingURL=intent.classifier.d.ts.map