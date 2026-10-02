/**
 * AIVA Model Router
 *
 * Centralized model routing & orchestration layer for AIVA.
 * Dispatches inference requests to:
 *  - LOCAL: Ollama → Qwen3 8B (default offline-capable)
 *  - CLOUD: OpenRouter → Qwen (cloud accelerator & fallback)
 *  - CLOUD: Google Gemini API → Gemini (cloud accelerator & fallback)
 *
 * Implements:
 * - Routing strategies: local-first, cloud-first, local-only, openrouter-only, gemini-only, auto
 * - Configurable cloud provider preference: AIVA_CLOUD_PROVIDER (openrouter | gemini | auto)
 * - Circuit breaker & health tracking
 * - Cost protection: daily cloud request limits, max output tokens, timeouts
 * - Provider fallback order: Ollama -> Preferred Cloud -> Secondary Cloud
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OllamaProvider } from '../providers/ollama.provider';
import { OpenRouterProvider } from '../providers/openrouter.provider';
import { GeminiProvider } from '../providers/gemini.provider';
import {
  AIProvider,
  AIMessage,
  CompletionOptions,
  ProviderResponse,
  ProviderHealth,
} from '../providers/ai-provider.interface';

export type RoutingStrategy =
  | 'local-first'
  | 'cloud-first'
  | 'local-only'
  | 'openrouter-only'
  | 'gemini-only'
  | 'auto';

export type CloudProviderPreference = 'openrouter' | 'gemini' | 'auto';

export interface RouterStatus {
  activeStrategy: RoutingStrategy;
  preferredCloudProvider: CloudProviderPreference;
  primaryProvider: string;
  fallbackProviders: string[];
  cloudUsageToday: {
    count: number;
    limit: number;
  };
  providers: {
    ollama: ProviderHealth;
    openrouter: ProviderHealth;
    gemini: ProviderHealth;
  };
}

@Injectable()
export class ModelRouterService implements OnModuleInit {
  private readonly logger = new Logger(ModelRouterService.name);

  // Circuit breaker state
  private providerFailures: Map<string, { count: number; lastFailed: number }> = new Map();
  private readonly failureThreshold = 3;
  private readonly cooldownMs = 60000; // 1 minute cooldown on trip

  // Daily request tracking for cost protection
  private dailyCloudCount = 0;
  private currentDay = new Date().toISOString().slice(0, 10);

  constructor(
    private readonly configService: ConfigService,
    private readonly ollamaProvider: OllamaProvider,
    private readonly openRouterProvider: OpenRouterProvider,
    private readonly geminiProvider: GeminiProvider,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing AIVA Model Router with Ollama, OpenRouter, and Gemini...');
    this.refreshHealth().catch((err) =>
      this.logger.warn(`Initial provider health check warning: ${err.message}`),
    );
  }

  get strategy(): RoutingStrategy {
    const configured = this.configService.get<string>(
      'AIVA_ROUTING_STRATEGY',
      'local-first',
    ) as RoutingStrategy;
    return configured || 'local-first';
  }

  get cloudProviderPreference(): CloudProviderPreference {
    const configured = this.configService.get<string>(
      'AIVA_CLOUD_PROVIDER',
      'openrouter',
    ) as CloudProviderPreference;
    return configured || 'openrouter';
  }

  get isCloudEnabled(): boolean {
    const enabled = this.configService.get<string>('AIVA_CLOUD_ENABLED', 'true');
    return enabled === 'true' || enabled === '1';
  }

  get maxOutputTokens(): number {
    const configured = this.configService.get<string>('AIVA_MAX_OUTPUT_TOKENS');
    return configured ? parseInt(configured, 10) : 4096;
  }

  get maxCloudRequestsPerDay(): number {
    const configured = this.configService.get<string>('AIVA_MAX_CLOUD_REQUESTS_PER_DAY');
    return configured ? parseInt(configured, 10) : 1000;
  }

  /**
   * Health check all three providers
   */
  async refreshHealth(): Promise<{
    ollama: ProviderHealth;
    openrouter: ProviderHealth;
    gemini: ProviderHealth;
  }> {
    const [ollama, openrouter, gemini] = await Promise.all([
      this.ollamaProvider.checkHealth(),
      this.openRouterProvider.checkHealth(),
      this.geminiProvider.checkHealth(),
    ]);

    this.logger.debug(
      `Model Router Health: Ollama = ${ollama.isAvailable ? 'UP' : 'DOWN'}, OpenRouter = ${openrouter.isAvailable ? 'UP' : 'DOWN'}, Gemini = ${gemini.isAvailable ? 'UP' : 'DOWN'}`,
    );

    return { ollama, openrouter, gemini };
  }

  /**
   * Check if provider is tripped by circuit breaker
   */
  private isCircuitOpen(providerName: string): boolean {
    const state = this.providerFailures.get(providerName);
    if (!state) return false;
    if (state.count >= this.failureThreshold) {
      if (Date.now() - state.lastFailed < this.cooldownMs) {
        return true;
      }
      // Reset after cooldown
      this.providerFailures.delete(providerName);
    }
    return false;
  }

  private recordSuccess(providerName: string): void {
    this.providerFailures.delete(providerName);
  }

  private recordFailure(providerName: string): void {
    const state = this.providerFailures.get(providerName) || { count: 0, lastFailed: 0 };
    state.count += 1;
    state.lastFailed = Date.now();
    this.providerFailures.set(providerName, state);
  }

  /**
   * Check and increment daily cloud quota
   */
  private checkCloudQuota(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.currentDay) {
      this.currentDay = today;
      this.dailyCloudCount = 0;
    }

    if (!this.isCloudEnabled) {
      throw new Error('AIVA cloud inference is disabled by configuration (AIVA_CLOUD_ENABLED=false).');
    }

    if (this.dailyCloudCount >= this.maxCloudRequestsPerDay) {
      throw new Error(
        `AIVA daily cloud limit reached (${this.dailyCloudCount}/${this.maxCloudRequestsPerDay}). Local inference only.`,
      );
    }

    this.dailyCloudCount += 1;
  }

  /**
   * Get cloud provider resolution order based on configuration and health
   */
  private getCloudProvidersOrder(): AIProvider[] {
    const pref = this.cloudProviderPreference;
    if (pref === 'gemini') {
      return [this.geminiProvider, this.openRouterProvider];
    }
    // Default openrouter first, gemini fallback
    return [this.openRouterProvider, this.geminiProvider];
  }

  /**
   * Execute chat completion
   */
  async chat(
    messages: AIMessage[],
    options?: CompletionOptions,
  ): Promise<ProviderResponse> {
    const mergedOptions: CompletionOptions = {
      ...options,
      maxTokens: Math.min(options?.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
    };

    const strategy = this.strategy;

    switch (strategy) {
      case 'local-only':
        return this.executeProvider(this.ollamaProvider, messages, mergedOptions);

      case 'openrouter-only':
        this.checkCloudQuota();
        return this.executeProvider(this.openRouterProvider, messages, mergedOptions);

      case 'gemini-only':
        this.checkCloudQuota();
        return this.executeProvider(this.geminiProvider, messages, mergedOptions);

      case 'cloud-first':
        return this.executeCloudFirst(messages, mergedOptions);

      case 'local-first':
      case 'auto':
      default:
        return this.executeLocalFirst(messages, mergedOptions);
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
   * Streaming chat completion with automated fallback
   */
  async streamChat(
    messages: AIMessage[],
    onChunk: (chunk: string) => void,
    options?: CompletionOptions,
  ): Promise<ProviderResponse> {
    const mergedOptions: CompletionOptions = {
      ...options,
      maxTokens: Math.min(options?.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
    };

    const strategy = this.strategy;

    if (strategy === 'local-only') {
      return this.ollamaProvider.streamChat!(messages, onChunk, mergedOptions);
    }

    if (strategy === 'openrouter-only') {
      this.checkCloudQuota();
      return this.openRouterProvider.streamChat!(messages, onChunk, mergedOptions);
    }

    if (strategy === 'gemini-only') {
      this.checkCloudQuota();
      return this.geminiProvider.streamChat!(messages, onChunk, mergedOptions);
    }

    if (strategy === 'cloud-first') {
      return this.executeCloudFirstStream(messages, onChunk, mergedOptions);
    }

    // Default: local-first streaming with cloud fallback
    try {
      if (!this.isCircuitOpen(this.ollamaProvider.name)) {
        return await this.ollamaProvider.streamChat!(messages, onChunk, mergedOptions);
      }
      throw new Error('Ollama circuit breaker is open');
    } catch (localError: any) {
      this.recordFailure(this.ollamaProvider.name);
      this.logger.warn(`Local Ollama streaming failed (${localError.message}). Falling back to cloud...`);
      return this.executeCloudFallbackStream(messages, onChunk, mergedOptions);
    }
  }

  // ── Strategy Implementations ────────────────────────────────────────

  private async executeProvider(
    provider: AIProvider,
    messages: AIMessage[],
    options: CompletionOptions,
  ): Promise<ProviderResponse> {
    try {
      const res = await provider.chat(messages, options);
      this.recordSuccess(provider.name);
      return res;
    } catch (error: any) {
      this.recordFailure(provider.name);
      throw error;
    }
  }

  private async executeLocalFirst(
    messages: AIMessage[],
    options: CompletionOptions,
  ): Promise<ProviderResponse> {
    // 1. Try local Ollama if not circuit-broken
    if (!this.isCircuitOpen(this.ollamaProvider.name)) {
      try {
        this.logger.debug('Routing request to Local Ollama Qwen3 8B...');
        const response = await this.ollamaProvider.chat(messages, options);
        this.recordSuccess(this.ollamaProvider.name);
        return response;
      } catch (localError: any) {
        this.recordFailure(this.ollamaProvider.name);
        this.logger.warn(
          `Local Ollama unavailable or failed (${localError.message}). Seamlessly routing to cloud...`,
        );
      }
    } else {
      this.logger.debug('Local Ollama circuit breaker active. Routing directly to cloud...');
    }

    // 2. Fall back to Cloud Providers
    return this.executeCloudFallback(messages, options);
  }

  private async executeCloudFirst(
    messages: AIMessage[],
    options: CompletionOptions,
  ): Promise<ProviderResponse> {
    try {
      return await this.executeCloudFallback(messages, options);
    } catch (cloudError: any) {
      this.logger.warn(`Cloud providers failed (${cloudError.message}). Falling back to Local Ollama...`);
      try {
        const res = await this.ollamaProvider.chat(messages, options);
        this.recordSuccess(this.ollamaProvider.name);
        return res;
      } catch (localError: any) {
        throw new Error(
          `All AI providers failed. Cloud error: "${cloudError.message}", Local Ollama error: "${localError.message}".`,
        );
      }
    }
  }

  private async executeCloudFallback(
    messages: AIMessage[],
    options: CompletionOptions,
  ): Promise<ProviderResponse> {
    this.checkCloudQuota();
    const cloudProviders = this.getCloudProvidersOrder();
    const errors: string[] = [];

    for (const provider of cloudProviders) {
      if (this.isCircuitOpen(provider.name)) {
        errors.push(`${provider.name} circuit open`);
        continue;
      }

      try {
        this.logger.debug(`Attempting cloud inference with provider: ${provider.name}`);
        const response = await provider.chat(messages, options);
        this.recordSuccess(provider.name);
        return response;
      } catch (error: any) {
        this.recordFailure(provider.name);
        this.logger.warn(`Provider ${provider.name} failed: ${error.message}`);
        errors.push(`${provider.name}: ${error.message}`);
      }
    }

    throw new Error(
      `All cloud AI providers failed. Details: ${errors.join(' | ')}. Please verify OPENROUTER_API_KEY / GEMINI_API_KEY.`,
    );
  }

  private async executeCloudFallbackStream(
    messages: AIMessage[],
    onChunk: (chunk: string) => void,
    options: CompletionOptions,
  ): Promise<ProviderResponse> {
    this.checkCloudQuota();
    const cloudProviders = this.getCloudProvidersOrder();
    const errors: string[] = [];

    for (const provider of cloudProviders) {
      if (this.isCircuitOpen(provider.name)) continue;

      try {
        this.logger.debug(`Attempting cloud streaming with provider: ${provider.name}`);
        const response = await provider.streamChat!(messages, onChunk, options);
        this.recordSuccess(provider.name);
        return response;
      } catch (error: any) {
        this.recordFailure(provider.name);
        this.logger.warn(`Provider ${provider.name} stream failed: ${error.message}`);
        errors.push(`${provider.name}: ${error.message}`);
      }
    }

    throw new Error(`All cloud streaming providers failed: ${errors.join(' | ')}`);
  }

  private async executeCloudFirstStream(
    messages: AIMessage[],
    onChunk: (chunk: string) => void,
    options: CompletionOptions,
  ): Promise<ProviderResponse> {
    try {
      return await this.executeCloudFallbackStream(messages, onChunk, options);
    } catch (cloudError: any) {
      this.logger.warn(`Cloud streaming failed (${cloudError.message}). Falling back to Local Ollama...`);
      return await this.ollamaProvider.streamChat!(messages, onChunk, options);
    }
  }

  /**
   * Get full router status for monitoring & diagnostics
   */
  async getStatus(): Promise<RouterStatus> {
    const health = await this.refreshHealth();
    const cloudOrder = this.getCloudProvidersOrder();

    return {
      activeStrategy: this.strategy,
      preferredCloudProvider: this.cloudProviderPreference,
      primaryProvider:
        this.strategy === 'cloud-first' || this.strategy === 'openrouter-only' || this.strategy === 'gemini-only'
          ? (cloudOrder[0]?.name || this.ollamaProvider.name)
          : this.ollamaProvider.name,
      fallbackProviders:
        this.strategy === 'local-first' || this.strategy === 'auto'
          ? cloudOrder.map((p) => p.name)
          : [this.ollamaProvider.name],
      cloudUsageToday: {
        count: this.dailyCloudCount,
        limit: this.maxCloudRequestsPerDay,
      },
      providers: {
        ollama: health.ollama,
        openrouter: health.openrouter,
        gemini: health.gemini,
      },
    };
  }
}
