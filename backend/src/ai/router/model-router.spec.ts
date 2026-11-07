/**
 * AIVA AI Provider & Model Router Test Suite
 *
 * Validates:
 * 1. OllamaProvider (Local inference, connection handling, health checks)
 * 2. OpenRouterProvider (OpenRouter Qwen, streaming, HTTP 401/402/429/500 error mapping)
 * 3. GeminiProvider (Google Gemini API REST v1beta, system instructions, streaming, error mapping)
 * 4. ModelRouterService (local-first, cloud-first, provider preference, fallbacks, circuit breaking, cost controls)
 * 5. Secret leak scanning
 */

import { ConfigService } from '@nestjs/config';
import { OllamaProvider } from '../providers/ollama.provider';
import { OpenRouterProvider } from '../providers/openrouter.provider';
import { GeminiProvider } from '../providers/gemini.provider';
import { ModelRouterService } from './model-router.service';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  ✓ PASS: ${name}`);
  } catch (error: any) {
    results.push({ name, passed: false, error: error.message });
    console.error(`  ✗ FAIL: ${name} -> ${error.message}`);
  }
}

function createMockConfig(env: Record<string, string>): ConfigService {
  return {
    get: (key: string, defaultValue?: string) => env[key] ?? defaultValue,
  } as unknown as ConfigService;
}

async function main() {
  console.log('\n========================================');
  console.log('AIVA AI PROVIDER ARCHITECTURE TEST SUITE');
  console.log('========================================\n');

  // Test 1: OllamaProvider health check when offline
  await runTest('1. OllamaProvider reports clean unavailable when offline', async () => {
    const config = createMockConfig({
      OLLAMA_BASE_URL: 'http://localhost:59999', // Non-existent port
      OLLAMA_MODEL: 'qwen3:8b',
    });
    const ollama = new OllamaProvider(config);
    const health = await ollama.checkHealth();
    assert(!health.isAvailable, 'Health should be unavailable');
    assert(health.provider === 'ollama-qwen', 'Provider name mismatch');
    assert(health.model === 'qwen3:8b', 'Model mismatch');
  });

  // Test 2: OpenRouterProvider validation & error mapping
  await runTest('2. OpenRouterProvider rejects chat when API key is missing', async () => {
    const config = createMockConfig({
      OPENROUTER_API_KEY: '',
    });
    const openrouter = new OpenRouterProvider(config);
    let threw = false;
    try {
      await openrouter.chat([{ role: 'user', content: 'Hello' }]);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('OPENROUTER_API_KEY'), 'Should mention API key requirement');
    }
    assert(threw, 'Should have thrown missing key error');
  });

  // Test 3: GeminiProvider validation & formatting
  await runTest('3. GeminiProvider rejects chat when API key is missing', async () => {
    const config = createMockConfig({
      GEMINI_API_KEY: '',
    });
    const gemini = new GeminiProvider(config);
    let threw = false;
    try {
      await gemini.chat([{ role: 'user', content: 'Hello' }]);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('GEMINI_API_KEY'), 'Should mention API key requirement');
    }
    assert(threw, 'Should have thrown missing key error');
  });

  // Test 4: ModelRouter local-first fallback (Ollama offline -> OpenRouter fallback)
  await runTest('4. ModelRouter local-first falls back to OpenRouter when Ollama fails', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'local-first',
      AIVA_CLOUD_PROVIDER: 'openrouter',
      AIVA_CLOUD_ENABLED: 'true',
      AIVA_MAX_OUTPUT_TOKENS: '4096',
      AIVA_MAX_CLOUD_REQUESTS_PER_DAY: '100',
      OLLAMA_BASE_URL: 'http://localhost:59999',
    });

    const mockOllama = new OllamaProvider(config);
    mockOllama.chat = async () => {
      throw new Error('Connection refused to Ollama');
    };

    const mockOpenRouter = new OpenRouterProvider(config);
    mockOpenRouter.chat = async () => ({
      content: 'Response from OpenRouter Qwen fallback',
      model: 'qwen/qwen-2.5-72b-instruct',
      provider: 'openrouter-qwen',
    });

    const mockGemini = new GeminiProvider(config);

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);
    const response = await router.chat([{ role: 'user', content: 'Test prompt' }]);

    assert(response.content === 'Response from OpenRouter Qwen fallback', 'Did not get OpenRouter fallback response');
    assert(response.provider === 'openrouter-qwen', 'Provider must be openrouter-qwen');
  });

  // Test 5: ModelRouter local-first fallback to Gemini when OpenRouter also fails
  await runTest('5. ModelRouter falls back to Gemini when Ollama and OpenRouter both fail', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'local-first',
      AIVA_CLOUD_PROVIDER: 'openrouter',
      AIVA_CLOUD_ENABLED: 'true',
      AIVA_MAX_OUTPUT_TOKENS: '4096',
      AIVA_MAX_CLOUD_REQUESTS_PER_DAY: '100',
    });

    const mockOllama = new OllamaProvider(config);
    mockOllama.chat = async () => {
      throw new Error('Ollama offline');
    };

    const mockOpenRouter = new OpenRouterProvider(config);
    mockOpenRouter.chat = async () => {
      throw new Error('OpenRouter 429 rate limit exceeded');
    };

    const mockGemini = new GeminiProvider(config);
    mockGemini.chat = async () => ({
      content: 'Response from Gemini secondary fallback',
      model: 'gemini-1.5-flash',
      provider: 'gemini',
    });

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);
    const response = await router.chat([{ role: 'user', content: 'Test fallback' }]);

    assert(response.content === 'Response from Gemini secondary fallback', 'Did not get Gemini fallback response');
    assert(response.provider === 'gemini', 'Provider must be gemini');
  });

  // Test 6: Cloud Provider Preference (AIVA_CLOUD_PROVIDER=gemini)
  await runTest('6. ModelRouter respects AIVA_CLOUD_PROVIDER=gemini preference', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'local-first',
      AIVA_CLOUD_PROVIDER: 'gemini',
      AIVA_CLOUD_ENABLED: 'true',
    });

    const mockOllama = new OllamaProvider(config);
    mockOllama.chat = async () => {
      throw new Error('Ollama offline');
    };

    let geminiCalledFirst = false;
    const mockGemini = new GeminiProvider(config);
    mockGemini.chat = async () => {
      geminiCalledFirst = true;
      return {
        content: 'Gemini priority response',
        model: 'gemini-1.5-flash',
        provider: 'gemini',
      };
    };

    const mockOpenRouter = new OpenRouterProvider(config);
    mockOpenRouter.chat = async () => {
      throw new Error('OpenRouter should not be called first when preference is gemini');
    };

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);
    const response = await router.chat([{ role: 'user', content: 'Test preference' }]);

    assert(geminiCalledFirst, 'Gemini should have been called first');
    assert(response.provider === 'gemini', 'Provider should be gemini');
  });

  // Test 7: All providers fail -> clean error without secrets
  await runTest('7. All providers unavailable returns clean error without leaking keys', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'local-first',
      AIVA_CLOUD_PROVIDER: 'openrouter',
      AIVA_CLOUD_ENABLED: 'true',
    });

    const mockOllama = new OllamaProvider(config);
    mockOllama.chat = async () => {
      throw new Error('Ollama connection refused');
    };

    const mockOpenRouter = new OpenRouterProvider(config);
    mockOpenRouter.chat = async () => {
      throw new Error('OpenRouter HTTP 401: Invalid Key sk-secret-12345');
    };

    const mockGemini = new GeminiProvider(config);
    mockGemini.chat = async () => {
      throw new Error('Gemini HTTP 403: Forbidden AIzaSecretKey');
    };

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);

    let caughtError = '';
    try {
      await router.chat([{ role: 'user', content: 'Trigger error' }]);
    } catch (err: any) {
      caughtError = err.message;
    }

    assert(caughtError.includes('All cloud AI providers are currently unavailable'), 'Must return clean provider failure error');
  });

  // Test 8: Cost Protection - Daily Cloud Quota Exceeded
  await runTest('8. Cost protection enforces daily cloud request quota', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'openrouter-only',
      AIVA_CLOUD_ENABLED: 'true',
      AIVA_MAX_CLOUD_REQUESTS_PER_DAY: '2',
    });

    const mockOllama = new OllamaProvider(config);
    const mockOpenRouter = new OpenRouterProvider(config);
    mockOpenRouter.chat = async () => ({
      content: 'OK',
      model: 'qwen',
      provider: 'openrouter-qwen',
    });
    const mockGemini = new GeminiProvider(config);

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);

    await router.chat([{ role: 'user', content: 'Req 1' }]);
    await router.chat([{ role: 'user', content: 'Req 2' }]);

    let quotaThrew = false;
    try {
      await router.chat([{ role: 'user', content: 'Req 3' }]);
    } catch (err: any) {
      quotaThrew = true;
      assert(err.message.includes('daily cloud limit reached'), 'Should notify of daily limit');
    }
    assert(quotaThrew, 'Exceeding quota must throw error');
  });

  // Test 9: Cost Protection - Output tokens enforcement
  await runTest('9. Cost protection clips maximum output tokens', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'gemini-only',
      AIVA_CLOUD_ENABLED: 'true',
      AIVA_MAX_OUTPUT_TOKENS: '512',
    });

    const mockOllama = new OllamaProvider(config);
    const mockOpenRouter = new OpenRouterProvider(config);
    const mockGemini = new GeminiProvider(config);

    let receivedMaxTokens = 0;
    mockGemini.chat = async (_messages, options) => {
      receivedMaxTokens = options?.maxTokens || 0;
      return {
        content: 'OK',
        model: 'gemini-1.5-flash',
        provider: 'gemini',
      };
    };

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);
    await router.chat([{ role: 'user', content: 'Check tokens' }], { maxTokens: 8192 });

    assert(receivedMaxTokens === 512, `maxTokens was not clipped to 512, got: ${receivedMaxTokens}`);
  });

  // Test 10: Health check endpoint separately reports Ollama, OpenRouter, Gemini
  await runTest('10. Router health check separates Ollama, OpenRouter, and Gemini', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'local-first',
      AIVA_CLOUD_PROVIDER: 'openrouter',
    });

    const mockOllama = new OllamaProvider(config);
    mockOllama.checkHealth = async () => ({
      isAvailable: false,
      provider: 'ollama-qwen',
      model: 'qwen3:8b',
      error: 'Ollama offline',
    });

    const mockOpenRouter = new OpenRouterProvider(config);
    mockOpenRouter.checkHealth = async () => ({
      isAvailable: true,
      provider: 'openrouter-qwen',
      model: 'qwen/qwen-2.5-72b-instruct',
      latencyMs: 142,
    });

    const mockGemini = new GeminiProvider(config);
    mockGemini.checkHealth = async () => ({
      isAvailable: true,
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      latencyMs: 118,
    });

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);
    const status = await router.getStatus();

    assert(status.providers.ollama.isAvailable === false, 'Ollama should be reported unavailable');
    assert(status.providers.openrouter.isAvailable === true, 'OpenRouter should be reported available');
    assert(status.providers.gemini.isAvailable === true, 'Gemini should be reported available');
    assert(status.preferredCloudProvider === 'openrouter', 'Preferred cloud provider should be openrouter');
  });

  // Test 11: Android Gemini success — no fallback
  await runTest('11. Android Gemini success routes directly without calling fallback', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'cloud-first',
      AIVA_CLOUD_ENABLED: 'true',
    });

    const mockOllama = new OllamaProvider(config);
    let openRouterCalled = false;
    const mockOpenRouter = new OpenRouterProvider(config);
    mockOpenRouter.chat = async () => {
      openRouterCalled = true;
      return { content: 'Should not be called', model: 'qwen', provider: 'openrouter-qwen' };
    };

    const mockGemini = new GeminiProvider(config);
    mockGemini.chat = async () => ({
      content: 'Hello from direct Gemini',
      model: 'gemini-flash-lite-latest',
      provider: 'gemini',
    });

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);
    const response = await router.chat([{ role: 'user', content: 'Hello' }], {
      clientPlatform: 'android',
    });

    assert(response.content === 'Hello from direct Gemini', 'Response content mismatch');
    assert(response.provider === 'gemini', 'Provider should be gemini');
    assert(!openRouterCalled, 'OpenRouter must NOT be called when Gemini succeeds');
  });

  // Test 12: Android Gemini timeout — OpenRouter fallback succeeds
  await runTest('12. Android Gemini timeout triggers OpenRouter fallback with correct model ID', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'cloud-first',
      AIVA_CLOUD_ENABLED: 'true',
      OPENROUTER_MODEL: 'qwen/qwen-2.5-72b-instruct',
    });

    const mockOllama = new OllamaProvider(config);
    let openRouterReceivedModel = '';
    const mockOpenRouter = new OpenRouterProvider(config);
    mockOpenRouter.chat = async (_messages, options) => {
      openRouterReceivedModel = options?.model || '';
      return {
        content: 'Fallback joke from OpenRouter',
        model: options?.model || 'qwen/qwen-2.5-72b-instruct',
        provider: 'openrouter-qwen',
      };
    };

    const mockGemini = new GeminiProvider(config);
    mockGemini.chat = async () => {
      throw new Error('Gemini request timed out after 10000ms');
    };

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);
    const response = await router.chat([{ role: 'user', content: 'Tell me a joke' }], {
      clientPlatform: 'android',
      model: 'gemini-3.8-flash',
    });

    assert(response.content === 'Fallback joke from OpenRouter', 'Should receive fallback response');
    assert(response.provider === 'openrouter-qwen', 'Provider must be openrouter-qwen');
    assert(
      !openRouterReceivedModel.includes('gemini'),
      `OpenRouter received invalid Gemini model: ${openRouterReceivedModel}`,
    );
    assert(
      openRouterReceivedModel === 'qwen/qwen-2.5-72b-instruct',
      `OpenRouter model should be qwen/qwen-2.5-72b-instruct, got: ${openRouterReceivedModel}`,
    );
  });

  // Test 13: Android Gemini 503 — OpenRouter fallback succeeds
  await runTest('13. Android Gemini 503 triggers OpenRouter fallback', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'cloud-first',
      AIVA_CLOUD_ENABLED: 'true',
    });

    const mockOllama = new OllamaProvider(config);
    const mockOpenRouter = new OpenRouterProvider(config);
    mockOpenRouter.chat = async () => ({
      content: 'OpenRouter recovery after 503',
      model: 'qwen/qwen-2.5-72b-instruct',
      provider: 'openrouter-qwen',
    });

    const mockGemini = new GeminiProvider(config);
    mockGemini.chat = async () => {
      throw new Error('Gemini upstream service error (503): Model high demand');
    };

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);
    const response = await router.chat([{ role: 'user', content: '503 test' }], {
      clientPlatform: 'android',
    });

    assert(response.content === 'OpenRouter recovery after 503', 'Failed to recover from 503');
    assert(response.provider === 'openrouter-qwen', 'Provider should be openrouter-qwen');
  });

  // Test 14: Android Gemini 429 — fallback follows configured policy
  await runTest('14. Android Gemini 429 triggers OpenRouter fallback', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'cloud-first',
      AIVA_CLOUD_ENABLED: 'true',
    });

    const mockOllama = new OllamaProvider(config);
    const mockOpenRouter = new OpenRouterProvider(config);
    mockOpenRouter.chat = async () => ({
      content: 'OpenRouter recovery after 429',
      model: 'qwen/qwen-2.5-72b-instruct',
      provider: 'openrouter-qwen',
    });

    const mockGemini = new GeminiProvider(config);
    mockGemini.chat = async () => {
      throw new Error('Gemini rate limit or quota exceeded: Please try again shortly');
    };

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);
    const response = await router.chat([{ role: 'user', content: '429 test' }], {
      clientPlatform: 'android',
    });

    assert(response.content === 'OpenRouter recovery after 429', 'Failed to recover from 429');
    assert(response.provider === 'openrouter-qwen', 'Provider should be openrouter-qwen');
  });

  // Test 15: Android Gemini and OpenRouter both fail — safe, readable error
  await runTest('15. Gemini and OpenRouter both fail returns safe readable error without secrets', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'cloud-first',
      AIVA_CLOUD_ENABLED: 'true',
    });

    const mockOllama = new OllamaProvider(config);
    const mockOpenRouter = new OpenRouterProvider(config);
    mockOpenRouter.chat = async () => {
      throw new Error('OpenRouter API returned 500: sk-or-v1-secret-key-12345');
    };

    const mockGemini = new GeminiProvider(config);
    mockGemini.chat = async () => {
      throw new Error('Gemini API key fake_dummy_gemini_key_123 leaked');
    };

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);

    let errorThrown = '';
    try {
      await router.chat([{ role: 'user', content: 'Dual failure test' }], {
        clientPlatform: 'android',
      });
    } catch (err: any) {
      errorThrown = err.message;
    }

    assert(
      errorThrown === 'All cloud AI providers are currently unavailable. Please try again shortly.',
      `Expected safe error message, got: ${errorThrown}`,
    );
    assert(!errorThrown.includes('secret'), 'Error must not contain secret tokens');
    assert(!errorThrown.includes('sk-or'), 'Error must not contain OpenRouter keys');
    assert(!errorThrown.includes('fake_dummy'), 'Error must not contain mock key tokens');
  });

  // Test 16: No duplicate user messages during fallback
  await runTest('16. Fallback dispatches user message exactly once without duplication', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'cloud-first',
      AIVA_CLOUD_ENABLED: 'true',
    });

    const mockOllama = new OllamaProvider(config);
    let openRouterReceivedMessages: any[] = [];
    const mockOpenRouter = new OpenRouterProvider(config);
    mockOpenRouter.chat = async (messages) => {
      openRouterReceivedMessages = messages;
      return {
        content: 'OK',
        model: 'qwen',
        provider: 'openrouter-qwen',
      };
    };

    const mockGemini = new GeminiProvider(config);
    mockGemini.chat = async () => {
      throw new Error('Gemini timeout');
    };

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);
    const inputMessages = [{ role: 'user' as const, content: 'Unique message text 4982' }];
    await router.chat(inputMessages, { clientPlatform: 'android' });

    assert(openRouterReceivedMessages.length === 1, `Expected 1 message, got ${openRouterReceivedMessages.length}`);
    assert(
      openRouterReceivedMessages[0].content === 'Unique message text 4982',
      'Message content modified or duplicated',
    );
  });

  // Test 17: No raw provider exception exposed to Android
  await runTest('17. Sanitization prevents raw provider exceptions from leaking', async () => {
    const config = createMockConfig({
      AIVA_ROUTING_STRATEGY: 'cloud-first',
      AIVA_CLOUD_ENABLED: 'true',
    });

    const mockOllama = new OllamaProvider(config);
    const mockOpenRouter = new OpenRouterProvider(config);
    mockOpenRouter.chat = async () => {
      throw new Error('AxiosError: ECONNRESET at TLSWrap.onStreamRead');
    };

    const mockGemini = new GeminiProvider(config);
    mockGemini.chat = async () => {
      throw new Error('FetchError: request to https://generativelanguage.googleapis.com failed');
    };

    const router = new ModelRouterService(config, mockOllama, mockOpenRouter, mockGemini);

    try {
      await router.chat([{ role: 'user', content: 'Test sanitization' }], { clientPlatform: 'android' });
      assert(false, 'Should have thrown');
    } catch (err: any) {
      assert(!err.message.includes('generativelanguage'), 'Must not expose Google URL');
      assert(!err.message.includes('TLSWrap'), 'Must not expose Node internals');
      assert(!err.message.includes('ECONNRESET'), 'Must not expose raw socket errors');
      assert(
        err.message === 'All cloud AI providers are currently unavailable. Please try again shortly.',
        'Error message should match sanitized error',
      );
    }
  });

  // Test 18: Real live credentials provider verification
  await runTest('18. Real provider test with live Google Gemini API credentials', async () => {
    const liveKey = process.env.GEMINI_API_KEY;
    if (!liveKey) {
      console.log('    [SKIPPED] GEMINI_API_KEY not set in environment');
      return;
    }
    const config = createMockConfig({
      GEMINI_API_KEY: liveKey,
      GEMINI_MODEL: 'gemini-flash-lite-latest',
      AIVA_CLOUD_ENABLED: 'true',
    });

    const gemini = new GeminiProvider(config);
    const health = await gemini.checkHealth();
    assert(health.isAvailable, `Gemini live health check failed: ${health.error}`);

    const res = await gemini.chat([{ role: 'user', content: 'Respond with exactly one word: Verified' }], {
      timeoutMs: 8000,
    });
    assert(res.content.length > 0, 'Gemini returned empty content');
    assert(res.provider === 'gemini', 'Provider should be gemini');
    console.log(`    [LIVE GEMINI SUCCESS] Latency: ${health.latencyMs}ms, Response: "${res.content.trim().slice(0, 50)}"`);
  });

  console.log('\n========================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`TOTAL: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('========================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
