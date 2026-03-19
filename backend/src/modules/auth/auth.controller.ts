/**
 * AuthController - HTTP endpoints for authentication
 */

import { Controller, Post, Body, Headers, Logger } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Post('register')
  async register(@Body() body: RegisterDto) {
    const { email, password, firstName, lastName } = body;
    return this.authService.register(email, password, firstName, lastName);
  }

  @Post('login')
  async login(@Body() body: LoginDto) {
    const { email, password } = body;
    return this.authService.login(email, password);
  }

  @Post('logout')
  async logout(@Headers('authorization') authHeader: string, @Body() body: LogoutDto) {
    const token = authHeader?.replace('Bearer ', '');
    const userId = body.userId;
    return this.authService.logout(userId, token);
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshDto) {
    const { userId } = body;
    const newToken = await this.authService.refreshToken(userId);
    return { token: newToken };
  }

  @Post('me')
  async getMe(@Headers('authorization') authHeader: string) {
    const token = authHeader?.replace('Bearer ', '');
    const payload = await this.authService.validateToken(token);

    if (!payload) {
      return { error: 'Invalid token' };
    }

    const user = await this.usersService.findById(payload.sub);
    return { user };
  }
}

interface RegisterDto {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

interface LoginDto {
  email: string;
  password: string;
}

interface LogoutDto {
  userId: string;
}

interface RefreshDto {
  userId: string;
}
