const https = require('https');
const http = require('http');

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';

const prompt = "What is the capital of India? (Answer concisely in 1 sentence.)";

async function testOpenRouter() {
  const t0 = Date.now();
  let dnsTime = 0;
  let connectTime = 0;
  let ttfb = 0;

  const payload = JSON.stringify({
    model: 'qwen/qwen-2.5-72b-instruct',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 50,
    temperature: 0.7,
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
          'X-Title': 'AIVA Bench',
        },
      },
      (res) => {
        ttfb = Date.now() - t0;
        let data = '';
        res.on('data', (d) => { data += d; });
        res.on('end', () => {
          const total = Date.now() - t0;
          try {
            const parsed = JSON.parse(data);
            const text = parsed.choices?.[0]?.message?.content?.trim() || '';
            resolve({
              provider: 'OpenRouter (qwen-2.5-72b)',
              status: res.statusCode,
              dnsConnect: connectTime || (ttfb - 200),
              ttfb,
              total,
              text,
            });
          } catch (e) {
            resolve({ provider: 'OpenRouter', status: res.statusCode, error: data.substring(0, 120), total });
          }
        });
      }
    );

    req.on('socket', (socket) => {
      socket.on('lookup', () => { dnsTime = Date.now() - t0; });
      socket.on('connect', () => { connectTime = Date.now() - t0; });
    });

    req.on('error', (err) => resolve({ provider: 'OpenRouter', error: err.message, total: Date.now() - t0 }));
    req.write(payload);
    req.end();
  });
}

async function testGemini() {
  const t0 = Date.now();
  let connectTime = 0;
  let ttfb = 0;

  // Test models: gemini-2.0-flash, gemini-1.5-flash
  const model = 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  const payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 50, temperature: 0.7 },
  });

  return new Promise((resolve) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        ttfb = Date.now() - t0;
        let data = '';
        res.on('data', (d) => { data += d; });
        res.on('end', () => {
          const total = Date.now() - t0;
          try {
            const parsed = JSON.parse(data);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            resolve({
              provider: `Gemini (${model})`,
              status: res.statusCode,
              connectTime,
              ttfb,
              total,
              text: text || JSON.stringify(parsed).substring(0, 80),
            });
          } catch (e) {
            resolve({ provider: 'Gemini', status: res.statusCode, error: data.substring(0, 120), total });
          }
        });
      }
    );

    req.on('socket', (socket) => {
      socket.on('connect', () => { connectTime = Date.now() - t0; });
    });

    req.on('error', (err) => resolve({ provider: 'Gemini', error: err.message, total: Date.now() - t0 }));
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log("=== BENCHMARKING AI CLOUD PROVIDERS FOR FAST VOICE COMMANDS ===");
  console.log("Prompt: 'What is the capital of India?'");
  console.log("Running 3 iterations each...\n");

  for (let i = 1; i <= 3; i++) {
    console.log(`--- Run #${i} ---`);
    const orRes = await testOpenRouter();
    console.log(`OpenRouter: Status ${orRes.status} | TTFB: ${orRes.ttfb}ms | Total: ${orRes.total}ms | Text: "${orRes.text || orRes.error}"`);

    const gemRes = await testGemini();
    console.log(`Gemini:     Status ${gemRes.status} | TTFB: ${gemRes.ttfb}ms | Total: ${gemRes.total}ms | Text: "${gemRes.text || gemRes.error}"\n`);
  }
}

main();
