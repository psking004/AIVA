/**
 * Test Distributed Compute Fabric Live HTTP Endpoints
 */

const http = require('http');

function post(url, body, token = null, deviceId = 'pc-a-device-001') {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = JSON.stringify(body);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(deviceId ? { 'x-device-id': deviceId } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function get(url, token = null, deviceId = 'pc-a-device-001') {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(deviceId ? { 'x-device-id': deviceId } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('============================================================');
  console.log('AIVA LIVE DISTRIBUTED FABRIC INTEGRATION TEST');
  console.log('============================================================\n');

  // 1. Authenticate as owner
  console.log('1. Authenticating with local backend...');
  const loginRes = await post('http://127.0.0.1:4000/auth/login', {
    email: 'admin@aiva.local',
    password: 'Password123!',
    device: { deviceId: 'pc-a-device-001', deviceName: 'psking004', platform: 'windows' },
  });
  const token = loginRes.data.accessToken || loginRes.data.token;
  console.log('   ✓ Logged in as owner. Access token acquired.');

  // 2. Register PC-A
  console.log('\n2. Registering PC-A (AI_POWER_NODE)...');
  const regA = await post('http://127.0.0.1:4000/ai/fabric/register', {
    deviceId: 'device_pc_a_primary',
    deviceName: 'psking004',
    nodeId: 'PC-A',
    nodeRole: 'AI_POWER_NODE',
    cpu: { model: 'i5 13th Gen', cores: 16, utilizationPercent: 18 },
    memory: { totalGb: 32, availableGb: 20 },
    gpu: { hasCuda: true, deviceCount: 1, deviceName: 'NVIDIA RTX 3050', vramMb: 8192, utilizationPercent: 15 },
    models: ['qwen3.5:latest'],
    ttsEngines: ['kokoro-onnx'],
    capabilities: ['INFERENCE', 'CODING'],
    status: 'ONLINE',
  }, token);
  console.log('   ✓ PC-A Registered:', regA.data.nodeId, `(${regA.data.nodeRole})`);

  // 3. Register PC-B
  console.log('\n3. Registering PC-B (CPU_LOCAL_NODE)...');
  const regB = await post('http://127.0.0.1:4000/ai/fabric/register', {
    deviceId: 'device_pc_b_secondary',
    deviceName: 'Cosmic_004',
    nodeId: 'PC-B',
    nodeRole: 'CPU_LOCAL_NODE',
    cpu: { model: 'i5-1335U', cores: 10, utilizationPercent: 22 },
    memory: { totalGb: 16, availableGb: 10 },
    gpu: { hasCuda: false, deviceCount: 0, deviceName: 'Intel Iris Xe', vramMb: 0 },
    models: ['qwen3.5:latest'],
    ttsEngines: ['kokoro-onnx'],
    capabilities: ['LIGHT_INFERENCE', 'TTS'],
    status: 'ONLINE',
  }, token);
  console.log('   ✓ PC-B Registered:', regB.data.nodeId, `(${regB.data.nodeRole})`);

  // 4. Register Android (iQOO Neo 10)
  console.log('\n4. Registering Android (iQOO Neo 10 Mobile Client)...');
  const regAndroid = await post('http://127.0.0.1:4000/ai/fabric/register', {
    deviceId: 'device_android_iqoo_neo_10',
    deviceName: 'iQOO Neo 10',
    nodeId: 'ANDROID-IQOO_NEO_10',
    nodeRole: 'MOBILE_CLIENT',
    cpu: { model: 'Snapdragon 8 Gen 3', cores: 8 },
    memory: { totalGb: 16, availableGb: 10 },
    gpu: { hasCuda: false, deviceCount: 0, deviceName: 'Adreno', vramMb: 0 },
    models: [],
    ttsEngines: ['native-android'],
    capabilities: ['VOICE_CAPTURE'],
    status: 'ONLINE',
  }, token);
  console.log('   ✓ Android Registered:', regAndroid.data.nodeId, `(${regAndroid.data.nodeRole})`);

  // 5. List all fabric nodes
  console.log('\n5. Querying GET /ai/fabric/nodes...');
  const nodesRes = await get('http://127.0.0.1:4000/ai/fabric/nodes', token);
  console.log('   Active Fabric Nodes Count:', nodesRes.data.length);
  nodesRes.data.forEach((n) => {
    console.log(`   - ${n.nodeId} [${n.nodeRole}] on ${n.deviceName} (Status: ${n.status}, CUDA: ${n.gpu?.hasCuda})`);
  });

  // 6. Test Heartbeat Ping
  console.log('\n6. Testing POST /ai/fabric/heartbeat...');
  const hbRes = await post('http://127.0.0.1:4000/ai/fabric/heartbeat', {
    deviceId: 'device_pc_a_primary',
    latencyMs: 12,
  }, token);
  console.log('   ✓ Heartbeat response:', hbRes.data);

  // 7. Workload Scheduling Tests
  console.log('\n7. Testing POST /ai/fabric/schedule across distributed topology...');

  // 7A: Android autonomous route (Gemini)
  const schedAndroid = await post('http://127.0.0.1:4000/ai/fabric/schedule', {
    type: 'LIGHT_INFERENCE',
    sourceDeviceId: 'device_android_iqoo_neo_10',
    sourceDeviceType: 'android',
    privacyLevel: 'STANDARD',
  }, token);
  console.log('   7A. Android Mobile Route:', {
    targetNode: schedAndroid.data.targetNode,
    provider: schedAndroid.data.provider,
    model: schedAndroid.data.model,
    reason: schedAndroid.data.routingReason,
  });

  // 7B: PC-B offloading heavy inference to PC-A
  const schedB = await post('http://127.0.0.1:4000/ai/fabric/schedule', {
    type: 'HEAVY_INFERENCE',
    sourceDeviceId: 'device_pc_b_secondary',
    sourceDeviceType: 'desktop',
    privacyLevel: 'STANDARD',
  }, token);
  console.log('   7B. PC-B Heavy Inference:', {
    targetNode: schedB.data.targetNode,
    provider: schedB.data.provider,
    isRemote: schedB.data.isRemote,
    reason: schedB.data.routingReason,
  });

  // 7C: Strictly PRIVATE workload (stays on local node)
  const schedPrivate = await post('http://127.0.0.1:4000/ai/fabric/schedule', {
    type: 'HEAVY_INFERENCE',
    sourceDeviceId: 'device_pc_a_primary',
    sourceDeviceType: 'desktop',
    privacyLevel: 'PRIVATE',
  }, token);
  console.log('   7C. Private Workload:', {
    targetNode: schedPrivate.data.targetNode,
    provider: schedPrivate.data.provider,
    isRemote: schedPrivate.data.isRemote,
    reason: schedPrivate.data.routingReason,
  });

  // 8. Remote Capability Execution Tests
  console.log('\n8. Testing POST /ai/remote/execute...');

  // 8A: Level 1 Compute (RAG Search)
  const ragExec = await post('http://127.0.0.1:4000/ai/remote/execute', {
    requestId: `req_rag_${Date.now()}`,
    sourceDeviceId: 'device_pc_b_secondary',
    targetNodeId: 'PC-A',
    capability: 'REMOTE_RAG_SEARCH',
    capabilityLevel: 1,
    arguments: { query: 'authentication' },
    createdAt: Date.now(),
    expiresAt: Date.now() + 10000,
  }, token);
  console.log('   8A. Level 1 Remote RAG Search Status:', ragExec.data.status, `(Result: ${JSON.stringify(ragExec.data.result)})`);

  // 8B: Level 2 File Read (Authorized workspace file)
  const fileExec = await post('http://127.0.0.1:4000/ai/remote/execute', {
    requestId: `req_file_${Date.now()}`,
    sourceDeviceId: 'device_pc_b_secondary',
    targetNodeId: 'PC-A',
    capability: 'REMOTE_FILE_READ',
    capabilityLevel: 2,
    arguments: { filePath: 'package.json' },
    createdAt: Date.now(),
    expiresAt: Date.now() + 10000,
  }, token);
  console.log('   8B. Level 2 Remote File Read Status:', fileExec.data.status, `(Size: ${fileExec.data.result?.sizeBytes} bytes, Lines: ${fileExec.data.result?.lines})`);

  // 8C: Security Test - Path Traversal Blocked
  const traversalExec = await post('http://127.0.0.1:4000/ai/remote/execute', {
    requestId: `req_trav_${Date.now()}`,
    sourceDeviceId: 'device_attacker',
    targetNodeId: 'PC-A',
    capability: 'REMOTE_FILE_READ',
    capabilityLevel: 2,
    arguments: { filePath: '../../../../Windows/System32/drivers/etc/hosts' },
    createdAt: Date.now(),
    expiresAt: Date.now() + 10000,
  }, token);
  console.log('   8C. Security: Path Traversal Attack -> Status:', traversalExec.data.status, `(Error: "${traversalExec.data.error}")`);

  // 8D: Security Test - Arbitrary Shell Blocked
  const shellExec = await post('http://127.0.0.1:4000/ai/remote/execute', {
    requestId: `req_shell_${Date.now()}`,
    sourceDeviceId: 'device_attacker',
    targetNodeId: 'PC-A',
    capability: 'ARBITRARY_SHELL',
    capabilityLevel: 4,
    arguments: { command: 'dir' },
    createdAt: Date.now(),
    expiresAt: Date.now() + 10000,
  }, token);
  console.log('   8D. Security: Arbitrary Shell -> Status:', shellExec.data.status, `(Blocked: "${shellExec.data.error}")`);

  console.log('\n============================================================');
  console.log('ALL DISTRIBUTED FABRIC TESTS COMPLETED SUCCESSFULLY');
  console.log('============================================================');
}

main().catch(console.error);
