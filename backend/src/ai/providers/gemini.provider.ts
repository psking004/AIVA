/**
 * Google Gemini Provider
 *
 * Provides cloud AI acceleration and fallback via official Google Gemini API (REST v1beta).
 * Default model: gemini-1.5-flash / configurable via GEMINI_MODEL.
 *
 * Implements:
 * - Text completion and multi-turn chat
 * - Server-Sent Events (SSE) streaming
 * - System instructions and generation configurations
 * - Multimodal attachment readiness (images/audio/documents)
 * - Error handling for auth, quota/rate limits, timeouts, and network failures
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  AIMessage,
  CompletionOptions,
  ProviderResponse,
  ProviderHealth,
} from './ai-provider.interface';

@Injectable()
export class GeminiProvider implements AIProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  readonly name = 'gemini';

  constructor(private readonly configService: ConfigService) {}

  get apiKey(): string {
    return this.configService.get<string>('GEMINI_API_KEY') || '';
  }

  get defaultModel(): string {
    return this.configService.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';
  }

  get timeoutMs(): number {
    const configured = this.configService.get<string>('GEMINI_TIMEOUT_MS');
    return configured ? parseInt(configured, 10) : 45000;
  }

  private get baseUrl(): string {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }

  /**
   * Convert AIVA messages to Gemini contents and systemInstruction
   */
  private formatMessages(messages: AIMessage[]): {
    contents: any[];
    systemInstruction?: { parts: Array<{ text: string }> } | undefined;
  } {
    const systemParts: string[] = [];
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        if (msg.content) {
          systemParts.push(msg.content);
        }
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: any[] = [];

      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          if (att.data) {
            parts.push({
              inlineData: {
                mimeType: att.mimeType,
                data: att.data.replace(/^data:[^;]+;base64,/, ''),
              },
            });
          }
        }
      }

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return {
      contents: contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: 'Hello' }] }],
      systemInstruction:
        systemParts.length > 0
          ? { parts: systemParts.map((text) => ({ text })) }
          : undefined,
    };
  }

  /**
   * Chat completion via Gemini API
   */
  async chat(
    messages: AIMessage[],
    options?: CompletionOptions,
  ): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Gemini API key is not configured. Set GEMINI_API_KEY in server environment.',
      );
    }

    const model = this.defaultModel;
    const timeout = options?.timeoutMs || this.timeoutMs;
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

    this.logger.debug(`Calling Gemini API for model ${model}`);

    const { contents, systemInstruction } = this.formatMessages(messages);

    const body: Record<string, any> = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 4096,
        topP: options?.topP ?? 0.9,
        stopSequences: options?.stop,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        await this.handleHttpError(response);
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
          finishReason?: string;
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };

      const parts = data.candidates?.[0]?.content?.parts || [];
      const content = parts.map((p) => p.text || '').join('');

      const result: ProviderResponse = {
        content,
        model,
        provider: this.name,
      };

      if (data.usageMetadata) {
        result.usage = {
          promptTokens: data.usageMetadata.promptTokenCount || 0,
          completionTokens: data.usageMetadata.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata.totalTokenCount || 0,
        };
      }

      return result;
    } catch (error: any) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        this.logger.warn(`Gemini request timed out after ${timeout}ms`);
        throw new Error(`Gemini request timed out after ${timeout}ms`);
      }
      this.logger.error(`Gemini chat error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Single prompt completion
   */
  async complete(
    prompt: string,
    options?: CompletionOptions,
  ): Promise<ProviderResponse> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  /**
   * Streaming completion via Gemini Server-Sent Events (SSE)
   */
  async streamChat(
    messages: AIMessage[],
    onChunk: (chunk: string) => void,
    options?: CompletionOptions,
  ): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Gemini API key is not configured. Set GEMINI_API_KEY in server environment.',
      );
    }

    const model = this.defaultModel;
    const timeout = options?.timeoutMs || this.timeoutMs;
    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const { contents, systemInstruction } = this.formatMessages(messages);

    const body: Record<string, any> = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 4096,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        await this.handleHttpError(response);
      }

      if (!response.body) {
        throw new Error('No response body returned from Gemini stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const parts = parsed.candidates?.[0]?.content?.parts || [];
              const textChunk = parts.map((p: any) => p.text || '').join('');
              if (textChunk) {
                fullContent += textChunk;
                onChunk(textChunk);
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }

      return {
        content: fullContent,
        model,
        provider: this.name,
      };
    } catch (error: any) {
      this.logger.error(`Gemini stream failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Health check for Gemini
   */
  async checkHealth(): Promise<ProviderHealth> {
    const start = Date.now();
    const model = this.defaultModel;

    if (!this.apiKey) {
      return {
        isAvailable: false,
        provider: this.name,
        model,
        latencyMs: 0,
        error: 'GEMINI_API_KEY not configured',
      };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${model}?key=${this.apiKey}`,
        {
          signal: AbortSignal.timeout(4000),
        },
      );

      if (!response.ok) {
        return {
          isAvailable: false,
          provider: this.name,
          model,
          latencyMs: Date.now() - start,
          error: `Gemini API returned status ${response.status}`,
        };
      }

      return {
        isAvailable: true,
        provider: this.name,
        model,
        latencyMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        isAvailable: false,
        provider: this.name,
        model,
        latencyMs: Date.now() - start,
        error: error.message || 'Gemini health check failed',
      };
    }
  }

  private async handleHttpError(response: Response): Promise<never> {
    const errorText = await response.text().catch(() => '');
    const status = response.status;

    if (status === 400) {
      throw new Error(`Gemini invalid request: ${errorText || response.statusText}`);
    }
    if (status === 401 || status === 403) {
      throw new Error('Gemini authentication failed: Invalid or unauthorized API key');
    }
    if (status === 429) {
      throw new Error('Gemini rate limit or quota exceeded: Please try again shortly');
    }
    if (status >= 500) {
      throw new Error(`Gemini upstream service error (${status}): ${errorText || response.statusText}`);
    }

    throw new Error(`Gemini API error (${status}): ${errorText || response.statusText}`);
  }
}
