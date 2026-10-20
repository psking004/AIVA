const https = require('https');

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = 'pWNTwVg1VWkpYKZmDfW2';

console.log(`Testing direct ElevenLabs stream with voiceId=${voiceId.slice(-4)}...`);

async function testElevenStream(latencyOpt = 0) {
  const t0 = Date.now();
  let firstByteMs = 0;
  let totalBytes = 0;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=${latencyOpt}`;
  const payload = JSON.stringify({
    text: "The capital of India is New Delhi.",
    model_id: "eleven_multilingual_v2",
    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
  });

  return new Promise((resolve) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
      },
      (res) => {
        res.on('data', (c) => {
          if (!firstByteMs) firstByteMs = Date.now() - t0;
          totalBytes += c.length;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, firstByteMs, totalMs: Date.now() - t0, bytes: totalBytes });
        });
      }
    );
    req.on('error', (e) => resolve({ error: e.message, totalMs: Date.now() - t0 }));
    req.write(payload);
    req.end();
  });
}

async function run() {
  for (const opt of [0, 3, 4]) {
    console.log(`\nTesting optimize_streaming_latency=${opt}...`);
    for (let i = 1; i <= 2; i++) {
      const res = await testElevenStream(opt);
      console.log(`  Run ${i}: status=${res.status}, firstByte=${res.firstByteMs}ms, total=${res.totalMs}ms, bytes=${res.bytes}`);
    }
  }
}

run();
