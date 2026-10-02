/**
 * EmailController - Email HTTP endpoints
 */

import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { EmailService } from './email.service';
import { DeviceAuthGuard } from '../auth/guards/device-auth.guard';

@Controller('email')
@UseGuards(DeviceAuthGuard)
export class EmailController {
  constructor(private emailService: EmailService) {}

  @Post('connect')
  async connect(@Request() req: any, @Body() body: any) {
    return this.emailService.connectAccount(req.user.id, body);
  }

  @Get('accounts')
  async getAccounts(@Request() req: any) {
    return this.emailService.getAccounts(req.user.id);
  }

  @Get('messages')
  async getMessages(@Request() req: any, @Query() filters: any) {
    const account = await this.emailService.getAccounts(req.user.id).then(a => a[0]);
    if (!account) return { error: 'No email account connected' };
    return this.emailService.getEmails(account.id, filters);
  }

  @Post('messages/:id/read')
  async markAsRead(@Request() req: any, @Param('id') id: string) {
    return this.emailService.markAsRead(req.user.id, id);
  }

  @Post('messages/:id/star')
  async markAsStarred(@Request() req: any, @Param('id') id: string) {
    return this.emailService.markAsStarred(req.user.id, id);
  }

  @Delete('messages/:id')
  async deleteEmail(@Request() req: any, @Param('id') id: string) {
    return this.emailService.deleteEmail(req.user.id, id);
  }
}

