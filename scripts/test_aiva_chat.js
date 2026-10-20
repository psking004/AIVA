/**
 * AIVA Local & Provider Automated Test Driver
 */

const http = require('http');
const { execSync } = require('child_process');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: body });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: body, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('============================================================');
  console.log('AIVA LOCAL INTEGRATION TEST');
  console.log('============================================================\n');

  // 1. Authenticate (Register or Login)
  console.log('1. Authenticating with local AIVA backend...');
  const device = {
    deviceId: 'pc-a-device-001',
    deviceName: 'PC-A Primary Desktop',
    platform: 'windows',
  };

  let token = null;
  // Try login
  let loginRes = await request(
    {
      hostname: '127.0.0.1',
      port: 4000,
      path: '/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      email: 'admin@aiva.local',
      password: 'Password123!',
      device,
    }
  );

  if (loginRes.status === 200 || loginRes.status === 201) {
    token = loginRes.data.accessToken || loginRes.data.token;
    console.log('   ✓ Logged in as existing owner admin@aiva.local');
  } else {
    // Register
    console.log('   Login failed (' + loginRes.status + '), attempting initial owner registration...');
    let regRes = await request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        email: 'admin@aiva.local',
        password: 'Password123!',
        firstName: 'AIVA',
        lastName: 'Admin',
        device,
      }
    );

    if (regRes.status === 200 || regRes.status === 201) {
      token = regRes.data.accessToken || regRes.data.token;
      console.log('   ✓ Registered owner account admin@aiva.local');
    } else {
      console.error('   ✗ Registration failed:', regRes.data);
      process.exit(1);
    }
  }

  if (!token) {
    console.error('   ✗ Failed to obtain JWT token');
    process.exit(1);
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-device-id': 'pc-a-device-001',
  };

  // 2. Health & Status
  console.log('\n2. Checking /health and /ai/status...');
  const healthRes = await request({
    hostname: '127.0.0.1',
    port: 4000,
    path: '/health',
    method: 'GET',
  });
  console.log('   Health:', JSON.stringify(healthRes.data?.services?.aiProviders, null, 2));

  const statusRes = await request({
    hostname: '127.0.0.1',
    port: 4000,
    path: '/ai/status',
    method: 'GET',
    headers: authHeaders,
  });
  console.log('   Status:', JSON.stringify({
    activeStrategy: statusRes.data?.activeStrategy,
    primaryProvider: statusRes.data?.primaryProvider,
    providers: {
      ollama: statusRes.data?.providers?.ollama?.isAvailable,
      openrouter: statusRes.data?.providers?.openrouter?.isAvailable,
      gemini: statusRes.data?.providers?.gemini?.isAvailable,
    }
  }, null, 2));

  // 3. PHASE 4: Real Local-Only AIVA Chat Test
  console.log('\n============================================================');
  console.log('3. PHASE 4: TESTING REAL LOCAL-ONLY REQUEST (Qwen3.5 on RTX 3050)');
  console.log('============================================================');
  console.log('Prompt: "What is the capital of India?" (strategy: "local-only")');

  const t0 = Date.now();
  const localChatRes = await request(
    {
      hostname: '127.0.0.1',
      port: 4000,
      path: '/ai/chat',
      method: 'POST',
      headers: authHeaders,
    },
    {
      message: 'What is the capital of India?',
      options: {
        strategy: 'local-only',
      },
    }
  );
  const localDuration = Date.now() - t0;

  console.log(`HTTP Status: ${localChatRes.status} (in ${localDuration}ms)`);
  console.log('Response Payload:', JSON.stringify(localChatRes.data, null, 2));

  // 4. PHASE 5: GPU PROOF
  console.log('\n============================================================');
  console.log('4. PHASE 5: GPU PROOF (ollama ps & nvidia-smi)');
  console.log('============================================================');
  try {
    const ollamaPs = execSync('ollama ps').toString();
    console.log('>>> ollama ps:\n' + ollamaPs);
  } catch (err) {
    console.warn('Could not run ollama ps:', err.message);
  }

  try {
    const nvidiaSmi = execSync('nvidia-smi --query-gpu=name,memory.total,memory.used,utilization.gpu --format=csv,noheader').toString();
    console.log('>>> nvidia-smi (GPU, VRAM total, VRAM used, GPU util):\n' + nvidiaSmi);
  } catch (err) {
    console.warn('Could not run nvidia-smi:', err.message);
  }

  // 5. PHASE 6: TEST ALL ROUTING MODES
  console.log('\n============================================================');
  console.log('5. PHASE 6: TESTING ALL ROUTING MODES');
  console.log('============================================================');

  const strategies = [
    { name: 'local-only', prompt: 'Tell me the color of the sky in 3 words.' },
    { name: 'local-first', prompt: 'What is 2 + 2?' },
    { name: 'cloud-first', prompt: 'Name one planet in our solar system.' },
    { name: 'openrouter-only', prompt: 'What is the largest ocean?' },
    { name: 'gemini-only', prompt: 'What is the boiling point of water?' },
  ];

  for (const s of strategies) {
    console.log(`\nTesting strategy: ${s.name}...`);
    const st0 = Date.now();
    const res = await request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/ai/chat',
        method: 'POST',
        headers: authHeaders,
      },
      {
        message: s.prompt,
        options: {
          strategy: s.name,
        },
      }
    );
    const dur = Date.now() - st0;
    console.log(`   HTTP ${res.status} in ${dur}ms`);
    console.log(`   Provider: ${res.data?.provider || 'unknown'} | Model: ${res.data?.model || 'unknown'}`);
    console.log(`   Response: ${res.data?.response ? res.data.response.substring(0, 100).replace(/\r?\n/g, ' ') : 'NO RESPONSE'}`);
  }

  // 6. PHASE 7: AIVA FUNCTIONAL TESTS
  console.log('\n============================================================');
  console.log('6. PHASE 7: AIVA FUNCTIONAL TESTS (Task, Project, Memory)');
  console.log('============================================================');

  // Test: Identity question
  console.log('\nA. Testing identity query ("Who are you?")...');
  const idRes = await request(
    {
      hostname: '127.0.0.1',
      port: 4000,
      path: '/ai/chat',
      method: 'POST',
      headers: authHeaders,
    },
    { message: 'Who are you?' }
  );
  console.log(`   Response: ${idRes.data?.response?.substring(0, 100)}`);

  // Test: Memory stats
  console.log('\nB. Testing memory stats (/ai/memory/stats)...');
  const memStatsRes = await request({
    hostname: '127.0.0.1',
    port: 4000,
    path: '/ai/memory/stats',
    method: 'GET',
    headers: authHeaders,
  });
  console.log('   Memory stats:', JSON.stringify(memStatsRes.data, null, 2));

  // Test: Task creation
  console.log('\nC. Testing task creation (/tasks)...');
  const taskCreateRes = await request(
    {
      hostname: '127.0.0.1',
      port: 4000,
      path: '/tasks',
      method: 'POST',
      headers: authHeaders,
    },
    {
      title: 'PC-A Local Verification Test Task',
      description: 'Temporary task for testing local AIVA persistence on PC-A',
      priority: 'HIGH',
      status: 'PENDING',
    }
  );
  console.log(`   Created task ID: ${taskCreateRes.data?.id}, title: "${taskCreateRes.data?.title}"`);
  const createdTaskId = taskCreateRes.data?.id;

  // Test: Task listing
  console.log('\nD. Testing task listing (/tasks)...');
  const taskListRes = await request({
    hostname: '127.0.0.1',
    port: 4000,
    path: '/tasks',
    method: 'GET',
    headers: authHeaders,
  });
  console.log(`   Tasks retrieved: ${Array.isArray(taskListRes.data) ? taskListRes.data.length : 0}`);

  // Test: Task cleanup
  if (createdTaskId) {
    console.log(`\nE. Cleaning up temporary task ${createdTaskId}...`);
    const taskDelRes = await request({
      hostname: '127.0.0.1',
      port: 4000,
      path: `/tasks/${createdTaskId}`,
      method: 'DELETE',
      headers: authHeaders,
    });
    console.log(`   Task deletion status: ${taskDelRes.status}`);
  }

  // Test: Project listing
  console.log('\nF. Testing project listing (/projects)...');
  const projListRes = await request({
    hostname: '127.0.0.1',
    port: 4000,
    path: '/projects',
    method: 'GET',
    headers: authHeaders,
  });
  console.log(`   Projects retrieved: ${Array.isArray(projListRes.data) ? projListRes.data.length : 0}`);

  console.log('\n============================================================');
  console.log('ALL TESTS COMPLETED');
  console.log('============================================================');
}

run().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
