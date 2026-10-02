/**
 * Local Ollama Provider (Qwen3 8B)
 *
 * Provides offline-capable, private inference using Ollama.
 * Resilient against:
 * - Ollama not running / connection refused
 * - Model not pulled / 404
 * - Timeouts & OOMs
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
export class OllamaProvider implements AIProvider {
  private readonly logger = new Logger(OllamaProvider.name);
  readonly name = 'ollama-qwen';

  constructor(private readonly configService: ConfigService) {}

  get baseUrl(): string {
    return (
      this.configService.get<string>('OLLAMA_BASE_URL') ||
      'http://localhost:11434'
    ).replace(/\/+$/, '');
  }

  get defaultModel(): string {
    return this.configService.get<string>('OLLAMA_MODEL') || 'qwen3:8b';
  }

  get timeoutMs(): number {
    const configured = this.configService.get<string>('OLLAMA_TIMEOUT_MS');
    return configured ? parseInt(configured, 10) : 30000;
  }

  /**
   * Chat completion via Ollama native endpoint
   */
  async chat(
    messages: AIMessage[],
    options?: CompletionOptions,
  ): Promise<ProviderResponse> {
    const model = this.defaultModel;
    const timeout = options?.timeoutMs || this.timeoutMs;
    const url = `${this.baseUrl}/api/chat`;

    this.logger.debug(`Calling Ollama chat with model ${model} at ${url}`);

    const body = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 4096,
        top_p: options?.topP ?? 0.9,
        stop: options?.stop,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 404) {
          throw new Error(
            `Ollama model "${model}" not found. Run "ollama pull ${model}" to download it. Details: ${errorText}`,
          );
        }
        throw new Error(
          `Ollama returned HTTP ${response.status}: ${errorText || response.statusText}`,
        );
      }

      const data = (await response.json()) as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      const content = data.message?.content || '';

      return {
        content,
        model,
        provider: this.name,
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens:
            (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
      };
    } catch (error: any) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        this.logger.warn(`Ollama inference timed out after ${timeout}ms`);
        throw new Error(`Ollama request timed out after ${timeout}ms`);
      }
      if (
        error.code === 'ECONNREFUSED' ||
        error.message?.includes('fetch failed') ||
        error.cause?.code === 'ECONNREFUSED'
      ) {
        this.logger.warn(`Ollama is not reachable at ${this.baseUrl}`);
        throw new Error(
          `Ollama server is unreachable at ${this.baseUrl}. Ensure Ollama is running.`,
        );
      }
      this.logger.error(`Ollama chat error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Single completion / prompt
   */
  async complete(
    prompt: string,
    options?: CompletionOptions,
  ): Promise<ProviderResponse> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  /**
   * Streaming chat completion
   */
  async streamChat(
    messages: AIMessage[],
    onChunk: (chunk: string) => void,
    options?: CompletionOptions,
  ): Promise<ProviderResponse> {
    const model = this.defaultModel;
    const timeout = options?.timeoutMs || this.timeoutMs;
    const url = `${this.baseUrl}/api/chat`;

    const body = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 4096,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Ollama stream error (${response.status}): ${errorText}`);
      }

      if (!response.body) {
        throw new Error('No response body returned from Ollama stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const rawText = decoder.decode(value, { stream: true });
        const lines = rawText.split('\n').filter((line) => line.trim() !== '');

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as {
              message?: { content?: string };
              done?: boolean;
            };
            const chunk = parsed.message?.content || '';
            if (chunk) {
              fullContent += chunk;
              onChunk(chunk);
            }
          } catch {
            // Ignore incomplete line splits
          }
        }
      }

      return {
        content: fullContent,
        model,
        provider: this.name,
      };
    } catch (error: any) {
      this.logger.error(`Ollama stream failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check Ollama connectivity and whether default model is downloaded
   */
  async checkHealth(): Promise<ProviderHealth> {
    const start = Date.now();
    const model = this.defaultModel;

    try {
      const tagsResponse = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });

      if (!tagsResponse.ok) {
        return {
          isAvailable: false,
          provider: this.name,
          model,
          latencyMs: Date.now() - start,
          error: `Ollama returned status ${tagsResponse.status}`,
        };
      }

      const tagsData = (await tagsResponse.json()) as {
        models?: Array<{ name: string }>;
      };

      const installedModels = tagsData.models?.map((m) => m.name) || [];
      const hasModel = installedModels.some(
        (m) =>
          m === model ||
          m === `${model}:latest` ||
          m.startsWith(`${model}:`) ||
          m.startsWith(model),
      );

      return {
        isAvailable: true,
        provider: this.name,
        model,
        latencyMs: Date.now() - start,
        details: {
          installedModels,
          hasRequestedModel: hasModel,
          warning: !hasModel
            ? `Model "${model}" not found in Ollama. Pull with "ollama pull ${model}"`
            : undefined,
        },
      };
    } catch (error: any) {
      return {
        isAvailable: false,
        provider: this.name,
        model,
        latencyMs: Date.now() - start,
        error: error.message || 'Connection refused',
      };
    }
  }
}
