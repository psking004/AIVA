/**
 * AIVA Local Area Network (LAN) Discovery Service
 *
 * Implements Secure Wireless Device Discovery over Local Wi-Fi (Phase 4 / Network Architecture):
 * - Authenticated UDP Multicast / Broadcast on dedicated port (42424)
 * - HMAC-SHA256 signature verification preventing unauthenticated LAN access
 * - Anti-replay timestamp validation (<= 15 seconds window)
 * - Dynamic Wi-Fi interface detection and automatic IP change recovery
 * - Seamless integration with ComputeNodeService for fabric awareness
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import * as dgram from 'dgram';
import * as os from 'os';
import * as crypto from 'crypto';
import { ComputeNodeService, NodeRole, NodeId } from './compute-node.service';

export interface AivaDiscoveryBeacon {
  aiva: 'discovery';
  version: '1.0';
  nodeId: NodeId;
  deviceId: string;
  nodeRole: NodeRole;
  lanAddress: string;
  port: number;
  capabilities: string[];
  timestamp: number;
  auth: string;
}

@Injectable()
export class LanDiscoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LanDiscoveryService.name);
  private udpSocket: dgram.Socket | null = null;
  private broadcastTimer: NodeJS.Timeout | null = null;
  private ipCheckTimer: NodeJS.Timeout | null = null;

  private currentLanAddress: string | null = null;
  private readonly discoveryPort = 42424;
  private readonly clusterSecret = process.env.AIVA_CLUSTER_SECRET || 'aiva-secure-local-cluster-key-2026';
  private readonly nodeId: NodeId = (process.env.AIVA_NODE_ID as NodeId) || 'PC-A';
  private readonly nodeRole: NodeRole = (process.env.AIVA_NODE_ROLE as NodeRole) || 'AI_POWER_NODE';
  private readonly deviceId: string = process.env.AIVA_DEVICE_ID || 'device_pc_a_rtx3050';
  private readonly servicePort = Number(process.env.PORT || 10000);

  constructor(@Optional() private readonly computeNodeService?: ComputeNodeService) {}

  onModuleInit() {
    this.startDiscovery();
  }

  onModuleDestroy() {
    this.stopDiscovery();
  }

  /**
   * Start the authenticated LAN discovery service
   */
  public startDiscovery() {
    this.currentLanAddress = this.detectActiveLanAddress();
    this.logger.log(
      `Starting AIVA LAN Discovery Service for node "${this.nodeId}" [Active LAN IP: ${this.currentLanAddress || 'None'}] on UDP port ${this.discoveryPort}`,
    );

    try {
      this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.udpSocket.on('error', (err) => {
        this.logger.warn(`UDP Discovery Socket error: ${err.message}`);
      });

      this.udpSocket.on('message', (msg, rinfo) => {
        this.handleIncomingBeacon(msg, rinfo);
      });

      this.udpSocket.bind(this.discoveryPort, () => {
        try {
          this.udpSocket?.setBroadcast(true);
        } catch (_) {}
        this.logger.log(`AIVA Discovery listening for authenticated beacons on port ${this.discoveryPort}`);
      });

      // Broadcast presence beacon every 5 seconds
      this.broadcastTimer = setInterval(() => {
        this.broadcastPresence();
      }, 5000);

      // Check for local IP / Wi-Fi changes every 10 seconds
      this.ipCheckTimer = setInterval(() => {
        this.checkIpAddressChange();
      }, 10000);

      // Immediate first broadcast
      this.broadcastPresence();
    } catch (e: any) {
      this.logger.warn(`Could not initialize UDP discovery: ${e.message}`);
    }
  }

  /**
   * Stop the discovery service
   */
  public stopDiscovery() {
    if (this.broadcastTimer) clearInterval(this.broadcastTimer);
    if (this.ipCheckTimer) clearInterval(this.ipCheckTimer);
    if (this.udpSocket) {
      try {
        this.udpSocket.close();
      } catch (_) {}
      this.udpSocket = null;
    }
    this.logger.log('AIVA LAN Discovery Service stopped');
  }

  /**
   * Broadcast an authenticated discovery beacon to the local LAN
   */
  public broadcastPresence() {
    if (!this.udpSocket || !this.currentLanAddress) return;

    const timestamp = Date.now();
    const payloadToSign = `${this.nodeId}:${this.deviceId}:${this.currentLanAddress}:${this.servicePort}:${timestamp}`;
    const auth = crypto.createHmac('sha256', this.clusterSecret).update(payloadToSign).digest('hex');

    const beacon: AivaDiscoveryBeacon = {
      aiva: 'discovery',
      version: '1.0',
      nodeId: this.nodeId,
      deviceId: this.deviceId,
      nodeRole: this.nodeRole,
      lanAddress: this.currentLanAddress,
      port: this.servicePort,
      capabilities: ['CUDA', 'LOCAL_LLM', 'FAST_PATH', 'CODE_EXEC'],
      timestamp,
      auth,
    };

    const message = Buffer.from(JSON.stringify(beacon));

    // Broadcast to standard IPv4 broadcast address
    this.udpSocket.send(message, 0, message.length, this.discoveryPort, '255.255.255.255', (err) => {
      if (err) {
        // Silently handle transient Wi-Fi drops
      }
    });
  }

  /**
   * Validate and process an incoming discovery beacon from a peer node
   */
  private handleIncomingBeacon(msg: Buffer, rinfo: dgram.RemoteInfo) {
    try {
      const data: AivaDiscoveryBeacon = JSON.parse(msg.toString('utf8'));

      // 1. Structural check
      if (data.aiva !== 'discovery' || data.version !== '1.0' || !data.nodeId || !data.deviceId) {
        return;
      }

      // Ignore our own beacon
      if (data.deviceId === this.deviceId) {
        return;
      }

      // 2. Anti-replay check: Must be within 15 seconds
      const now = Date.now();
      if (Math.abs(now - data.timestamp) > 15000) {
        this.logger.warn(`Rejected expired discovery beacon from ${rinfo.address} (drift: ${now - data.timestamp}ms)`);
        return;
      }

      // 3. HMAC signature verification
      const payloadToVerify = `${data.nodeId}:${data.deviceId}:${data.lanAddress}:${data.port}:${data.timestamp}`;
      const expectedAuth = crypto.createHmac('sha256', this.clusterSecret).update(payloadToVerify).digest('hex');

      if (data.auth !== expectedAuth) {
        this.logger.warn(`Rejected unauthenticated discovery beacon from ${rinfo.address} (auth signature mismatch)`);
        return;
      }

      // 4. Authenticated Peer Discovered: Register or update in fabric
      if (this.computeNodeService) {
        const existing = this.computeNodeService.findNode(data.deviceId);
        if (!existing) {
          this.logger.log(
            `[LAN DISCOVERY] Discovered authenticated peer node: "${data.nodeId}" (${data.nodeRole}) at ${data.lanAddress}:${data.port}`,
          );
          this.computeNodeService.registerNode({
            deviceId: data.deviceId,
            deviceName: `${data.nodeId} (${data.lanAddress})`,
            nodeId: data.nodeId,
            nodeRole: data.nodeRole,
            cpu: { model: 'Discovered CPU', cores: 4 },
            memory: { totalGb: 16, availableGb: 8 },
            gpu: { hasCuda: data.capabilities.includes('CUDA'), deviceCount: 1, deviceName: 'Discovered GPU', vramMb: 4096 },
            models: [],
            ttsEngines: [],
            capabilities: data.capabilities,
            status: 'ONLINE',
            lanAddress: data.lanAddress,
            port: data.port,
            lanReachable: true,
            firewallStatus: 'ALLOW',
          });
        } else {
          // Update IP address and port dynamically
          existing.lanAddress = data.lanAddress;
          existing.port = data.port;
          existing.lastHeartbeat = now;
          existing.status = 'ONLINE';
          existing.lanReachable = true;
        }
      }
    } catch (_) {
      // Ignore malformed packets from other network entities
    }
  }

  /**
   * Monitor for IP address changes (DHCP renewal, Wi-Fi switching)
   */
  private checkIpAddressChange() {
    const newIp = this.detectActiveLanAddress();
    if (newIp && newIp !== this.currentLanAddress) {
      const oldIp = this.currentLanAddress;
      this.currentLanAddress = newIp;
      this.logger.log(`[NETWORK CHANGE] Wi-Fi IP address updated: ${oldIp} -> ${newIp}. Broadcasting presence...`);
      this.broadcastPresence();
      if (this.computeNodeService) {
        this.computeNodeService.recordHeartbeat(this.deviceId, undefined, newIp, this.servicePort);
      }
    }
  }

  /**
   * Detect the active Wi-Fi IPv4 address on the physical machine
   */
  public detectActiveLanAddress(): string | null {
    const interfaces = os.networkInterfaces();
    let candidate: string | null = null;

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      // Filter out virtual/Hyper-V/WSL/loopback interfaces
      const lower = name.toLowerCase();
      if (lower.includes('vethernet') || lower.includes('wsl') || lower.includes('loopback') || lower.includes('docker')) {
        continue;
      }

      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal && addr.address !== '127.0.0.1') {
          // Prefer Wi-Fi or Wireless adapters
          if (lower.includes('wi-fi') || lower.includes('wlan') || lower.includes('wireless')) {
            return addr.address;
          }
          if (!candidate) candidate = addr.address;
        }
      }
    }

    return candidate;
  }

  public getDiscoveryStatus() {
    return {
      active: !!this.udpSocket,
      discoveryPort: this.discoveryPort,
      lanAddress: this.currentLanAddress,
      servicePort: this.servicePort,
      nodeId: this.nodeId,
    };
  }
}
