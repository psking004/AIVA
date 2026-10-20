const https = require('https');

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || '';
const prompt = "What is the capital of India? (Answer concisely in 1 to 2 spoken sentences.)";

async function testStream() {
  const t0 = Date.now();
  let firstTokenTime = 0;
  let firstSentenceTime = 0;
  let accumulated = '';
  let firstSentence = '';

  const payload = JSON.stringify({
    model: 'qwen/qwen-2.5-72b-instruct',
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    max_tokens: 60,
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
          'X-Title': 'AIVA Stream Bench',
        },
      },
      (res) => {
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep partial line

          for (const line of lines) {
            const clean = line.trim();
            if (!clean.startsWith('data: ')) continue;
            const dataStr = clean.slice(6);
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                if (!firstTokenTime) {
                  firstTokenTime = Date.now() - t0;
                }
                accumulated += delta;
                if (!firstSentenceTime && /[.!?]\s*$/.test(accumulated.trim())) {
                  firstSentenceTime = Date.now() - t0;
                  firstSentence = accumulated.trim();
                }
              }
            } catch (_) {}
          }
        });

        res.on('end', () => {
          const totalTime = Date.now() - t0;
          resolve({
            firstTokenTime,
            firstSentenceTime: firstSentenceTime || totalTime,
            totalTime,
            firstSentence: firstSentence || accumulated.trim(),
            fullText: accumulated.trim(),
          });
        });
      }
    );

    req.on('error', (err) => resolve({ error: err.message }));
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log("Benchmarking OpenRouter Streaming First-Token and First-Sentence Latency...");
  for (let i = 1; i <= 3; i++) {
    const res = await testStream();
    console.log(`Run #${i}:`);
    console.log(`  First Token:    ${res.firstTokenTime}ms`);
    console.log(`  First Sentence: ${res.firstSentenceTime}ms`);
    console.log(`  Total Time:     ${res.totalTime}ms`);
    console.log(`  First Sentence: "${res.firstSentence}"`);
    console.log(`  Full Text:      "${res.fullText}"\n`);
  }
}

main();
