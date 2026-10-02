/**
 * OpenRouter Provider (Qwen Cloud Models)
 *
 * Provides cloud AI acceleration and fallback via OpenRouter OpenAI-compatible API.
 * Default model: Qwen 2.5 72B Instruct / customizable via OPENROUTER_MODEL.
 *
 * Implements robust error handling (401, 402, 403, 408, 429, 5xx), streaming,
 * and never exposes API credentials.
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
export class OpenRouterProvider implements AIProvider {
  private readonly logger = new Logger(OpenRouterProvider.name);
  readonly name = 'openrouter-qwen';

  constructor(private readonly configService: ConfigService) {}

  get apiKey(): string {
    return this.configService.get<string>('OPENROUTER_API_KEY') || '';
  }

  get baseUrl(): string {
    return (
      this.configService.get<string>('OPENROUTER_BASE_URL') ||
      'https://openrouter.ai/api/v1'
    ).replace(/\/+$/, '');
  }

  get defaultModel(): string {
    return (
      this.configService.get<string>('OPENROUTER_MODEL') ||
      'qwen/qwen-2.5-72b-instruct'
    );
  }

  get timeoutMs(): number {
    const configured = this.configService.get<string>('OPENROUTER_TIMEOUT_MS');
    return configured ? parseInt(configured, 10) : 45000;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'HTTP-Referer': 'https://aiva.local',
      'X-Title': 'AIVA Personal Assistant',
    };
  }

  /**
   * Chat completion via OpenRouter API
   */
  async chat(
    messages: AIMessage[],
    options?: CompletionOptions,
  ): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'OpenRouter API key is not configured. Set OPENROUTER_API_KEY in server environment.',
      );
    }

    const model = this.defaultModel;
    const timeout = options?.timeoutMs || this.timeoutMs;
    const url = `${this.baseUrl}/chat/completions`;

    this.logger.debug(`Calling OpenRouter API at ${url} with model ${model}`);

    const body = {
      model,
      messages: messages.map((m) => {
        if (m.attachments && m.attachments.length > 0) {
          const contentParts: any[] = [{ type: 'text', text: m.content }];
          for (const att of m.attachments) {
            if (att.type === 'image') {
              contentParts.push({
                type: 'image_url',
                image_url: {
                  url: att.data.startsWith('http') || att.data.startsWith('data:')
                    ? att.data
                    : `data:${att.mimeType};base64,${att.data}`,
                },
              });
            }
          }
          return { role: m.role, content: contentParts };
        }
        return { role: m.role, content: m.content };
      }),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      top_p: options?.topP ?? 0.9,
      stream: false,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        await this.handleHttpError(response);
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: any[];
          };
        }>;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };

      const choice = data.choices?.[0];
      const content = choice?.message?.content || '';

      const result: ProviderResponse = {
        content,
        model,
        provider: this.name,
      };

      if (data.usage) {
        result.usage = {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        };
      }

      return result;
    } catch (error: any) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        this.logger.warn(`OpenRouter request timed out after ${timeout}ms`);
        throw new Error(`OpenRouter request timed out after ${timeout}ms`);
      }
      this.logger.error(`OpenRouter chat error: ${error.message}`);
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
   * Streaming completion via Server-Sent Events
   */
  async streamChat(
    messages: AIMessage[],
    onChunk: (chunk: string) => void,
    options?: CompletionOptions,
  ): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'OpenRouter API key is not configured. Set OPENROUTER_API_KEY in server environment.',
      );
    }

    const model = this.defaultModel;
    const timeout = options?.timeoutMs || this.timeoutMs;
    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: true,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        await this.handleHttpError(response);
      }

      if (!response.body) {
        throw new Error('No response body returned from OpenRouter stream');
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
          if (trimmed === 'data: [DONE]') break;

          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
                onChunk(delta);
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
      this.logger.error(`OpenRouter stream failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Health check for OpenRouter
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
        error: 'OPENROUTER_API_KEY not configured',
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth/key`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(4000),
      });

      if (!response.ok) {
        return {
          isAvailable: false,
          provider: this.name,
          model,
          latencyMs: Date.now() - start,
          error: `OpenRouter returned status ${response.status}`,
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
        error: error.message || 'OpenRouter health check failed',
      };
    }
  }

  private async handleHttpError(response: Response): Promise<never> {
    const errorText = await response.text().catch(() => '');
    const status = response.status;

    if (status === 401) {
      throw new Error('OpenRouter authentication failed: Invalid API key');
    }
    if (status === 402) {
      throw new Error('OpenRouter payment required: Insufficient account credits');
    }
    if (status === 403) {
      throw new Error('OpenRouter access forbidden: Account or model restricted');
    }
    if (status === 408) {
      throw new Error('OpenRouter request timed out on provider side');
    }
    if (status === 429) {
      throw new Error('OpenRouter rate limit exceeded: Please try again shortly');
    }
    if (status >= 500) {
      throw new Error(`OpenRouter upstream service error (${status}): ${errorText || response.statusText}`);
    }

    throw new Error(`OpenRouter API error (${status}): ${errorText || response.statusText}`);
  }
}
