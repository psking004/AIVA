const http = require('http');

async function testTTS(text) {
  const t0 = Date.now();
  let firstByteMs = 0;

  const payload = JSON.stringify({ text });

  return new Promise((resolve) => {
    const req = http.request(
      'http://localhost:3000/api/voice/speak',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let audioBytes = 0;
        res.on('data', (chunk) => {
          if (!firstByteMs) {
            firstByteMs = Date.now() - t0;
          }
          audioBytes += chunk.length;
        });
        res.on('end', () => {
          const totalMs = Date.now() - t0;
          resolve({
            status: res.statusCode,
            firstByteMs,
            totalMs,
            bytes: audioBytes,
            contentType: res.headers['content-type'],
          });
        });
      }
    );

    req.on('error', (err) => resolve({ error: err.message, totalMs: Date.now() - t0 }));
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log("=== BENCHMARKING ELEVENLABS TTS LATENCY VIA /api/voice/speak ===");
  const text = "The capital of India is New Delhi.";
  console.log(`Synthesizing: "${text}"\n`);

  for (let i = 1; i <= 3; i++) {
    const res = await testTTS(text);
    console.log(`Run #${i}:`);
    console.log(`  Status:      ${res.status}`);
    console.log(`  First Byte:  ${res.firstByteMs}ms`);
    console.log(`  Total:       ${res.totalMs}ms`);
    console.log(`  Audio Bytes: ${res.bytes} bytes`);
    console.log(`  Type:        ${res.contentType}\n`);
  }
}

main();
