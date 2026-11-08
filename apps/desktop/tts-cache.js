/**
 * AIVA Resident TTS Response Audio Cache
 * Implements Section 9 & 10 of the Master Ultra-Low-Latency Specification.
 *
 * Pre-generates and caches frequently used affirmative and acknowledgement phrases
 * using the resident Kokoro-82M engine.
 * Eliminates repeated on-the-fly synthesis for common responses and yields <5ms TTFC.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Standard phrases to pre-warm and cache
const PRECACHED_PHRASES = [
  'Yes.',
  'Okay.',
  'Done.',
  'One moment.',
  "I'll check.",
  'I found it.',
  "I'm on it.",
  "I'll inspect the project first.",
  "I'm on it. Analyzing the codebase now.",
  "I'll review the architecture and begin building.",
  'Entering dormant mode.',
  'Directive processed.',
];

// In-Memory cache: normalized phrase -> base64 Data URI
const memoryCache = new Map();

function normalizePhrase(text) {
  if (!text) return '';
  return text.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
}

function getCacheDir() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
  const cacheDir = path.join(appData, 'AIVA', 'audio_cache');
  if (!fs.existsSync(cacheDir)) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
    } catch (_) {}
  }
  return cacheDir;
}

function getPhraseHash(phrase) {
  return crypto.createHash('sha256').update(normalizePhrase(phrase)).digest('hex').slice(0, 16);
}

/**
 * Synchronous in-memory lookup (< 1ms)
 */
function getCachedAudioUri(text) {
  const norm = normalizePhrase(text);
  if (memoryCache.has(norm)) {
    return memoryCache.get(norm);
  }

  // Check persistent disk cache
  const cacheDir = getCacheDir();
  const hash = getPhraseHash(text);
  const filePath = path.join(cacheDir, `${hash}.wav`);
  if (fs.existsSync(filePath)) {
    try {
      const buffer = fs.readFileSync(filePath);
      const dataUri = `data:audio/wav;base64,${buffer.toString('base64')}`;
      memoryCache.set(norm, dataUri);
      return dataUri;
    } catch (_) {}
  }

  return null;
}

/**
 * Pre-warm and synthesize cache in background against Kokoro daemon
 */
async function warmupTtsCache(kokoroBaseUrl = 'http://127.0.0.1:5050', onLog = console.log) {
  const cacheDir = getCacheDir();
  let warmedCount = 0;

  for (const phrase of PRECACHED_PHRASES) {
    const norm = normalizePhrase(phrase);
    const hash = getPhraseHash(phrase);
    const filePath = path.join(cacheDir, `${hash}.wav`);

    // Check disk cache first
    if (fs.existsSync(filePath)) {
      try {
        const buffer = fs.readFileSync(filePath);
        const dataUri = `data:audio/wav;base64,${buffer.toString('base64')}`;
        memoryCache.set(norm, dataUri);
        warmedCount++;
        continue;
      } catch (_) {}
    }

    // Synthesize via Kokoro
    try {
      const res = await fetch(`${kokoroBaseUrl.replace(/\/$/, '')}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: phrase, voice: 'af_heart', speed: 1.0 }),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        fs.writeFileSync(filePath, buffer);
        const dataUri = `data:audio/wav;base64,${buffer.toString('base64')}`;
        memoryCache.set(norm, dataUri);
        warmedCount++;
      }
    } catch (err) {
      // Background warmup notice (Kokoro may still be initializing)
      break;
    }
  }

  if (warmedCount > 0) {
    onLog(`[TTS CACHE] Warmed ${warmedCount} responses in memory (0ms audio lookup active)`);
  }
}

module.exports = {
  PRECACHED_PHRASES,
  getCachedAudioUri,
  warmupTtsCache,
  normalizePhrase,
};
