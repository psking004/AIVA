/**
 * AIVA Centralized Wake-Word Gate & Telemetry
 * Production Hardened Voice Activation Gate
 *
 * Implements Master Implementation & Hardening Rules:
 * Section 3: Centralized isValidWakeEvent Gate
 * Section 4: Exact Matching (strict allowlist, zero fuzzy matching)
 * Section 5: "Ava" completely removed
 * Section 6: Rigorous Confidence Policy (>= 0.70 exact, >= 0.72 compound)
 * Section 7: Candidates vs Valid Wakes separation
 * Section 8: Partial/Hypothesis events strictly rejected
 * Section 9: Single Event per Wake & duplicate event suppression
 * Section 10: Real 2500ms Debounce
 * Section 11: State Gate (Accept only in DORMANT)
 * Section 13: Acoustic Settling & TTS Echo Suppression
 * Section 20: Comprehensive Candidate Diagnostics Logging
 * Section 26: Telemetry counters (candidates, valid, rejected, false positives)
 */

const ALLOWED_WAKE_PHRASES = new Set(['aiva', 'hey aiva']);
const MIN_CONFIDENCE_EXACT = 0.70;    // Strictly >= 0.70 for exact "aiva"
const MIN_CONFIDENCE_COMPOUND = 0.72; // Strictly >= 0.72 for "hey aiva"
const WAKE_DEBOUNCE_MS = 2500;
const DUPLICATE_EVENT_WINDOW_MS = 1500;
const ACOUSTIC_SETTLING_WINDOW_MS = 800; // 800ms silence after TTS/cooldown

// Telemetry counters (Section 26)
const wakeTelemetry = {
  candidates: 0,
  validWakes: 0,
  rejectedWakes: 0,
  falsePositiveCandidates: 0,
  reasons: {
    INVALID_PAYLOAD: 0,
    NOT_FINAL: 0,
    RECOGNITION_REJECTED: 0,
    EMPTY_TRANSCRIPT: 0,
    STATE_LOCKED: 0,
    PAUSED: 0,
    ACOUSTIC_SETTLING: 0,
    PHRASE_MISMATCH: 0,
    LOW_CONFIDENCE: 0,
    DEBOUNCE: 0,
    DUPLICATE_EVENT: 0,
  }
};

let lastWakeTimestamp = 0;
let lastProcessedCandidateText = '';
let lastProcessedCandidateTime = 0;

/**
 * Normalizes speech recognition transcripts for exact matching
 */
