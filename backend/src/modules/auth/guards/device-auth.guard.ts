/**
 * Device Authorization Guard
 *
 * Enforces:
 * 1. Valid JWT Authentication (Single Owner)
 * 2. Authorized Device Verification (x-device-id header)
 *
 * If a device is revoked or unknown, request is strictly rejected with 401/403.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  private readonly logger = new Logger(DeviceAuthGuard.name);

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Extract Bearer token
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }
    const token = authHeader.replace('Bearer ', '').trim();

    // Validate JWT
    const payload = await this.authService.validateToken(token);
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    // Extract Device ID header
    const deviceId = (request.headers['x-device-id'] as string)?.trim();
    if (!deviceId) {
      this.logger.warn(`Security alert: Request from user ${payload.sub} missing x-device-id header`);
      throw new ForbiddenException('Device identity required (missing x-device-id header)');
    }

    // Verify device is registered and authorized
    const isDeviceAuthorized = await this.authService.validateDevice(payload.sub, deviceId);
    if (!isDeviceAuthorized) {
      this.logger.warn(`Security alert: Unauthorized or revoked device "${deviceId}" attempted access for user ${payload.sub}`);
      throw new ForbiddenException('Unauthorized or revoked device');
    }

    // Attach user & device info to request
    request.user = { id: payload.sub, email: payload.email };
    request.deviceId = deviceId;

    return true;
  }
}
