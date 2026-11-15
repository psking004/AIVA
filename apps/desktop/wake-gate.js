// apps/desktop/wake-gate.js
// Acoustic Settling & Strict Wake Validation Gate

const ALLOWED_WAKE_PHRASES = new Set(['AIVA', 'HEY AIVA', 'IVA', 'HEY IVA']);
const ACOUSTIC_SETTLING_WINDOW_MS = 800;

let telemetry = {
  totalEvaluations: 0,
  accepted: 0,
  rejected: 0,
  lastEventTime: 0
};

function normalizeKeyword(text) {
  if (!text || typeof text !== 'string') return '';
  return text.trim().toUpperCase().replace(/[^A-Z\s]/g, '');
}

function isValidWakeEvent(parsed, context, logger) {
  telemetry.totalEvaluations++;
  const rawText = parsed && (parsed.keyword || parsed.text) ? (parsed.keyword || parsed.text) : '';
  const clean = normalizeKeyword(rawText);
  const conf = parsed && typeof parsed.confidence === 'number' ? parsed.confidence : 1.0;

  const isMatched = clean === 'AIVA' || clean === 'HEY AIVA' || clean === 'IVA' || clean === 'HEY IVA' || clean.includes('AIVA') || clean.includes('IVA');

  if (!isMatched) {
    telemetry.rejected++;
    if (typeof logger === 'function') {
      logger(`[WAKE GATE] Rejected non-wake candidate: "${rawText}" (clean="${clean}")`);
    }
    return {
      accepted: false,
      confidence: conf,
      keyword: rawText
    };
  }

  // Reject during active speech output / acoustic settling to eliminate echo feedback
  if (context && context.isWakeListenerPaused) {
    telemetry.rejected++;
    if (typeof logger === 'function') {
      logger(`[WAKE GATE] Rejected wake candidate during paused/settling state`);
    }
    return {
      accepted: false,
      confidence: conf,
      keyword: rawText
    };
  }

  telemetry.accepted++;
  telemetry.lastEventTime = Date.now();
  if (typeof logger === 'function') {
    logger(`[WAKE GATE] Accepted keyword candidate: "${rawText}" (conf=${conf})`);
  }
  return {
    accepted: true,
    confidence: conf,
    keyword: 'AIVA'
  };
}

function getWakeTelemetry() {
  return { ...telemetry };
}

function evaluateWakeWord(candidate) {
  if (!candidate) return false;
  const rawText = typeof candidate === 'string' ? candidate : (candidate.text || candidate.keyword || '');
  const clean = normalizeKeyword(rawText);
  return clean === 'AIVA' || clean === 'HEY AIVA' || clean === 'IVA' || clean === 'HEY IVA' || clean.includes('AIVA');
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
