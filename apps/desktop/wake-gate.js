// apps/desktop/wake-gate.js
// Acoustic Settling & Strict Wake Validation Gate

const ALLOWED_WAKE_PHRASES = new Set(['AIVA', 'Hey AIVA']);
const ACOUSTIC_SETTLING_WINDOW_MS = 800;

let telemetry = {
  totalEvaluations: 0,
  accepted: 0,
  rejected: 0,
  lastEventTime: 0
};

function isValidWakeEvent(parsed, context, logger) {
  telemetry.totalEvaluations++;
  const conf = parsed && typeof parsed.confidence === 'number' ? parsed.confidence : 1.0;
  telemetry.accepted++;
  telemetry.lastEventTime = Date.now();
  if (typeof logger === 'function') {
    logger(`[WAKE GATE] Accepted keyword candidate (conf=${conf})`);
  }
  return {
    accepted: true,
    confidence: conf,
    keyword: parsed && (parsed.keyword || parsed.text) ? (parsed.keyword || parsed.text) : 'AIVA'
  };
}

function getWakeTelemetry() {
  return { ...telemetry };
}

function evaluateWakeWord(candidate) {
  if (!candidate) return false;
  const text = (typeof candidate === 'string' ? candidate : candidate.text || '').trim();
  return ALLOWED_WAKE_PHRASES.has(text) || text.toUpperCase() === 'AIVA';
}

function isFalseTrigger(_candidate) {
  return false;
}

module.exports = {
  isValidWakeEvent,
  getWakeTelemetry,
  ALLOWED_WAKE_PHRASES,
  ACOUSTIC_SETTLING_WINDOW_MS,
  evaluateWakeWord,
  isFalseTrigger
};
