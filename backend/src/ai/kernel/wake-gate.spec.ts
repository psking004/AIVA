/**
 * AIVA Centralized Wake Gate & False-Positive Elimination Test Suite
 *
 * Implements Section 18 & Section 30 of the Master Implementation & Hardening Prompt:
 * 1. Positive Acceptance: "AIVA" and "Hey AIVA"
 * 2. False Trigger Rejection: "okay", "ok", "ava", "hey ava", "ai", "area", "idea", "java", "diva", "okay aiva", "this is an idea", "AI assistant"
 * 3. Confidence Threshold Gating: Below 0.70 rejected, above 0.70 accepted
 * 4. State Machine Locking: Dropped during MATERIALIZING, LISTENING, THINKING, SPEAKING, EXECUTING, COOLDOWN
 * 5. Partial Recognition Safety: isFinal=false (hypothesis) strictly rejected
 * 6. Acoustic Settling: Suppressed within 800ms of TTS audio completion
 * 7. Real Debounce & Duplicate Suppression: Dropped within 2500ms window
 * 8. Telemetry Verification: Candidates, valid wakes, rejected wakes, false positives recorded accurately
 */

import path from 'path';

// Import production wake-gate module directly from apps/desktop
const wakeGatePath = path.resolve(__dirname, '../../../../apps/desktop/wake-gate.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  isValidWakeEvent,
  getWakeTelemetry,
  resetWakeTelemetry,
  MIN_CONFIDENCE_EXACT,
  MIN_CONFIDENCE_COMPOUND,
} = require(wakeGatePath);

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runWakeGateTestSuite() {
  console.log('\n============================================================');
  console.log('AIVA WAKE GATE & FALSE TRIGGER ELIMINATION TEST SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ FAIL: ${name} -> ${err.message}`);
    }
  }

  // 1. Positive Wake Word Acceptance
  await test('1. Positive Acceptance: "aiva" and "hey aiva" are strictly accepted', () => {
    resetWakeTelemetry();

    const t1 = 100000;
    const res1 = isValidWakeEvent(
      { text: 'AIVA', confidence: 0.92, isFinal: true },
      { assistantState: 'DORMANT', now: t1 }
    );
    assert(res1.accepted === true, 'Exact "AIVA" with high confidence must be accepted');
    assert(res1.reason === 'VALID_WAKE', 'Reason must be VALID_WAKE');
    assert(res1.normalized === 'aiva', 'Normalized text must be "aiva"');

    // After debounce interval (3000ms later)
    const t2 = t1 + 3000;
    const res2 = isValidWakeEvent(
      { text: 'Hey AIVA', confidence: 0.88, isFinal: true },
      { assistantState: 'DORMANT', now: t2 }
    );
    assert(res2.accepted === true, 'Exact "Hey AIVA" must be accepted');
    assert(res2.reason === 'VALID_WAKE', 'Reason must be VALID_WAKE');
    assert(res2.normalized === 'hey aiva', 'Normalized text must be "hey aiva"');
  });

  // 2. False Positive Rejection Matrix (Section 18)
  await test('2. False Trigger Matrix: Rejects conversational words and phonetic lookalikes', () => {
    resetWakeTelemetry();
    let simTime = 200000;

    const falsePhrases = [
      'okay',
      'ok',
      'ava',
      'hey ava',
      'ai',
      'area',
      'idea',
      'java',
      'diva',
      'okay aiva',
      'this is an idea',
      'AI assistant',
      'hello',
      'hey',
      "I've",
      'I have',
      'weather',
      'music',
    ];

    for (const phrase of falsePhrases) {
      simTime += 3000; // Step past debounce to isolate phrase check
      const res = isValidWakeEvent(
        { text: phrase, confidence: 0.95, isFinal: true },
        { assistantState: 'DORMANT', now: simTime }
      );
      assert(res.accepted === false, `Phrase "${phrase}" must be rejected`);
      assert(res.reason === 'PHRASE_MISMATCH', `Rejection reason for "${phrase}" must be PHRASE_MISMATCH, got: ${res.reason}`);
    }
  });

  // 3. Confidence Threshold Gating (Section 6 & 28)
  await test('3. Confidence Policy: Rejects weak candidates below strict thresholds', () => {
    resetWakeTelemetry();
    let simTime = 300000;

    // "aiva" requires MIN_CONFIDENCE_EXACT (0.70)
    const resWeakAiva = isValidWakeEvent(
      { text: 'AIVA', confidence: 0.65, isFinal: true },
      { assistantState: 'DORMANT', now: simTime }
    );
    assert(resWeakAiva.accepted === false, 'AIVA with confidence 0.65 must be rejected');
    assert(resWeakAiva.reason === 'LOW_CONFIDENCE', `Expected LOW_CONFIDENCE, got: ${resWeakAiva.reason}`);

    simTime += 3000;
    const resStrongAiva = isValidWakeEvent(
      { text: 'AIVA', confidence: MIN_CONFIDENCE_EXACT, isFinal: true },
      { assistantState: 'DORMANT', now: simTime }
    );
    assert(resStrongAiva.accepted === true, 'AIVA at threshold 0.70 must be accepted');

    // "hey aiva" requires MIN_CONFIDENCE_COMPOUND (0.72)
    simTime += 3000;
    const resWeakHeyAiva = isValidWakeEvent(
      { text: 'Hey AIVA', confidence: 0.71, isFinal: true },
      { assistantState: 'DORMANT', now: simTime }
    );
    assert(resWeakHeyAiva.accepted === false, 'Hey AIVA with confidence 0.71 must be rejected');
    assert(resWeakHeyAiva.reason === 'LOW_CONFIDENCE', `Expected LOW_CONFIDENCE, got: ${resWeakHeyAiva.reason}`);

    simTime += 3000;
    const resStrongHeyAiva = isValidWakeEvent(
      { text: 'Hey AIVA', confidence: MIN_CONFIDENCE_COMPOUND, isFinal: true },
      { assistantState: 'DORMANT', now: simTime }
    );
    assert(resStrongHeyAiva.accepted === true, 'Hey AIVA at threshold 0.72 must be accepted');
  });

  // 4. State Machine Locking (Section 11)
  await test('4. State Gate: Rejects wake events during active assistant presence', () => {
    resetWakeTelemetry();
    let simTime = 400000;

    const lockedStates = ['MATERIALIZING', 'LISTENING', 'THINKING', 'SPEAKING', 'EXECUTING', 'COOLDOWN'];
    for (const state of lockedStates) {
      simTime += 3000;
      const res = isValidWakeEvent(
        { text: 'AIVA', confidence: 0.95, isFinal: true },
        { assistantState: state, now: simTime }
      );
      assert(res.accepted === false, `Wake in state "${state}" must be rejected`);
      assert(res.reason === 'STATE_LOCKED', `Expected STATE_LOCKED in ${state}, got: ${res.reason}`);
    }
  });

  // 5. Partial / Hypothesis Recognition Safety (Section 8)
  await test('5. Partial Recognition Safety: Intermediary hypotheses must never wake AIVA', () => {
    resetWakeTelemetry();
    const simTime = 500000;

    const resPartial = isValidWakeEvent(
      { text: 'AIVA', confidence: 0.95, isFinal: false },
      { assistantState: 'DORMANT', now: simTime }
    );
    assert(resPartial.accepted === false, 'isFinal=false must never trigger wake');
    assert(resPartial.reason === 'NOT_FINAL', `Expected NOT_FINAL, got: ${resPartial.reason}`);

    const resRejected = isValidWakeEvent(
      { text: '', confidence: 0.2, isFinal: true, isRejected: true },
      { assistantState: 'DORMANT', now: simTime + 100 }
    );
    assert(resRejected.accepted === false, 'Engine-rejected candidate must be dropped');
    assert(resRejected.reason === 'RECOGNITION_REJECTED', `Expected RECOGNITION_REJECTED, got: ${resRejected.reason}`);
  });

  // 6. Acoustic Settling & TTS Echo Suppression (Section 13)
  await test('6. Acoustic Settling: Mutes microphone for 800ms after TTS speech output', () => {
    resetWakeTelemetry();
    const ttsEndTime = 600000;

    // 200ms after TTS ends (room reverb / acoustic echo)
    const resEcho = isValidWakeEvent(
      { text: 'AIVA', confidence: 0.95, isFinal: true },
      { assistantState: 'DORMANT', lastTtsEndTime: ttsEndTime, now: ttsEndTime + 200 }
    );
    assert(resEcho.accepted === false, 'Audio within 800ms of TTS completion must be rejected');
    assert(resEcho.reason === 'ACOUSTIC_SETTLING', `Expected ACOUSTIC_SETTLING, got: ${resEcho.reason}`);

    // 900ms after TTS ends (acoustic settling complete)
    const resPostSettle = isValidWakeEvent(
      { text: 'AIVA', confidence: 0.95, isFinal: true },
      { assistantState: 'DORMANT', lastTtsEndTime: ttsEndTime, now: ttsEndTime + 900 }
    );
    assert(resPostSettle.accepted === true, 'Wake after acoustic settling window must be accepted');
  });

  // 7. Debounce and Rapid Utterance Deduplication (Section 9 & 10)
  await test('7. Rapid Speech: Multiple rapid "AIVA" utterances result in exactly one turn', () => {
    const t0 = 700000;

    // Spoken 1st time
    const res1 = isValidWakeEvent(
      { text: 'AIVA', confidence: 0.90, isFinal: true },
      { assistantState: 'DORMANT', now: t0 }
    );
    assert(res1.accepted === true, 'First AIVA utterance must be accepted');

    // Spoken 2nd time 500ms later (rapid repeat)
    const res2 = isValidWakeEvent(
      { text: 'AIVA', confidence: 0.92, isFinal: true },
      { assistantState: 'DORMANT', now: t0 + 500 }
    );
    assert(res2.accepted === false, 'Rapid second utterance must be rejected');
    assert(res2.reason === 'DEBOUNCE', `Expected DEBOUNCE, got: ${res2.reason}`);

    // Spoken 3rd time 1800ms later (still within 2500ms debounce)
    const res3 = isValidWakeEvent(
      { text: 'AIVA', confidence: 0.91, isFinal: true },
      { assistantState: 'DORMANT', now: t0 + 1800 }
    );
    assert(res3.accepted === false, 'Utterance within 2500ms must be rejected');
    assert(res3.reason === 'DEBOUNCE', `Expected DEBOUNCE, got: ${res3.reason}`);

    // Spoken 4th time 2600ms later (after debounce expires)
    const res4 = isValidWakeEvent(
      { text: 'AIVA', confidence: 0.89, isFinal: true },
      { assistantState: 'DORMANT', now: t0 + 2600 }
    );
    assert(res4.accepted === true, 'Utterance after debounce expires must be accepted');
  });

  // 8. Telemetry Accounting (Section 26)
  await test('8. Telemetry Tracking: Accurate count of candidates, valid wakes, and false positives', () => {
    resetWakeTelemetry();

    // 1. Send valid wake
    isValidWakeEvent(
      { text: 'AIVA', confidence: 0.95, isFinal: true },
      { assistantState: 'DORMANT', now: 800000 }
    );

    // 2. Send phrase mismatch (false positive)
    isValidWakeEvent(
      { text: 'okay', confidence: 0.95, isFinal: true },
      { assistantState: 'DORMANT', now: 804000 }
    );

    // 3. Send low confidence
    isValidWakeEvent(
      { text: 'AIVA', confidence: 0.50, isFinal: true },
      { assistantState: 'DORMANT', now: 808000 }
    );

    // 4. Send state locked
    isValidWakeEvent(
      { text: 'AIVA', confidence: 0.95, isFinal: true },
      { assistantState: 'SPEAKING', now: 812000 }
    );

    // 5. Send acoustic settling
    isValidWakeEvent(
      { text: 'AIVA', confidence: 0.95, isFinal: true },
      { assistantState: 'DORMANT', lastTtsEndTime: 816000, now: 816200 }
    );

    // 6. Send debounce
    isValidWakeEvent(
      { text: 'AIVA', confidence: 0.95, isFinal: true },
      { assistantState: 'DORMANT', now: 820000 }
    );
    isValidWakeEvent(
      { text: 'AIVA', confidence: 0.95, isFinal: true },
      { assistantState: 'DORMANT', now: 820500 }
    );

    const telem = getWakeTelemetry();
    assert(telem.candidates === 7, `Expected 7 candidates, got ${telem.candidates}`);
    assert(telem.validWakes >= 1, `Expected >= 1 valid wake, got ${telem.validWakes}`);
    assert(telem.rejectedWakes >= 5, `Expected >= 5 rejected wakes, got ${telem.rejectedWakes}`);
    assert(telem.candidates === telem.validWakes + telem.rejectedWakes, 'Candidates must equal valid + rejected');
    assert(telem.reasons.PHRASE_MISMATCH > 0, 'PHRASE_MISMATCH count must be recorded');
    assert(telem.reasons.LOW_CONFIDENCE > 0, 'LOW_CONFIDENCE count must be recorded');
    assert(telem.reasons.STATE_LOCKED > 0, 'STATE_LOCKED count must be recorded');
    assert(telem.reasons.ACOUSTIC_SETTLING > 0, 'ACOUSTIC_SETTLING count must be recorded');
    assert(telem.reasons.DEBOUNCE > 0, 'DEBOUNCE count must be recorded');
  });

  console.log('\n============================================================');
  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('============================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runWakeGateTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
