/**
 * AuthController - Endpoints for Single-Owner Authentication & Device Management
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Headers,
  Param,
  UseGuards,
  UnauthorizedException,
  Request,
} from '@nestjs/common';
import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { DeviceAuthGuard } from './guards/device-auth.guard';

export class DeviceDtoClass {
  @IsString()
  deviceId!: string;

  @IsString()
  deviceName!: string;

  @IsEnum(['windows', 'android', 'ios', 'web'])
  platform!: 'windows' | 'android' | 'ios' | 'web';
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDtoClass)
  device?: DeviceDtoClass;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDtoClass)
  device?: DeviceDtoClass;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  /**
   * Initial setup / Owner Registration
   */
  @Post('register')
  async register(@Body() body: RegisterDto) {
    const { email, password, firstName, lastName, device } = body;
    return this.authService.register(email, password, firstName, lastName, device);
  }

  /**
   * Owner Login with optional device metadata
   */
  @Post('login')
  async login(@Body() body: LoginDto) {
    const { email, password, device } = body;
    return this.authService.login(email, password, device);
  }

  /**
   * Refresh access token
   */
  @Post('refresh')
  async refresh(
    @Body() body: RefreshDto,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.authService.refreshToken(body.refreshToken, deviceId);
  }

  /**
   * Secure Logout current session
   */
  @Post('logout')
  @UseGuards(DeviceAuthGuard)
  async logout(@Request() req: any, @Headers('authorization') authHeader: string) {
    const token = authHeader?.replace('Bearer ', '');
    return this.authService.logout(req.user.id, token);
  }

  /**
   * Get Current Owner Profile & verify token
   */
  @Post('me')
  async getMe(@Headers('authorization') authHeader: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    const payload = await this.authService.validateToken(token);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.usersService.findById(payload.sub);
    return { user };
  }

  /**
   * Device Management: Register a new authorized device
   */
  @Post('devices/register')
  async registerDevice(
    @Headers('authorization') authHeader: string,
    @Body() body: DeviceDtoClass,
  ) {
    const token = authHeader?.replace('Bearer ', '');
    const payload = await this.authService.validateToken(token);
    if (!payload) {
      throw new UnauthorizedException('Authentication required to register device');
    }

    return this.authService.registerDevice(
      payload.sub,
      body.deviceId,
      body.deviceName,
      body.platform,
    );
  }

  /**
   * Device Management: List all authorized devices
   */
  @Get('devices')
  @UseGuards(DeviceAuthGuard)
  async listDevices(@Request() req: any) {
    return this.authService.listDevices(req.user.id);
  }

  /**
   * Device Management: Revoke an authorized device
   */
  @Delete('devices/:deviceId')
  @UseGuards(DeviceAuthGuard)
  async revokeDevice(
    @Request() req: any,
    @Param('deviceId') deviceId: string,
  ) {
    return this.authService.revokeDevice(req.user.id, deviceId);
  }
}
