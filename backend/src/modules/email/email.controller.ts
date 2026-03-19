/**
 * EmailController - Email HTTP endpoints
 */

import { Controller, Get, Post, Delete, Body, Param, Headers, Query } from '@nestjs/common';
import { EmailService } from './email.service';

@Controller('email')
export class EmailController {
  constructor(private emailService: EmailService) {}

  @Post('connect')
  async connect(@Headers('authorization') auth: string, @Body() body: any) {
    const userId = this.extractUserId(auth);
    return this.emailService.connectAccount(userId, body);
  }

  @Get('accounts')
  async getAccounts(@Headers('authorization') auth: string) {
    const userId = this.extractUserId(auth);
    return this.emailService.getAccounts(userId);
  }

  @Get('messages')
  async getMessages(@Headers('authorization') auth: string, @Query() filters: any) {
    const userId = this.extractUserId(auth);
    const account = await this.emailService.getAccounts(userId).then(a => a[0]);
    if (!account) return { error: 'No email account connected' };
    return this.emailService.getEmails(account.id, filters);
  }

  @Post('messages/:id/read')
  async markAsRead(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.emailService.markAsRead(userId, id);
  }

  @Post('messages/:id/star')
  async markAsStarred(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.emailService.markAsStarred(userId, id);
  }

  @Delete('messages/:id')
  async deleteEmail(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.emailService.deleteEmail(userId, id);
  }

  private extractUserId(auth: string): string {
    return 'user-id';
  }
}
