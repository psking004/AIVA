/**
 * AI Provider Interface
 *
 * Central abstraction for all underlying LLM providers:
 * 1. LOCAL: Ollama (Qwen3 8B)
 * 2. CLOUD: OpenRouter (Qwen)
 * 3. CLOUD: Google Gemini API (Gemini)
 *
 * AIVA orchestrates calls strictly through this abstraction.
 */

export interface AIMessageAttachment {
  type: 'image' | 'audio' | 'document';
  mimeType: string;
  data: string; // Base64 or URL
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  attachments?: AIMessageAttachment[];
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  streaming?: boolean;
  stop?: string[];
  timeoutMs?: number;
}

export interface ProviderResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}

export interface ProviderHealth {
  isAvailable: boolean;
  provider: string;
  model: string;
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface AIProvider {
  /**
   * Unique identifier of the provider (e.g., 'ollama-qwen', 'openrouter-qwen', 'gemini')
   */
  readonly name: string;

  /**
   * Default model identifier used by the provider
   */
  readonly defaultModel: string;

  /**
   * Execute chat completion
   */
  chat(messages: AIMessage[], options?: CompletionOptions): Promise<ProviderResponse>;

  /**
   * Execute single text completion / prompt
   */
  complete(prompt: string, options?: CompletionOptions): Promise<ProviderResponse>;

  /**
   * Stream chat completion chunks
   */
  streamChat?(
    messages: AIMessage[],
    onChunk: (chunk: string) => void,
    options?: CompletionOptions,
  ): Promise<ProviderResponse>;

  /**
   * Check provider health and connectivity
   */
  checkHealth(): Promise<ProviderHealth>;
}
