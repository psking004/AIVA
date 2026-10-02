/**
 * AuthService - Single-Owner & Device Authorization
 *
 * AIVA is a private personal assistant for a single owner.
 * Features:
 * - Single-owner account bootstrap & registration lockdown
 * - Hardware device registration & revocation (Windows PC, Android Phone)
 * - Access token generation & Refresh-token rotation
 * - Comprehensive security event logging
 */

import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as bcrypt from 'bcrypt';

export interface DeviceDto {
  deviceId: string;
  deviceName: string;
  platform: 'windows' | 'android' | 'ios' | 'web';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Register Owner (Single Owner Mode)
   * If any user already exists, registration is strictly rejected.
   */
  async register(
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
    device?: DeviceDto,
  ) {
    const userCount = await this.prisma.user.count();
    if (userCount > 0) {
      this.logger.warn(`Security alert: Unauthorized registration attempt for ${email}. Single-owner mode active.`);
      throw new ForbiddenException(
        'AIVA is a private personal AI assistant. Multi-user registration is disabled.',
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
      },
    });

    this.logger.log(`AIVA Owner account initialized: ${email}`);

    // Register initial device if provided
    let registeredDevice = null;
    if (device) {
      registeredDevice = await this.registerDevice(
        user.id,
        device.deviceId,
        device.deviceName,
        device.platform,
      );
    }

    const tokens = await this.generateTokens(user.id, user.email, device?.deviceId);

    return {
      user: this.sanitizeUser(user),
      device: registeredDevice,
      ...tokens,
    };
  }

  /**
   * Login Owner with Device Registration / Verification
   */
  async login(email: string, password: string, device?: DeviceDto) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
      this.logger.warn(`Failed login attempt for email: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      this.logger.warn(`Failed login attempt (bad password) for email: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Handle device
    let registeredDevice = null;
    if (device) {
      registeredDevice = await this.registerDevice(
        user.id,
        device.deviceId,
        device.deviceName,
        device.platform,
      );
    }

    const tokens = await this.generateTokens(user.id, user.email, device?.deviceId);

    // Create session record in PostgreSQL
    await this.prisma.session.create({
      data: {
        userId: user.id,
        token: this.hashToken(tokens.accessToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    this.logger.log(`Owner logged in successfully from device: ${device?.deviceName || 'unspecified'}`);

    return {
      user: this.sanitizeUser(user),
      device: registeredDevice,
      ...tokens,
    };
  }

  /**
   * Register or update an authorized device for the owner
   */
  async registerDevice(
    userId: string,
    deviceId: string,
    deviceName: string,
    platform: string,
  ) {
    const existing = await this.prisma.device.findUnique({
      where: { deviceId },
    });

    if (existing) {
      if (existing.revokedAt) {
        this.logger.warn(`Rejected revoked device access: ${deviceId} (${deviceName})`);
        throw new ForbiddenException('This device has been revoked and cannot connect.');
      }

      const updated = await this.prisma.device.update({
        where: { deviceId },
        data: {
          deviceName,
          platform,
          lastSeenAt: new Date(),
        },
      });

      return updated;
    }

    const newDevice = await this.prisma.device.create({
      data: {
        userId,
        deviceId,
        deviceName,
        platform,
        lastSeenAt: new Date(),
      },
    });

    this.logger.log(`Authorized new device: ${deviceName} (${platform}, ID: ${deviceId})`);
    return newDevice;
  }

  /**
   * Validate that a device is authorized and non-revoked
   */
  async validateDevice(userId: string, deviceId: string): Promise<boolean> {
    const device = await this.prisma.device.findUnique({
      where: { deviceId },
    });

    if (!device || device.userId !== userId || device.revokedAt !== null) {
      return false;
    }

    // Update lastSeenAt asynchronously
    this.prisma.device
      .update({
        where: { deviceId },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => {});

    return true;
  }

  /**
   * List all registered devices for the owner
   */
  async listDevices(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  /**
   * Revoke a device, immediately blocking access and invalidating sessions
   */
  async revokeDevice(userId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { deviceId, userId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const updated = await this.prisma.device.update({
      where: { deviceId },
      data: { revokedAt: new Date() },
    });

    this.logger.warn(`Device revoked: "${device.deviceName}" (ID: ${deviceId}) for user ${userId}`);

    // Invalidate user sessions
    await this.prisma.session.deleteMany({
      where: { userId },
    });

    return {
      success: true,
      message: `Device ${device.deviceName} has been revoked.`,
      device: updated,
    };
  }

  /**
   * Logout user and invalidate session
   */
  async logout(userId: string, token: string) {
    if (token) {
      await this.prisma.session.updateMany({
        where: { userId, token: this.hashToken(token) },
        data: { expiresAt: new Date() },
      });
    }

    this.logger.log(`User logged out: ${userId}`);
    return { success: true };
  }

  /**
   * Validate JWT access token
   */
  async validateToken(token: string) {
    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        throw new UnauthorizedException('JWT_SECRET is not configured');
      }
      const payload = this.jwtService.verify(token, { secret });
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string, deviceId?: string) {
    try {
      const jwtSecret = this.configService.get<string>('JWT_SECRET');
      if (!jwtSecret) {
        throw new UnauthorizedException('JWT_SECRET is not configured');
      }
      const refreshSecret =
        this.configService.get<string>('JWT_REFRESH_SECRET') || `${jwtSecret}-refresh`;

      const payload = this.jwtService.verify(refreshToken, { secret: refreshSecret });
      if (!payload || !payload.sub) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check device authorization if provided
      if (deviceId) {
        const isDeviceValid = await this.validateDevice(payload.sub, deviceId);
        if (!isDeviceValid) {
          throw new ForbiddenException('Device is revoked or unauthorized');
        }
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateTokens(user.id, user.email, deviceId);
    } catch (error: any) {
      throw new UnauthorizedException(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Generate access and refresh token pair
   */
  private async generateTokens(userId: string, email: string, deviceId?: string) {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') || `${jwtSecret}-refresh`;

    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        email,
        deviceId,
        type: 'access',
      },
      {
        secret: jwtSecret,
        expiresIn: '1h', // 1 hour short-lived access token
      },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: userId,
        email,
        deviceId,
        type: 'refresh',
      },
      {
        secret: refreshSecret,
        expiresIn: '30d', // 30 days refresh token
      },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 3600,
    };
  }

  /**
   * Hash token for session comparison
   */
  private hashToken(token: string): string {
    return bcrypt.hashSync(token, 10);
  }

  /**
   * Remove sensitive fields
   */
  private sanitizeUser(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
