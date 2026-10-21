/**
 * AIVA Distributed Independence & Peer Collaboration Test Suite
 *
 * Verifies the Core Rule:
 * NO DEVICE MAY REQUIRE ANOTHER PHYSICAL DEVICE TO BE ONLINE.
 *
 * Covers:
 * 1. PC-A Standalone (PC-B & Android offline)
 * 2. PC-B Standalone (PC-A & Android offline)
 * 3. Android Standalone / Autonomous (PC-A & PC-B offline)
 * 4. Two-Device Topology: A + B
 * 5. Two-Device Topology: A + Android
 * 6. Two-Device Topology: B + Android
 * 7. Three-Device Topology: A + B + Android
 * 8. Peer Disappearance / Liveness Timeout (>60s -> OFFLINE)
 * 9. Peer Node Circuit Breaker (Trips after 3 consecutive failures)
 * 10. Remote Agent Replay Defense & TTL Expiration
 * 11. Remote Agent Security: Path Traversal & Arbitrary Shell Barrier
 */

import { ComputeNodeService } from './compute-node.service';
import { ComputeSchedulerService } from './compute-scheduler.service';
import { RemoteAgentService, RemoteExecutionRequest } from './remote-agent.service';
import { FabricDispatchService } from './fabric-dispatch.service';
import { FabricNodeUnavailableError } from '../aiva.service';
import { AivaPolicyEngine } from '../policy/aiva-policy-engine';
import { ConfigService } from '@nestjs/config';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runDistributedIndependenceTests() {
  console.log('\n============================================================');
  console.log('AIVA DISTRIBUTED INDEPENDENCE & PEER FABRIC TEST SUITE');
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

  const mockConfigService = {
    get: (key: string, defaultValue?: any) => {
      if (key === 'MAX_GPU_LOAD') return 90;
      return defaultValue;
    },
  } as unknown as ConfigService;

  const policyEngine = new AivaPolicyEngine();

  // Test 1: PC-A Standalone Operation (PC-B & Android offline)
  await test('1. PC-A Standalone: Executes heavy/private workloads locally without peer dependency', () => {
    const nodeService = new ComputeNodeService();
    const scheduler = new ComputeSchedulerService(nodeService, policyEngine, mockConfigService);

    // Register PC-A only
    nodeService.registerNode({
      deviceId: 'device_pc_a_test',
      deviceName: 'psking004',
      nodeId: 'PC-A',
      nodeRole: 'AI_POWER_NODE',
      cpu: { model: 'i5 13th Gen', cores: 16, utilizationPercent: 20 },
      memory: { totalGb: 32, availableGb: 20 },
      gpu: { hasCuda: true, deviceCount: 1, deviceName: 'NVIDIA RTX 3050', vramMb: 8192, utilizationPercent: 15 },
      models: ['qwen3.5:latest'],
      ttsEngines: ['kokoro-onnx'],
      capabilities: ['INFERENCE', 'CODING', 'VOICE'],
      status: 'ONLINE',
    });

    const decision = scheduler.schedule({
      type: 'HEAVY_INFERENCE',
      sourceDeviceId: 'device_pc_a_test',
      sourceDeviceType: 'desktop',
      privacyLevel: 'PRIVATE',
    });

    assert(decision.targetNode === 'PC-A', `Expected targetNode PC-A, got ${decision.targetNode}`);
    assert(decision.provider === 'ollama', `Expected provider ollama, got ${decision.provider}`);
    assert(decision.isRemote === false, `Expected isRemote false, got ${decision.isRemote}`);
  });

  // Test 2: PC-B Standalone Operation (PC-A & Android offline)
  await test('2. PC-B Standalone: Operates independently on CPU, shedding heavy tasks to Cloud without hanging', () => {
    const nodeService = new ComputeNodeService();
    const scheduler = new ComputeSchedulerService(nodeService, policyEngine, mockConfigService);

    // Register PC-B only (no NVIDIA)
    nodeService.registerNode({
      deviceId: 'device_pc_b_test',
      deviceName: 'Cosmic_004',
      nodeId: 'PC-B',
      nodeRole: 'CPU_LOCAL_NODE',
      cpu: { model: 'i5-1335U', cores: 10, utilizationPercent: 25 },
      memory: { totalGb: 16, availableGb: 10 },
      gpu: { hasCuda: false, deviceCount: 0, deviceName: 'Intel Iris Xe', vramMb: 0, utilizationPercent: 0 },
      models: ['qwen3.5:latest'],
      ttsEngines: ['kokoro-onnx'],
      capabilities: ['LIGHT_INFERENCE', 'TTS'],
      status: 'ONLINE',
    });

    // Light inference scheduled on local CPU
    const lightDecision = scheduler.schedule({
      type: 'LIGHT_INFERENCE',
      sourceDeviceId: 'device_pc_b_test',
      sourceDeviceType: 'desktop',
      privacyLevel: 'STANDARD',
    });
    assert(lightDecision.targetNode === 'PC-B', `Expected targetNode PC-B, got ${lightDecision.targetNode}`);

    // Heavy inference falls back to Cloud without hanging for missing PC-A
    const heavyDecision = scheduler.schedule({
      type: 'HEAVY_INFERENCE',
      sourceDeviceId: 'device_pc_b_test',
      sourceDeviceType: 'desktop',
      privacyLevel: 'STANDARD',
    });
    assert(heavyDecision.targetNode === 'CLOUD', `Expected targetNode CLOUD, got ${heavyDecision.targetNode}`);
    assert(heavyDecision.provider === 'gemini', `Expected provider gemini, got ${heavyDecision.provider}`);
  });

  // Test 3: Android Standalone / Autonomous (PC-A & PC-B completely powered off)
  await test('3. Android Autonomous: Operates with ZERO PC dependency via Cloud route', () => {
    const nodeService = new ComputeNodeService();
    const scheduler = new ComputeSchedulerService(nodeService, policyEngine, mockConfigService);

    // No PCs registered / activeNodes = 0
    const decision = scheduler.schedule({
      type: 'HEAVY_INFERENCE',
      sourceDeviceId: 'device_android_iqoo_neo_10',
      sourceDeviceType: 'android',
      privacyLevel: 'STANDARD',
    });

    assert(decision.targetNode === 'CLOUD', `Expected targetNode CLOUD, got ${decision.targetNode}`);
    assert(decision.provider === 'gemini', `Expected provider gemini, got ${decision.provider}`);
    assert(decision.model === 'gemini-3.5-flash', `Expected model gemini-3.5-flash, got ${decision.model}`);
    assert(decision.routingReason.includes('Zero PC dependency'), 'Expected routingReason to confirm zero PC dependency');
  });

  // Test 4: Two-Device Topology: A + B Collaboration
  await test('4. Topology A + B: PC-B offloads heavy task to PC-A when PC-A is available', () => {
    const nodeService = new ComputeNodeService();
    const scheduler = new ComputeSchedulerService(nodeService, policyEngine, mockConfigService);

    nodeService.registerNode({
      deviceId: 'device_pc_a_test',
      deviceName: 'psking004',
      nodeId: 'PC-A',
      nodeRole: 'AI_POWER_NODE',
      cpu: { model: 'i5 13th Gen', cores: 16 },
      memory: { totalGb: 32, availableGb: 20 },
      gpu: { hasCuda: true, deviceCount: 1, deviceName: 'NVIDIA RTX 3050', vramMb: 8192, utilizationPercent: 10 },
      models: ['qwen3.5:latest'],
      ttsEngines: ['kokoro-onnx'],
      capabilities: ['INFERENCE'],
      status: 'ONLINE',
    });

    nodeService.registerNode({
      deviceId: 'device_pc_b_test',
      deviceName: 'Cosmic_004',
      nodeId: 'PC-B',
      nodeRole: 'CPU_LOCAL_NODE',
      cpu: { model: 'i5-1335U', cores: 10 },
      memory: { totalGb: 16, availableGb: 10 },
      gpu: { hasCuda: false, deviceCount: 0, deviceName: 'None', vramMb: 0 },
      models: ['qwen3.5:latest'],
      ttsEngines: ['kokoro-onnx'],
      capabilities: ['LIGHT_INFERENCE'],
      status: 'ONLINE',
    });

    const decision = scheduler.schedule({
      type: 'HEAVY_INFERENCE',
      sourceDeviceId: 'device_pc_b_test',
      sourceDeviceType: 'desktop',
      privacyLevel: 'STANDARD',
    });

    assert(decision.targetNode === 'PC-A', `Expected targetNode PC-A, got ${decision.targetNode}`);
    assert(decision.isRemote === true, 'Expected isRemote true because source was PC-B');
  });

  // Test 5: Two-Device Topology: A + Android (Idle Resource Harvesting & Load Shedding)
  await test('5. Topology A + Android: Harvests idle PC-A GPU; sheds to Cloud when PC-A exceeds 90% load', () => {
    const nodeService = new ComputeNodeService();
    const scheduler = new ComputeSchedulerService(nodeService, policyEngine, mockConfigService);

    nodeService.registerNode({
      deviceId: 'device_pc_a_test',
      deviceName: 'psking004',
      nodeId: 'PC-A',
      nodeRole: 'AI_POWER_NODE',
      cpu: { model: 'i5 13th Gen', cores: 16 },
      memory: { totalGb: 32, availableGb: 20 },
      gpu: { hasCuda: true, deviceCount: 1, deviceName: 'NVIDIA RTX 3050', vramMb: 8192, utilizationPercent: 20 },
      models: ['qwen3.5:latest'],
      ttsEngines: ['kokoro-onnx'],
      capabilities: ['INFERENCE'],
      status: 'ONLINE',
    });

    // 5A: Underutilized -> Harvester routes to PC-A
    const decision1 = scheduler.schedule({
      type: 'HEAVY_INFERENCE',
      sourceDeviceId: 'device_android_iqoo_neo_10',
      sourceDeviceType: 'android',
      privacyLevel: 'STANDARD',
    });
    assert(decision1.targetNode === 'PC-A', `Expected targetNode PC-A, got ${decision1.targetNode}`);

    // 5B: Overloaded (95% GPU) -> Sheds to Cloud
    nodeService.updateTelemetry('PC-A', { gpuUtilizationPercent: 95 });
    const decision2 = scheduler.schedule({
      type: 'HEAVY_INFERENCE',
      sourceDeviceId: 'device_android_iqoo_neo_10',
      sourceDeviceType: 'android',
      privacyLevel: 'STANDARD',
    });
    assert(decision2.targetNode === 'CLOUD', `Expected targetNode CLOUD due to load shedding, got ${decision2.targetNode}`);
  });

  // Test 6: Two-Device Topology: B + Android (PC-A completely off)
  await test('6. Topology B + Android: Operates smoothly when PC-A is off', () => {
    const nodeService = new ComputeNodeService();
    const scheduler = new ComputeSchedulerService(nodeService, policyEngine, mockConfigService);

    nodeService.registerNode({
      deviceId: 'device_pc_b_test',
      deviceName: 'Cosmic_004',
      nodeId: 'PC-B',
      nodeRole: 'CPU_LOCAL_NODE',
      cpu: { model: 'i5-1335U', cores: 10 },
      memory: { totalGb: 16, availableGb: 10 },
      gpu: { hasCuda: false, deviceCount: 0, deviceName: 'None', vramMb: 0 },
      models: ['qwen3.5:latest'],
      ttsEngines: ['kokoro-onnx'],
      capabilities: ['LIGHT_INFERENCE'],
      status: 'ONLINE',
    });

    // Android uses cloud
    const androidDecision = scheduler.schedule({
      type: 'HEAVY_INFERENCE',
      sourceDeviceId: 'device_android_iqoo_neo_10',
      sourceDeviceType: 'android',
      privacyLevel: 'STANDARD',
    });
    assert(androidDecision.targetNode === 'CLOUD', `Expected Android to route to CLOUD, got ${androidDecision.targetNode}`);

    // PC-B uses local CPU for light tasks
    const bDecision = scheduler.schedule({
      type: 'LIGHT_INFERENCE',
      sourceDeviceId: 'device_pc_b_test',
      sourceDeviceType: 'desktop',
      privacyLevel: 'STANDARD',
    });
    assert(bDecision.targetNode === 'PC-B', `Expected PC-B light task on PC-B, got ${bDecision.targetNode}`);
  });

  // Test 7: Three-Device Full Topology: A + B + Android
  await test('7. Full Fabric: Dynamic optimal allocation across PC-A, PC-B, and Android', () => {
    const nodeService = new ComputeNodeService();
    const scheduler = new ComputeSchedulerService(nodeService, policyEngine, mockConfigService);

    nodeService.registerNode({
      deviceId: 'device_pc_a_test',
      deviceName: 'psking004',
      nodeId: 'PC-A',
      nodeRole: 'AI_POWER_NODE',
      cpu: { model: 'i5 13th Gen', cores: 16 },
      memory: { totalGb: 32, availableGb: 20 },
      gpu: { hasCuda: true, deviceCount: 1, deviceName: 'NVIDIA RTX 3050', vramMb: 8192, utilizationPercent: 10 },
      models: ['qwen3.5:latest'],
      ttsEngines: ['kokoro-onnx'],
      capabilities: ['INFERENCE', 'CODING'],
      status: 'ONLINE',
    });

    nodeService.registerNode({
      deviceId: 'device_pc_b_test',
      deviceName: 'Cosmic_004',
      nodeId: 'PC-B',
      nodeRole: 'CPU_LOCAL_NODE',
      cpu: { model: 'i5-1335U', cores: 10 },
      memory: { totalGb: 16, availableGb: 10 },
      gpu: { hasCuda: false, deviceCount: 0, deviceName: 'None', vramMb: 0 },
      models: ['qwen3.5:latest'],
      ttsEngines: ['kokoro-onnx'],
      capabilities: ['LIGHT_INFERENCE'],
      status: 'ONLINE',
    });

    nodeService.registerNode({
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
    });

    assert(nodeService.listNodes().length === 3, 'Expected 3 registered nodes in fabric');
    const decision = scheduler.schedule({
      type: 'HEAVY_INFERENCE',
      sourceDeviceId: 'device_android_iqoo_neo_10',
      sourceDeviceType: 'android',
      privacyLevel: 'STANDARD',
    });
    assert(decision.targetNode === 'PC-A', 'Expected Android heavy task routed to PC-A AI Power Node');
  });

  // Test 8: Liveness Timeout & Disappearance (>60s heartbeats demoted to OFFLINE)
  await test('8. Liveness Timeout: Node with heartbeat > 60s is automatically marked OFFLINE', () => {
    const nodeService = new ComputeNodeService();

    const node = nodeService.registerNode({
      deviceId: 'device_stale_node',
      deviceName: 'StalePC',
      nodeId: 'PC-B',
      nodeRole: 'CPU_LOCAL_NODE',
      cpu: { model: 'i5', cores: 4 },
      memory: { totalGb: 8, availableGb: 4 },
      gpu: { hasCuda: false, deviceCount: 0, deviceName: 'None', vramMb: 0 },
      models: [],
      ttsEngines: [],
      capabilities: [],
      status: 'ONLINE',
    });

    // Artificially age heartbeat by 65 seconds
    node.lastHeartbeat = Date.now() - 65000;

    const available = nodeService.isNodeAvailable('device_stale_node');
    assert(available === false, 'Stale node must not be reported as available');
    assert(nodeService.getNode('device_stale_node')?.status === 'OFFLINE', 'Status should be OFFLINE');
  });

  // Test 9: Peer Node Circuit Breaker (Trips after 3 consecutive failures)
  await test('9. Peer Circuit Breaker: Repeated failures trip circuit breaker and trigger fallback', () => {
    const nodeService = new ComputeNodeService();
    const scheduler = new ComputeSchedulerService(nodeService, policyEngine, mockConfigService);

    nodeService.registerNode({
      deviceId: 'device_flaky_node',
      deviceName: 'FlakyPC',
      nodeId: 'PC-A',
      nodeRole: 'AI_POWER_NODE',
      cpu: { model: 'i5', cores: 4 },
      memory: { totalGb: 8, availableGb: 4 },
      gpu: { hasCuda: true, deviceCount: 1, deviceName: 'RTX 3050', vramMb: 8192 },
      models: ['qwen3.5:latest'],
      ttsEngines: [],
      capabilities: ['INFERENCE'],
      status: 'ONLINE',
    });

    // Record 3 failures
    nodeService.recordNodeFailure('device_flaky_node');
    nodeService.recordNodeFailure('device_flaky_node');
    nodeService.recordNodeFailure('device_flaky_node');

    assert(nodeService.isNodeAvailable('device_flaky_node') === false, 'Flaky node must be in circuit breaker cooldown');

    // Scheduler must now shed to Cloud instead of routing to flaky peer
    const decision = scheduler.schedule({
      type: 'HEAVY_INFERENCE',
      sourceDeviceId: 'device_android_iqoo_neo_10',
      sourceDeviceType: 'android',
      privacyLevel: 'STANDARD',
    });

    assert(decision.targetNode === 'CLOUD', `Expected fallback to CLOUD, got ${decision.targetNode}`);
  });

  // Test 10: Remote Agent Replay Defense & TTL Expiry
  await test('10. Remote Agent: Rejects expired requests and prevents replayed execution IDs', async () => {
    const nodeService = new ComputeNodeService();
    const remoteAgent = new RemoteAgentService(policyEngine, nodeService);

    const expiredRequest: RemoteExecutionRequest = {
      requestId: 'req_expired_1',
      sourceDeviceId: 'device_pc_b',
      targetNodeId: 'PC-A',
      capability: 'REMOTE_RAG_SEARCH',
      capabilityLevel: 1,
      arguments: {},
      createdAt: Date.now() - 10000,
      expiresAt: Date.now() - 1000, // Expired
    };

    const expiredRes = await remoteAgent.executeRemoteCapability(expiredRequest);
    assert(expiredRes.status === 'FAILED', 'Expired request must be FAILED');
    assert(expiredRes.error?.includes('expired') === true, 'Error must indicate expiration');

    const validRequest: RemoteExecutionRequest = {
      requestId: 'req_valid_1',
      sourceDeviceId: 'device_pc_b',
      targetNodeId: 'PC-A',
      capability: 'REMOTE_RAG_SEARCH',
      capabilityLevel: 1,
      arguments: {},
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };

    const firstRes = await remoteAgent.executeRemoteCapability(validRequest);
    assert(firstRes.status === 'SUCCEEDED', `Valid request must SUCCEED, got: ${firstRes.status}`);

    // Replay same request ID
    const replayRes = await remoteAgent.executeRemoteCapability(validRequest);
    assert(replayRes.status === 'FAILED', 'Replayed request must be rejected');
    assert(replayRes.error?.includes('Replay defense') === true, 'Error must indicate replay defense');
  });

  // Test 11: Remote Agent Security: Path Traversal & Shell Barriers
  await test('11. Security Barriers: Traversal outside workspace root and arbitrary commands strictly blocked', async () => {
    const nodeService = new ComputeNodeService();
    const remoteAgent = new RemoteAgentService(policyEngine, nodeService);

    // Attempt path traversal
    const traversalRequest: RemoteExecutionRequest = {
      requestId: 'req_traversal_attack',
      sourceDeviceId: 'device_attacker',
      targetNodeId: 'PC-A',
      capability: 'REMOTE_FILE_READ',
      capabilityLevel: 2,
      arguments: { filePath: '../../../../Windows/System32/drivers/etc/hosts' },
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };

    const traversalRes = await remoteAgent.executeRemoteCapability(traversalRequest);
    assert(traversalRes.status === 'FAILED', 'Path traversal must FAIL');
    assert(traversalRes.error?.includes('outside authorized workspace root') === true, 'Traversal must be blocked');

    // Attempt arbitrary shell execution
    const shellRequest: RemoteExecutionRequest = {
      requestId: 'req_shell_attack',
      sourceDeviceId: 'device_attacker',
      targetNodeId: 'PC-A',
      capability: 'ARBITRARY_SHELL',
      capabilityLevel: 4,
      arguments: { command: 'rm -rf /' },
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };

    const shellRes = await remoteAgent.executeRemoteCapability(shellRequest);
    assert(shellRes.status === 'BLOCKED', 'Arbitrary shell must be BLOCKED');
  });

  // Test 12: Fabric LOCAL_LLM Scheduler Routing (PC-A -> PC-B -> Cloud fallback)
  await test('12. Fabric LOCAL_LLM Routing: PC-A online -> PC-A, PC-A offline -> PC-B, Both offline -> Cloud', () => {
    const nodeService = new ComputeNodeService();
    const scheduler = new ComputeSchedulerService(nodeService, policyEngine, mockConfigService);

    // Both online: PC-A preferred
    nodeService.registerNode({
      deviceId: 'device_pc_a_test',
      deviceName: 'psking004',
      nodeId: 'PC-A',
      nodeRole: 'AI_POWER_NODE',
      cpu: { model: 'i5 13th Gen', cores: 16 },
      memory: { totalGb: 32, availableGb: 20 },
      gpu: { hasCuda: true, deviceCount: 1, deviceName: 'RTX 3050', vramMb: 8192, utilizationPercent: 10 },
      models: ['qwen3.5:latest'],
      ttsEngines: [],
      capabilities: ['LOCAL_LLM', 'INFERENCE'],
      status: 'ONLINE',
    });

    nodeService.registerNode({
      deviceId: 'device_pc_b_test',
      deviceName: 'Cosmic_004',
      nodeId: 'PC-B',
      nodeRole: 'CPU_LOCAL_NODE',
      cpu: { model: 'i5-1335U', cores: 10 },
      memory: { totalGb: 16, availableGb: 10 },
      gpu: { hasCuda: false, deviceCount: 0, deviceName: 'None', vramMb: 0 },
      models: ['qwen3:4b'],
      ttsEngines: [],
      capabilities: ['LOCAL_LLM'],
      status: 'ONLINE',
    });

    const d1 = scheduler.schedule({
      type: 'AI_INFERENCE',
      sourceDeviceId: 'device_android_client',
      sourceDeviceType: 'android',
      privacyLevel: 'STANDARD',
      requiredCapability: 'LOCAL_LLM',
    });
    assert(d1.targetNode === 'PC-A', `Expected PC-A when online, got ${d1.targetNode}`);
    assert(d1.targetDeviceId === 'device_pc_a_test', 'Expected targetDeviceId to be PC-A device ID');
    assert(d1.provider === 'ollama', `Expected provider ollama, got ${d1.provider}`);

    // PC-A offline: PC-B selected
    nodeService.setNodeStatus('PC-A', 'OFFLINE');
    const d2 = scheduler.schedule({
      type: 'AI_INFERENCE',
      sourceDeviceId: 'device_android_client',
      sourceDeviceType: 'android',
      privacyLevel: 'STANDARD',
      requiredCapability: 'LOCAL_LLM',
    });
    assert(d2.targetNode === 'PC-B', `Expected PC-B when PC-A offline, got ${d2.targetNode}`);
    assert(d2.targetDeviceId === 'device_pc_b_test', 'Expected targetDeviceId to be PC-B device ID');
    assert(d2.provider === 'ollama', `Expected provider ollama, got ${d2.provider}`);

    // Both offline: Cloud fallback
    nodeService.setNodeStatus('PC-B', 'OFFLINE');
    const d3 = scheduler.schedule({
      type: 'AI_INFERENCE',
      sourceDeviceId: 'device_android_client',
      sourceDeviceType: 'android',
      privacyLevel: 'STANDARD',
      requiredCapability: 'LOCAL_LLM',
    });
    assert(d3.targetNode === 'CLOUD', `Expected CLOUD fallback when both offline, got ${d3.targetNode}`);
  });

  // Test 13: FabricDispatchService Lifecycle: createWork -> pollWork -> completeWork -> waitForCompletion
  await test('13. Fabric Dispatch Lifecycle: queue -> claim -> complete -> resolve waitForCompletion', async () => {
    const dispatch = new FabricDispatchService();
    const requestId = 'req_fabric_test_1';

    const work = dispatch.createWork({
      requestId,
      sourceDeviceId: 'device_client_phone',
      targetNodeId: 'PC-A',
      targetDeviceId: 'device_pc_a_target',
      type: 'AI_INFERENCE',
      capability: 'LOCAL_LLM',
      capabilityLevel: 1,
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
        model: 'qwen3.5:latest',
      },
    });

    assert(work.status === 'QUEUED', `Expected QUEUED status, got ${work.status}`);

    // Mismatched device poll should return null
    const wrongPoll = dispatch.pollWork('PC-A', 'device_wrong');
    assert(wrongPoll === null, 'Wrong device must not claim work');

    // Matching device poll claims work
    const claimed = dispatch.pollWork('PC-A', 'device_pc_a_target');
    assert(claimed !== null, 'Matching device must claim work');
    assert(claimed?.status === 'CLAIMED', 'Status must be CLAIMED');

    // Complete work asynchronously while waitForCompletion is listening
    const waitPromise = dispatch.waitForCompletion(requestId, 5000);

    const completedItem = dispatch.completeWork(requestId, 'device_pc_a_target', {
      content: 'Hello from PC-A Ollama!',
      model: 'qwen3.5:latest',
      provider: 'ollama',
      latencyMs: 150,
    });
    assert(completedItem.status === 'COMPLETED', 'Status must be COMPLETED');

    const result = await waitPromise;
    assert(result.status === 'COMPLETED', `Wait result must be COMPLETED, got ${result.status}`);
    assert(result.result?.content === 'Hello from PC-A Ollama!', 'Result content must match');
  });

  // Test 14: FabricDispatchService Failure Handling: failWork resolves waitForCompletion with FAILED
  await test('14. Fabric Dispatch Failure Handling: failWork resolves waitForCompletion with FAILED status', async () => {
    const dispatch = new FabricDispatchService();
    const requestId = 'req_fabric_fail_test';

    dispatch.createWork({
      requestId,
      sourceDeviceId: 'device_client_phone',
      targetNodeId: 'PC-A',
      targetDeviceId: 'device_pc_a_target',
      type: 'AI_INFERENCE',
      capability: 'LOCAL_LLM',
      capabilityLevel: 1,
      payload: { messages: [{ role: 'user', content: 'test' }] },
    });

    dispatch.claimWork(requestId, 'device_pc_a_target');

    const waitPromise = dispatch.waitForCompletion(requestId, 5000);

    dispatch.failWork(requestId, 'device_pc_a_target', 'Ollama process crash simulation');

    const result = await waitPromise;
    assert(result.status === 'FAILED', `Status must be FAILED, got ${result.status}`);
    assert(result.error === 'Ollama process crash simulation', 'Error message must be preserved');
  });

  // Test 15: FabricNodeUnavailableError Contract for Local-First and Local-Only
  await test('15. Fabric Error Semantics: FabricNodeUnavailableError distinguishes offline nodes from execution failures', () => {
    const unavailableErr = new FabricNodeUnavailableError('No independent fabric node available for local inference: CLOUD');
    assert(unavailableErr instanceof FabricNodeUnavailableError, 'Must be instance of FabricNodeUnavailableError');
    assert(unavailableErr.name === 'FabricNodeUnavailableError', 'Error name must match');

    // A normal execution failure is NOT an instance of FabricNodeUnavailableError
    const executionErr = new Error('Fabric inference ended with status FAILED');
    assert(!(executionErr instanceof FabricNodeUnavailableError), 'Execution error must not match FabricNodeUnavailableError');
  });

  console.log('\n============================================================');
  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('============================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runDistributedIndependenceTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
