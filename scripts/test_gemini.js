const fs = require('fs');
const https = require('https');

const content = fs.readFileSync('backend/.env', 'utf8');
const m = content.match(/GEMINI_API_KEY=([^\r\n]+)/);
const key = m[1].trim();

const modelsToTest = [
  'gemini-flash-latest',
  'gemini-pro-latest',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp'
];

async function testModel(modelName) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Respond with the word OK' }] }],
    });

    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: `/v1beta/models/${modelName}:generateContent?key=${key}`,
        method: 'POST',
        family: 4,
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode === 200) {
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
              resolve({ model: modelName, status: res.statusCode, text });
            } else {
              resolve({ model: modelName, status: res.statusCode, error: json.error?.message || body.slice(0, 100) });
            }
          } catch {
            resolve({ model: modelName, status: res.statusCode, error: body.slice(0, 100) });
          }
        });
      }
    );

    req.on('timeout', () => {
      resolve({ model: modelName, status: 'TIMEOUT' });
      req.destroy();
    });

    req.on('error', (e) => {
      resolve({ model: modelName, status: 'ERROR', error: e.message });
    });

    req.write(postData);
    req.end();
  });
}

async function run() {
  for (const m of modelsToTest) {
    const res = await testModel(m);
    console.log(m + ' -> ' + res.status + ' ' + (res.text || res.error || ''));
  }
}

run();
