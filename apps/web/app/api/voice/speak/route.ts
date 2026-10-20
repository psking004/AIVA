/**
 * AIVA Multi-Provider TTS Backend Route
 *
 * Implements:
 * 1. Multi-Provider Orchestration:
 *    - PRIMARY LOCAL: Kokoro ONNX (82M open-weight, 0 cloud credits, 100% private)
 *    - CLOUD FALLBACK: ElevenLabs (eleven_multilingual_v2) when explicitly configured
 * 2. In-Memory Phrase Caching:
 *    - Instantaneous (<5ms) playback for repeated system/conversational phrases
 * 3. Structured Diagnostics:
 *    - Categorized error payloads (zero secret exposure)
 *    - Prevents false playback completion on clients
 */

import { NextRequest, NextResponse } from 'next/server';

// In-memory phrase cache for common system phrases
interface CachedAudio {
  buffer: ArrayBuffer;
  contentType: string;
}
const phraseCache = new Map<string, CachedAudio>();

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'invalid_json', message: 'Request body must be valid JSON.' },
        { status: 400 }
      );
    }

    const rawText = body?.text;
    if (!rawText || typeof rawText !== 'string') {
      return NextResponse.json(
        { error: 'invalid_text', message: 'Field "text" is required and must be a string.' },
        { status: 400 }
      );
    }

    const trimmedText = rawText.trim().slice(0, 1000);
    if (!trimmedText) {
      return NextResponse.json(
        { error: 'empty_text', message: 'Text cannot be empty.' },
        { status: 400 }
      );
    }

    const tStart = Date.now();
    const cacheKey = trimmedText.toLowerCase().replace(/[.,!?;]/g, '').trim();

    // 1. Check in-memory phrase cache
    if (phraseCache.has(cacheKey)) {
      const cached = phraseCache.get(cacheKey)!;
      console.log(`[AIVA TTS CACHE HIT] "${trimmedText}" served in ${Date.now() - tStart}ms`);
      return new Response(cached.buffer, {
        status: 200,
        headers: {
          'Content-Type': cached.contentType,
          'Content-Length': cached.buffer.byteLength.toString(),
          'X-Aiva-Tts-Provider': 'cache',
          'Cache-Control': 'no-cache',
        },
      });
    }

    const configuredProvider = process.env.AIVA_TTS_PROVIDER || 'kokoro';
    const kokoroPort = process.env.KOKORO_PORT || '5050';

    // 2. Try Primary Local Engine: Kokoro ONNX
    if (configuredProvider === 'kokoro' || configuredProvider === 'local') {
      try {
        const kokoroRes = await fetch(`http://127.0.0.1:${kokoroPort}/synthesize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: trimmedText,
            voice: body?.voice || 'aiva', // AIVA female voice identity (blended international British)
            speed: 1.05,
          }),
        });

        if (kokoroRes.ok) {
          const audioBuffer = await kokoroRes.arrayBuffer();
          const latency = Date.now() - tStart;
          console.log(`[AIVA TTS SUCCESS] Kokoro synthesized ${trimmedText.length} chars (${audioBuffer.byteLength} bytes) in ${latency}ms`);

          // Cache short conversational phrases
          if (trimmedText.length < 100) {
            phraseCache.set(cacheKey, { buffer: audioBuffer, contentType: 'audio/wav' });
          }

          return new Response(audioBuffer, {
            status: 200,
            headers: {
              'Content-Type': 'audio/wav',
              'Content-Length': audioBuffer.byteLength.toString(),
              'X-Aiva-Tts-Provider': 'kokoro',
              'Cache-Control': 'no-cache',
            },
          });
        }
      } catch (_) {
        console.warn('[AIVA TTS] Local Kokoro daemon unreachable, attempting configured fallbacks...');
      }
    }

    // 3. Fallback: ElevenLabs Cloud Provider
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    const voiceId = process.env.AIVA_VOICE_ID?.trim();

    if (!apiKey || !voiceId) {
      console.error(
        '[AIVA TTS ERROR]\n' +
        'provider=none\n' +
        'status=500\n' +
        'category=TTS_UNAVAILABLE\n' +
        'message="Neither Kokoro local daemon nor ElevenLabs credentials are fully available."'
      );
      return NextResponse.json(
        {
          error: 'tts_unavailable',
          category: 'TTS_UNAVAILABLE',
          reason: 'no_available_provider',
          message: 'Speech synthesis is currently offline. Start the Kokoro local daemon or configure ElevenLabs credentials.',
        },
        { status: 503 }
      );
    }

    const elevenResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: trimmedText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    const requestLatencyMs = Date.now() - tStart;

    if (!elevenResponse.ok) {
      const errorText = await elevenResponse.text();
      let safeErrorPayload: any = errorText;
      try {
        safeErrorPayload = JSON.parse(errorText);
      } catch {}

      const detail = safeErrorPayload?.detail || safeErrorPayload;
      const detailCode = detail?.code || '';
      const detailStatus = detail?.status || '';
      const detailType = detail?.type || '';
      const parsedMessage =
        detail?.message ||
        safeErrorPayload?.message ||
        (typeof safeErrorPayload === 'string' ? safeErrorPayload : 'ElevenLabs synthesis failed');

      let category = 'ELEVENLABS_SERVER_ERROR';
      let reason = 'unknown_failure';

      if (detailCode === 'quota_exceeded' || detailStatus === 'quota_exceeded' || /quota/i.test(parsedMessage)) {
        category = 'ELEVENLABS_QUOTA_EXCEEDED';
        reason = 'quota_exceeded';
      } else if (detailStatus === 'missing_permissions' || /permission/i.test(parsedMessage)) {
        category = 'ELEVENLABS_PERMISSION_DENIED';
        reason = 'missing_permissions';
      } else if (elevenResponse.status === 401 || /api key|unauthorized|invalid_api_key/i.test(parsedMessage)) {
        category = 'ELEVENLABS_AUTH_INVALID';
        reason = 'invalid_api_key';
      } else if (/voice/i.test(parsedMessage) || detailCode === 'voice_not_found') {
        category = 'ELEVENLABS_VOICE_INVALID';
        reason = 'invalid_voice_id';
      } else if (elevenResponse.status === 429) {
        category = 'ELEVENLABS_RATE_LIMITED';
        reason = 'rate_limited';
      }

      console.error(
        `[AIVA TTS ERROR]\n` +
        `provider=elevenlabs\n` +
        `status=${elevenResponse.status}\n` +
        `category=${category}\n` +
        `reason=${reason}\n` +
        `message="${parsedMessage}"`
      );

      return NextResponse.json(
        {
          error: 'elevenlabs_error',
          category,
          reason,
          statusCode: elevenResponse.status,
          message: parsedMessage,
          details: {
            code: detailCode,
            status: detailStatus,
            type: detailType,
          },
        },
        { status: elevenResponse.status >= 500 ? 502 : elevenResponse.status }
      );
    }

    const audioBuffer = await elevenResponse.arrayBuffer();
    console.log(`[AIVA TTS SUCCESS] ElevenLabs synthesized in ${requestLatencyMs}ms`);

    if (trimmedText.length < 100) {
      phraseCache.set(cacheKey, { buffer: audioBuffer, contentType: 'audio/mpeg' });
    }

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'X-Aiva-Tts-Provider': 'elevenlabs',
        'X-Aiva-Latency-Ms': requestLatencyMs.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    console.error(
      `[AIVA TTS ERROR]\n` +
      `status=500\n` +
      `category=TTS_SERVER_ERROR\n` +
      `reason=unexpected_exception\n` +
      `message="${err?.message || 'Internal server error'}"`
    );
    return NextResponse.json(
      {
        error: 'server_error',
        category: 'TTS_SERVER_ERROR',
        reason: 'unexpected_exception',
        message: err?.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}
