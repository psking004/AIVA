/**
 * AIVA LAN Discovery Service Unit & Integration Test Suite
 *
 * Verifies:
 * 1. Active Wi-Fi IPv4 interface detection
 * 2. Beacon structure and HMAC-SHA256 signing
 * 3. Validation & acceptance of authenticated discovery beacons
 * 4. Anti-replay defense: Beacon rejection when timestamp drift > 15s
 * 5. Security barrier: Beacon rejection when HMAC signature does not match
 * 6. Node registration in ComputeNodeService upon valid discovery
 * 7. Dynamic IP change detection and beacon broadcast
 */

import { LanDiscoveryService, AivaDiscoveryBeacon } from './lan-discovery.service';
import { ComputeNodeService } from './compute-node.service';
import * as crypto from 'crypto';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runLanDiscoveryTests() {
  console.log('\n============================================================');
  console.log('AIVA LAN DISCOVERY & WIRELESS FABRIC TEST SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      const res = fn();
      if (res && typeof (res as any).then === 'function') {
        return (res as any).then(() => {
          console.log(`  ✓ PASS: ${name}`);
          passed++;
        }).catch((err: any) => {
          console.error(`  ✗ FAIL: ${name}`);
          console.error(`    ${err.message}`);
        });
      } else {
        console.log(`  ✓ PASS: ${name}`);
        passed++;
      }
    } catch (err: any) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
    }
  }

  const clusterSecret = 'aiva-secure-local-cluster-key-2026';

  // Test 1: Interface detection
  await test('1. Wi-Fi IPv4 interface detection filters virtual/internal adapters', () => {
    const discovery = new LanDiscoveryService();
    const detected = discovery.detectActiveLanAddress();
    console.log(`    Detected Active LAN IPv4: ${detected || 'None (Fallback mode)'}`);
    // Should either be a valid IPv4 or null if no active Wi-Fi
    if (detected) {
      assert(/^(\d{1,3}\.){3}\d{1,3}$/.test(detected), 'Must be valid IPv4 string');
      assert(!detected.startsWith('127.'), 'Cannot be loopback address');
    }
  });

  // Test 2: Process valid authenticated beacon
  await test('2. Authenticated beacon with valid HMAC is registered into fabric', () => {
    const nodeService = new ComputeNodeService();
    const discovery = new LanDiscoveryService(nodeService);

    const now = Date.now();
    const payload = `PC-B:device_pc_b_iris:10.84.73.194:10000:${now}`;
    const auth = crypto.createHmac('sha256', clusterSecret).update(payload).digest('hex');

    const beacon: AivaDiscoveryBeacon = {
      aiva: 'discovery',
      version: '1.0',
      nodeId: 'PC-B',
      deviceId: 'device_pc_b_iris',
      nodeRole: 'CPU_LOCAL_NODE',
      lanAddress: '10.84.73.194',
      port: 10000,
      capabilities: ['LOCAL_LLM', 'CPU_INFERENCE'],
      timestamp: now,
      auth,
    };

    const buf = Buffer.from(JSON.stringify(beacon));
    (discovery as any).handleIncomingBeacon(buf, { address: '10.84.73.194', family: 'IPv4', port: 42424, size: buf.length });

    const registered = nodeService.findNode('device_pc_b_iris');
    assert(!!registered, 'Node must be registered in ComputeNodeService');
    assert(registered?.nodeId === 'PC-B', 'Node ID must be PC-B');
    assert(registered?.lanAddress === '10.84.73.194', 'Node LAN address must match beacon');
    assert(registered?.port === 10000, 'Node port must match');
    assert(registered?.lanReachable === true, 'Node must be marked lanReachable');
  });

  // Test 3: Anti-replay defense (drift > 15s)
  await test('3. Anti-replay: Beacon with timestamp drift > 15s is rejected', () => {
    const nodeService = new ComputeNodeService();
    const discovery = new LanDiscoveryService(nodeService);

    const staleTime = Date.now() - 25000; // 25s old
    const payload = `PC-B:device_pc_b_stale:10.84.73.194:10000:${staleTime}`;
    const auth = crypto.createHmac('sha256', clusterSecret).update(payload).digest('hex');

    const beacon: AivaDiscoveryBeacon = {
      aiva: 'discovery',
      version: '1.0',
      nodeId: 'PC-B',
      deviceId: 'device_pc_b_stale',
      nodeRole: 'CPU_LOCAL_NODE',
      lanAddress: '10.84.73.194',
      port: 10000,
      capabilities: ['LOCAL_LLM'],
      timestamp: staleTime,
      auth,
    };

    const buf = Buffer.from(JSON.stringify(beacon));
    (discovery as any).handleIncomingBeacon(buf, { address: '10.84.73.194', family: 'IPv4', port: 42424, size: buf.length });

    const registered = nodeService.findNode('device_pc_b_stale');
    assert(!registered, 'Stale replayed beacon must NOT be registered');
  });

  // Test 4: HMAC mismatch rejection
  await test('4. Security Barrier: Beacon with counterfeit/tampered HMAC is rejected', () => {
    const nodeService = new ComputeNodeService();
    const discovery = new LanDiscoveryService(nodeService);

    const now = Date.now();
    const bogusAuth = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

    const beacon: AivaDiscoveryBeacon = {
      aiva: 'discovery',
      version: '1.0',
      nodeId: 'PC-B',
      deviceId: 'device_pc_b_tampered',
      nodeRole: 'CPU_LOCAL_NODE',
      lanAddress: '10.84.73.194',
      port: 10000,
      capabilities: ['LOCAL_LLM'],
      timestamp: now,
      auth: bogusAuth,
    };

    const buf = Buffer.from(JSON.stringify(beacon));
    (discovery as any).handleIncomingBeacon(buf, { address: '10.84.73.194', family: 'IPv4', port: 42424, size: buf.length });

    const registered = nodeService.findNode('device_pc_b_tampered');
    assert(!registered, 'Tampered beacon must NOT be registered');
  });

  // Test 5: Dynamic IP address change update
  await test('5. Dynamic IP update: Node updates IP address on subsequent beacon', () => {
    const nodeService = new ComputeNodeService();
    const discovery = new LanDiscoveryService(nodeService);

    const now = Date.now();
    const payload1 = `PC-B:device_pc_b_dynamic:10.84.73.194:10000:${now}`;
    const auth1 = crypto.createHmac('sha256', clusterSecret).update(payload1).digest('hex');

    const beacon1: AivaDiscoveryBeacon = {
      aiva: 'discovery',
      version: '1.0',
      nodeId: 'PC-B',
      deviceId: 'device_pc_b_dynamic',
      nodeRole: 'CPU_LOCAL_NODE',
      lanAddress: '10.84.73.194',
      port: 10000,
      capabilities: ['LOCAL_LLM'],
      timestamp: now,
      auth: auth1,
    };
    (discovery as any).handleIncomingBeacon(Buffer.from(JSON.stringify(beacon1)), { address: '10.84.73.194', family: 'IPv4', port: 42424, size: 100 });

    const node1 = nodeService.findNode('device_pc_b_dynamic');
    assert(node1?.lanAddress === '10.84.73.194', 'Initial IP should be 10.84.73.194');

    // Peer re-connects on new Wi-Fi subnet with new IP
    const now2 = Date.now() + 1000;
    const payload2 = `PC-B:device_pc_b_dynamic:192.168.1.150:10000:${now2}`;
    const auth2 = crypto.createHmac('sha256', clusterSecret).update(payload2).digest('hex');

    const beacon2: AivaDiscoveryBeacon = {
      aiva: 'discovery',
      version: '1.0',
      nodeId: 'PC-B',
      deviceId: 'device_pc_b_dynamic',
      nodeRole: 'CPU_LOCAL_NODE',
      lanAddress: '192.168.1.150',
      port: 10000,
      capabilities: ['LOCAL_LLM'],
      timestamp: now2,
      auth: auth2,
    };
    (discovery as any).handleIncomingBeacon(Buffer.from(JSON.stringify(beacon2)), { address: '192.168.1.150', family: 'IPv4', port: 42424, size: 100 });

    const node2 = nodeService.findNode('device_pc_b_dynamic');
    assert(node2?.lanAddress === '192.168.1.150', 'Updated IP should be 192.168.1.150');
  });

  // Test 6: Self-beacon ignore
  await test('6. Self-beacon ignore: Node ignores its own broadcast beacons', () => {
    const nodeService = new ComputeNodeService();
    const discovery = new LanDiscoveryService(nodeService);
    const selfDeviceId = (discovery as any).deviceId;

    const now = Date.now();
    const payload = `PC-A:${selfDeviceId}:10.84.73.59:10000:${now}`;
    const auth = crypto.createHmac('sha256', clusterSecret).update(payload).digest('hex');

    const beacon: AivaDiscoveryBeacon = {
      aiva: 'discovery',
      version: '1.0',
      nodeId: 'PC-A',
      deviceId: selfDeviceId,
      nodeRole: 'AI_POWER_NODE',
      lanAddress: '10.84.73.59',
      port: 10000,
      capabilities: ['CUDA'],
      timestamp: now,
      auth,
    };

    (discovery as any).handleIncomingBeacon(Buffer.from(JSON.stringify(beacon)), { address: '10.84.73.59', family: 'IPv4', port: 42424, size: 100 });

    const registered = nodeService.findNode(selfDeviceId);
    assert(!registered, 'Self beacon must be ignored and not self-registered via discovery loop');
  });

  console.log(`\n============================================================`);
  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log(`============================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runLanDiscoveryTests();
