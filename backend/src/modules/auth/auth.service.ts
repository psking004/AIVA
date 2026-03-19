/**
 * AuthService - Handles authentication logic
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Register a new user
   */
  async register(email: string, password: string, firstName?: string, lastName?: string) {
    // Check if user exists
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new UnauthorizedException('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
      },
    });

    this.logger.log(`User registered: ${email}`);

    const token = await this.generateToken(user.id);

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  /**
   * Login user
   */
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.generateToken(user.id);

    // Create session
    await this.prisma.session.create({
      data: {
        userId: user.id,
        token: this.hashToken(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    this.logger.log(`User logged in: ${email}`);

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  /**
   * Logout user
   */
  async logout(userId: string, token: string) {
    await this.prisma.session.updateMany({
      where: { userId, token: this.hashToken(token) },
      data: { expiresAt: new Date() },
    });

    this.logger.log(`User logged out: ${userId}`);
  }

  /**
   * Validate JWT token
   */
  async validateToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(userId: string) {
    return this.generateToken(userId);
  }

  /**
   * Generate JWT token
   */
  private async generateToken(userId: string): Promise<string> {
    return this.jwtService.sign({
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * Hash token for storage
   */
  private hashToken(token: string): string {
    return bcrypt.hashSync(token, 10);
  }

  /**
   * Remove sensitive data from user object
   */
  private sanitizeUser(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