function normalizeWakeTranscript(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:'"-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Centralized Wake Gate
 * Evaluates candidate against all 9 production gate criteria.
 *
 * @param {Object} candidate - Raw speech recognition event
 * @param {Object} context - Current system state
 * @param {Function} [logger] - Optional logger function
 * @returns {Object} { accepted: boolean, reason: string, normalized?: string, confidence?: number }
 */
function isValidWakeEvent(candidate, context = {}, logger = null) {
  wakeTelemetry.candidates++;

  const assistantState = context.assistantState || 'DORMANT';
  const isPaused = Boolean(context.isWakeListenerPaused);
  const lastTtsEndTime = context.lastTtsEndTime || 0;
  const now = context.now || Date.now();

  const logDiag = (accepted, reason, normalized, rawText, conf, isFinal) => {
    const diagMsg = `[WAKE-CANDIDATE] raw="${rawText}" normalized="${normalized}" confidence=${conf} final=${isFinal} state=${assistantState} accepted=${accepted} reason=${reason}`;
    if (typeof logger === 'function') {
      logger(diagMsg);
    }
  };

  // 1. Validate payload structure
  if (!candidate || typeof candidate !== 'object') {
    recordRejection('INVALID_PAYLOAD', candidate, '', 0, true, assistantState, logDiag);
    return { accepted: false, reason: 'INVALID_PAYLOAD' };
  }

  const rawText = (candidate.text || '').trim();
  const conf = typeof candidate.confidence === 'number' ? candidate.confidence : 0;
  const isFinal = candidate.isFinal !== undefined ? Boolean(candidate.isFinal) : true;
  const isRejected = Boolean(candidate.isRejected);

  // 2. Reject partial/hypothesis events (Section 8: Partial recognition must never wake AIVA)
  if (!isFinal) {
    const norm = normalizeWakeTranscript(rawText);
    recordRejection('NOT_FINAL', candidate, norm, conf, false, assistantState, logDiag);
    return { accepted: false, reason: 'NOT_FINAL' };
  }

  // 2b. Reject engine-rejected recognitions (Audio detected but rejected by acoustic grammar)
  if (isRejected) {
    const norm = normalizeWakeTranscript(rawText);
    recordRejection('RECOGNITION_REJECTED', candidate, norm, conf, true, assistantState, logDiag);
    return { accepted: false, reason: 'RECOGNITION_REJECTED' };
  }

  // 3. Transcript extraction & normalization (Section 4)
  if (!rawText) {
    recordRejection('EMPTY_TRANSCRIPT', candidate, '', conf, true, assistantState, logDiag);
    return { accepted: false, reason: 'EMPTY_TRANSCRIPT' };
  }
  const normalized = normalizeWakeTranscript(rawText);

  // 4. State Gate (Section 11: AIVA may accept a wake event ONLY in DORMANT)
  if (assistantState !== 'DORMANT') {
    recordRejection('STATE_LOCKED', candidate, normalized, conf, true, assistantState, logDiag);
    return { accepted: false, reason: 'STATE_LOCKED', state: assistantState };
  }

  // 4b. Listener Paused Check
  if (isPaused) {
    recordRejection('PAUSED', candidate, normalized, conf, true, assistantState, logDiag);
    return { accepted: false, reason: 'PAUSED' };
  }

  // 5. Acoustic Settling Gate (Section 13: Acoustic settling after TTS finishes speaking)
  if (lastTtsEndTime > 0 && now - lastTtsEndTime < ACOUSTIC_SETTLING_WINDOW_MS) {
    recordRejection('ACOUSTIC_SETTLING', candidate, normalized, conf, true, assistantState, logDiag);
    return { accepted: false, reason: 'ACOUSTIC_SETTLING' };
  }

  // 6. Exact Wake Phrase Matching (Section 4 & 5: strictly "aiva" or "hey aiva")
  if (!ALLOWED_WAKE_PHRASES.has(normalized)) {
    recordRejection('PHRASE_MISMATCH', candidate, normalized, conf, true, assistantState, logDiag);
    return { accepted: false, reason: 'PHRASE_MISMATCH', normalized };
  }

  // 7. Confidence Policy (Section 6 & 28)
  const minConf = normalized === 'hey aiva' ? MIN_CONFIDENCE_COMPOUND : MIN_CONFIDENCE_EXACT;
  if (conf < minConf) {
    recordRejection('LOW_CONFIDENCE', candidate, normalized, conf, true, assistantState, logDiag);
    return { accepted: false, reason: 'LOW_CONFIDENCE', confidence: conf, required: minConf };
  }

  // 8. Real Debounce (Section 10)
  if (lastWakeTimestamp > 0 && now - lastWakeTimestamp < WAKE_DEBOUNCE_MS) {
    recordRejection('DEBOUNCE', candidate, normalized, conf, true, assistantState, logDiag);
    return { accepted: false, reason: 'DEBOUNCE' };
  }

  // 9. Single Event per Wake / Duplicate Event Suppression (Section 9)
  if (normalized === lastProcessedCandidateText && now - lastProcessedCandidateTime < DUPLICATE_EVENT_WINDOW_MS) {
    recordRejection('DUPLICATE_EVENT', candidate, normalized, conf, true, assistantState, logDiag);
    return { accepted: false, reason: 'DUPLICATE_EVENT' };
  }

  // ACCEPT VALID WAKE
  lastWakeTimestamp = now;
  lastProcessedCandidateText = normalized;
  lastProcessedCandidateTime = now;
  wakeTelemetry.validWakes++;

  logDiag(true, 'VALID_WAKE', normalized, rawText, conf, true);
  return { accepted: true, reason: 'VALID_WAKE', normalized, confidence: conf };
}

function recordRejection(reason, candidate, normalized, conf, isFinal, state, logDiag) {
  wakeTelemetry.rejectedWakes++;
  if (wakeTelemetry.reasons[reason] !== undefined) {
    wakeTelemetry.reasons[reason]++;
  }

  // Track false positives: candidates that scored high confidence (>= 0.70) but were rejected due to phrase or state
  if (conf >= MIN_CONFIDENCE_EXACT && reason !== 'VALID_WAKE') {
    wakeTelemetry.falsePositiveCandidates++;
  }

  const rawText = candidate && candidate.text ? candidate.text : '';
  logDiag(false, reason, normalized, rawText, conf, isFinal);
}

function resetWakeTelemetry() {
  wakeTelemetry.candidates = 0;
  wakeTelemetry.validWakes = 0;
  wakeTelemetry.rejectedWakes = 0;
  wakeTelemetry.falsePositiveCandidates = 0;
  for (const k of Object.keys(wakeTelemetry.reasons)) {
    wakeTelemetry.reasons[k] = 0;
  }
  lastWakeTimestamp = 0;
  lastProcessedCandidateText = '';
  lastProcessedCandidateTime = 0;
}

function getWakeTelemetry() {
  return JSON.parse(JSON.stringify(wakeTelemetry));
}

module.exports = {
  ALLOWED_WAKE_PHRASES,
  MIN_CONFIDENCE_EXACT,
  MIN_CONFIDENCE_COMPOUND,
  WAKE_DEBOUNCE_MS,
  DUPLICATE_EVENT_WINDOW_MS,
  ACOUSTIC_SETTLING_WINDOW_MS,
  normalizeWakeTranscript,
  isValidWakeEvent,
  getWakeTelemetry,
  resetWakeTelemetry,
};
