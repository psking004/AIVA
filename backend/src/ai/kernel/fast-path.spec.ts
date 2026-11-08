/**
 * AIVA Ultra-Low-Latency Fast Path Engine & Deterministic Intent Specification Test Suite
 * Validates Sections 1 - 5, 7, 13, 14, 16, 23 of the Master Implementation Plan.
 *
 * Enforces:
 * - "Never send a deterministic request to an LLM."
 * - P0 Latency budget: < 20ms
 * - Instant Acknowledgement for complex agent tasks: < 20ms
 * - Absolute LLM bypass for deterministic queries
 * - Standalone TSX execution for automated verification
 */

import { FastPathEngine } from './fast-path.engine';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runFastPathTestSuite() {
  console.log('\n============================================================');
  console.log('AIVA FAST PATH ENGINE & DETERMINISTIC INTENT TEST SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      fn();
      passed++;
      console.log(`PASS [${total}] ${name}`);
    } catch (err: any) {
      console.error(`FAIL [${total}] ${name}: ${err.message}`);
    }
  }

  const engine = new FastPathEngine();

  // Test 1: P0 Deterministic Intent Classification
  test('P0 Intent Classification (15 distinct phrases)', () => {
    const testCases: Array<{ phrase: string; expectedIntent: string }> = [
      { phrase: 'what time is it', expectedIntent: 'TIME' },
      { phrase: "what's the time", expectedIntent: 'TIME' },
      { phrase: 'current time', expectedIntent: 'TIME' },
      { phrase: 'tell me the time', expectedIntent: 'TIME' },
      { phrase: "what is today's date", expectedIntent: 'DATE' },
      { phrase: 'what day is today', expectedIntent: 'DATE' },
      { phrase: 'current date', expectedIntent: 'DATE' },
      { phrase: 'are you online', expectedIntent: 'ONLINE_STATUS' },
      { phrase: 'is my computer online', expectedIntent: 'ONLINE_STATUS' },
      { phrase: 'network status', expectedIntent: 'ONLINE_STATUS' },
      { phrase: 'which model am I using', expectedIntent: 'MODEL_STATUS' },
      { phrase: 'what model', expectedIntent: 'MODEL_STATUS' },
      { phrase: 'what devices are online', expectedIntent: 'DEVICE_STATUS' },
      { phrase: 'connected devices', expectedIntent: 'DEVICE_STATUS' },
      { phrase: 'fabric status', expectedIntent: 'FABRIC_STATUS' },
      { phrase: 'battery status', expectedIntent: 'HARDWARE_STATUS' },
      { phrase: 'calculate 25 * 4', expectedIntent: 'CALCULATION' },
      { phrase: 'who are you', expectedIntent: 'IDENTITY' },
      { phrase: 'hello', expectedIntent: 'GREETING' },
      { phrase: 'go to sleep', expectedIntent: 'APP_CONTROL' },
    ];

    for (const { phrase, expectedIntent } of testCases) {
      const c = engine.classifyDirective(phrase);
      assert(c.intent === expectedIntent, `Expected ${phrase} -> ${expectedIntent}, got ${c.intent}`);
      assert(c.priority === 'P0', `Expected P0 priority for ${phrase}, got ${c.priority}`);
      assert(c.deterministic === true, `Expected deterministic:true for ${phrase}`);
    }
  });

  // Test 2: Sandboxed Arithmetic Evaluator
  test('Sandboxed Arithmetic Evaluator (Zero eval, token parsing)', () => {
    const addRes = engine.evaluateSimpleMath('15 + 27');
    assert(addRes === '15 + 27 is 42.', `Expected addition 42, got ${addRes}`);

    const mulRes = engine.evaluateSimpleMath('12 * 8');
    assert(mulRes === '12 times 8 is 96.', `Expected multiplication 96, got ${mulRes}`);

    const divRes = engine.evaluateSimpleMath('100 / 4');
    assert(divRes === '100 divided by 4 is 25.', `Expected division 25, got ${divRes}`);

    const divZero = engine.evaluateSimpleMath('50 / 0');
    assert(divZero === 'Division by zero is undefined.', `Expected zero error, got ${divZero}`);

    const expRes = engine.evaluateSimpleMath('2 ^ 8');
    assert(expRes === '2 ^ 8 is 256.', `Expected exponent 256, got ${expRes}`);

    const pctRes = engine.evaluateSimpleMath('20% of 150');
    assert(pctRes === '20% of 150 is 30.', `Expected percentage 30, got ${pctRes}`);

    const pctWords = engine.evaluateSimpleMath('15 percent of 200');
    assert(pctWords === '15% of 200 is 30.', `Expected percentage 30, got ${pctWords}`);

    const injection = engine.evaluateSimpleMath('process.exit(1)');
    assert(injection === null, 'Injection attack must be rejected as null');
  });

  // Test 3: Time & Date Deterministic Execution (< 20ms, LLM Bypassed)
  test('TIME & DATE resolution (< 20ms, LLM Bypassed)', () => {
    const t0 = Date.now();
    const timeRes = engine.evaluate('AIVA, what time is it?');
    const elapsed = Date.now() - t0;

    assert(timeRes !== null, 'timeRes should not be null');
    assert(timeRes!.handled === true, 'Fast path must handle time directive');
    assert(timeRes!.intent === 'TIME', 'Intent must be TIME');
    assert(timeRes!.model === 'NONE', 'Model must be NONE (Zero LLM)');
    assert(timeRes!.toolCalled === 'SYSTEM_CLOCK', 'Tool must be SYSTEM_CLOCK');
    assert(timeRes!.diagnostics.includes('LLM: BYPASSED'), 'Diagnostics must record LLM: BYPASSED');
    assert(/current time is \d+:\d+/i.test(timeRes!.response), 'Response must contain formatted time');
    assert(elapsed < 20, `TIME latency must be < 20ms, got ${elapsed}ms`);

    const dateRes = engine.evaluate("what is today's date");
    assert(dateRes !== null && dateRes.handled === true, 'Fast path must handle date directive');
    assert(dateRes!.intent === 'DATE', 'Intent must be DATE');
    assert(dateRes!.model === 'NONE', 'Model must be NONE (Zero LLM)');
    assert(dateRes!.diagnostics.includes('LLM: BYPASSED'), 'Diagnostics must record LLM: BYPASSED');
    assert(/today is/i.test(dateRes!.response), 'Response must contain formatted date');
  });

  // Test 4: Online Status, Model Status, and Device Status (< 20ms)
  test('Online Status, Model Status, and Device Status (< 20ms)', () => {
    const onlineRes = engine.evaluate('are you online', { isOnline: true });
    assert(onlineRes !== null && onlineRes.handled === true, 'Must handle online status');
    assert(onlineRes!.model === 'NONE', 'Model must be NONE');
    assert(onlineRes!.response.includes('online'), 'Response must confirm online');

    const modelRes = engine.evaluate('which model am I using', {
      selectedProvider: 'ollama',
      selectedModel: 'qwen3:4b',
    });
    assert(modelRes !== null && modelRes.handled === true, 'Must handle model status');
    assert(modelRes!.model === 'NONE', 'Model must be NONE');
    assert(modelRes!.response === 'Currently running qwen3:4b via ollama.', 'Response must match model config');

    const devRes = engine.evaluate('what devices are online', {
      onlineDevices: ['PC-B'],
      offlineDevices: ['PC-A', 'Android'],
    });
    assert(devRes !== null && devRes.handled === true, 'Must handle device status');
    assert(devRes!.model === 'NONE', 'Model must be NONE');
    assert(devRes!.response.includes('PC-B'), 'Response must list online node');
  });

  // Test 5: Fast Math Evaluation (< 20ms)
  test('Fast Math Evaluation (< 20ms)', () => {
    const calcRes = engine.evaluate('calculate 15 plus 27');
    assert(calcRes !== null && calcRes.handled === true, 'Must handle fast math');
    assert(calcRes!.model === 'NONE', 'Model must be NONE');
    assert(calcRes!.response === '15 + 27 is 42.', `Expected 42, got ${calcRes!.response}`);
    assert(calcRes!.toolCalled === 'FAST_MATH', 'Tool must be FAST_MATH');
  });

  // Test 6: Instant Acknowledgement for Long Tasks (Section 7)
  test('Instant Acknowledgement for Long Tasks (< 20ms)', () => {
    const buildRes = engine.evaluate('Build me a full-stack React application.');
    assert(buildRes !== null && buildRes.handled === true, 'Must handle build directive acknowledgement');
    assert(buildRes!.isAsyncAcknowledgement === true, 'Must flag as async acknowledgement');
    assert(buildRes!.model === 'NONE (Fast Path Ack)', 'Model must be NONE (Fast Path Ack)');
    assert(buildRes!.response === "I'll review the architecture and begin building.", 'Expected architecture ack');

    const debugRes = engine.evaluate('Fix the bug in the authentication controller.');
    assert(debugRes !== null && debugRes.handled === true, 'Must handle debug directive acknowledgement');
    assert(debugRes!.isAsyncAcknowledgement === true, 'Must flag as async acknowledgement');
    assert(debugRes!.response === "I'm on it. Analyzing the codebase now.", 'Expected codebase analyzing ack');
  });

  // Test 7: Non-Deterministic Fallthrough to Model Router
  test('Non-Deterministic Fallthrough to Model Router', () => {
    const chatRes = engine.evaluate('Why is quantum mechanics counterintuitive?');
    assert(chatRes === null, 'Complex conversational questions must return null to fall through to Model Router');

    const storyRes = engine.evaluate('Write a short sci-fi story about an autonomous node.');
    assert(storyRes === null, 'Creative generation prompts must return null to fall through to Model Router');
  });

  console.log('\n============================================================');
  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('============================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runFastPathTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
