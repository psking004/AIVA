/**
 * AIVA Request Latency Instrumentation & Telemetry
 * Implements Section 2, Section 5, and Section 23 of the Real Runtime Latency Specification.
 *
 * Tracks granular request lifecycle breakdown:
 * - WAKE: Wake word detection and audio verification
 * - STT: Microphone streaming and speech-to-text transcription
 * - INTENT: Deterministic intent classification (P0..P5)
 * - ROUTE: Fast-path bypass vs model selector
 * - TOOL: System clock / local tool / fast math execution
 * - MODEL: LLM inference (0ms if bypassed)
 * - TTFT: Time to first token
 * - TTS: Kokoro synthesis or instant cache fetch
 * - AUDIO: Audio playback initiation
 * - TOTAL: Complete end-to-end request latency
 *
 * Explicit Milestones:
 * - WAKE_DETECTED
 * - STT_START
 * - STT_END
 * - INTENT_START
 * - INTENT_END
 * - FAST_PATH_START
 * - FAST_PATH_END
 * - TTS_START
 * - TTS_FIRST_AUDIO
 * - AUDIO_PLAY
 * - AUDIO_END
 * - REQUEST_COMPLETE
 *
 * Calculated Metrics:
 * - wake_to_stt
 * - stt_duration
 * - stt_to_intent
 * - intent_duration
 * - intent_to_result
 * - result_to_tts
 * - tts_to_audio
 * - USER_PERCEIVED_RESPONSE_LATENCY (user finishes speaking -> AIVA begins speaking)
 * - TOTAL_USER_LATENCY
 */

class LatencyTracker {
  constructor(requestId) {
    this.requestId = requestId || `turn_${Date.now()}`;
    this.t0 = Date.now();
    this.milestones = {};
    this.stages = {
      WAKE_MS: 0,
      STT_MS: 0,
      INTENT_MS: 0,
      ROUTE_MS: 0,
      TOOL_MS: 0,
      MODEL_MS: 0,
      TTFT_MS: 0,
      TTS_MS: 0,
      AUDIO_MS: 0,
      USER_PERCEIVED_MS: 0,
      TOTAL_MS: 0,
    };
    this.metadata = {
      route: 'UNKNOWN',
      model: 'NONE',
      llmBypassed: true,
      tool: 'NONE',
    };
  }

  mark(milestoneName) {
    this.milestones[milestoneName] = Date.now();
  }

  setStage(stageName, durationMs) {
    if (stageName in this.stages) {
      this.stages[stageName] = Math.max(0, Math.round(durationMs));
    }
  }

  setMeta(key, value) {
    this.metadata[key] = value;
  }

  finalize(extraMeta = {}) {
    this.mark('REQUEST_COMPLETE');
    this.stages.TOTAL_MS = Math.max(1, Date.now() - this.t0);
    Object.assign(this.metadata, extraMeta);

    // Calculate user-perceived response latency:
    // (Time user finishes speaking -> Time AIVA begins speaking)
    // = Whisper transcription + intent + route + tool/model + TTS synthesis + audio playback start
    const userPerceived =
      this.stages.INTENT_MS +
      this.stages.ROUTE_MS +
      this.stages.TOOL_MS +
      this.stages.MODEL_MS +
      this.stages.TTS_MS +
      this.stages.AUDIO_MS;
    this.stages.USER_PERCEIVED_MS = Math.max(1, userPerceived);

    const s = this.stages;
    const formatted = [
      `================ AIVA END-TO-END LATENCY REPORT ================`,
      `AIVA REQUEST`,
      `requestId:                       ${this.requestId}`,
      `ROUTE:                           ${this.metadata.route}`,
      `MODEL:                           ${this.metadata.model}`,
      `LLM_STATUS:                      ${this.metadata.llmBypassed ? 'LLM=BYPASSED' : 'LLM=INVOKED'}`,
      `TOOL:                            ${this.metadata.tool}`,
      `----------------------------------------------------------------`,
      `WAKE_DETECTED                    ${s.WAKE_MS.toString().padStart(6)} ms`,
      `STT_DURATION                     ${s.STT_MS.toString().padStart(6)} ms`,
      `INTENT_DURATION                  ${s.INTENT_MS.toString().padStart(6)} ms`,
      `ROUTE_DECISION                   ${s.ROUTE_MS.toString().padStart(6)} ms`,
      `TOOL_EXECUTION                   ${s.TOOL_MS.toString().padStart(6)} ms`,
      `MODEL_INFERENCE                  ${s.MODEL_MS.toString().padStart(6)} ms`,
      `TTS_SYNTHESIS                    ${s.TTS_MS.toString().padStart(6)} ms`,
      `AUDIO_PLAYBACK_START             ${s.AUDIO_MS.toString().padStart(6)} ms`,
      `----------------------------------------------------------------`,
      `USER_PERCEIVED_RESPONSE_LATENCY  ${s.USER_PERCEIVED_MS.toString().padStart(6)} ms`,
      `TOTAL_END_TO_END_LATENCY         ${s.TOTAL_MS.toString().padStart(6)} ms`,
      `================================================================`,
    ].join('\n');

    return {
      requestId: this.requestId,
      stages: { ...this.stages },
      metadata: { ...this.metadata },
      formatted,
    };
  }
}

function createLatencyTracker(requestId) {
  return new LatencyTracker(requestId);
}

module.exports = {
  LatencyTracker,
  createLatencyTracker,
};
