const https = require('https');

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || '';
const prompt = "What is the capital of India? (Answer in 1 sentence.)";

const testModels = [
  'qwen/qwen-2.5-7b-instruct',
  'meta-llama/llama-3.3-70b-instruct',
  'google/gemini-2.0-flash-001',
  'qwen/qwen-2.5-72b-instruct'
];

async function testModel(model) {
  const t0 = Date.now();
  let firstTokenMs = 0;
  let text = '';

  const payload = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    max_tokens: 30,
  });

  return new Promise((resolve) => {
    const req = https.request(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'HTTP-Referer': 'https://aiva.ai',
          'X-Title': 'Fast Model Bench',
        },
      },
      (res) => {
        let buffer = '';
        res.on('data', (c) => {
          buffer += c.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            const clean = line.trim();
            if (!clean.startsWith('data: ')) continue;
            if (clean === 'data: [DONE]') continue;
            try {
              const delta = JSON.parse(clean.slice(6)).choices?.[0]?.delta?.content || '';
              if (delta) {
                if (!firstTokenMs) firstTokenMs = Date.now() - t0;
                text += delta;
              }
            } catch (_) {}
          }
        });
        res.on('end', () => {
          resolve({ model, status: res.statusCode, firstTokenMs: firstTokenMs || (Date.now() - t0), totalMs: Date.now() - t0, text: text.trim() });
        });
      }
    );
    req.on('error', (e) => resolve({ model, error: e.message, totalMs: Date.now() - t0 }));
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log("=== COMPARING OPENROUTER MODELS FOR ULTRA-LOW-LATENCY VOICE ===");
  for (const m of testModels) {
    const res = await testModel(m);
    console.log(`Model: ${m}`);
    console.log(`  Status:      ${res.status}`);
    console.log(`  First Token: ${res.firstTokenMs}ms`);
    console.log(`  Total:       ${res.totalMs}ms`);
    console.log(`  Text:        "${res.text || res.error}"\n`);
  }
}

main();
