/**
 * AutomationController - Automation HTTP endpoints
 */

import { Controller, Get, Post, Put, Delete, Body, Param, Headers, Query } from '@nestjs/common';
import { AutomationService } from './automation.service';

@Controller('automation')
export class AutomationController {
  constructor(private automationService: AutomationService) {}

  @Post()
  async create(@Headers('authorization') auth: string, @Body() body: any) {
    const userId = this.extractUserId(auth);
    return this.automationService.create(userId, body);
  }

  @Get()
  async findAll(@Headers('authorization') auth: string, @Query('active') active: string) {
    const userId = this.extractUserId(auth);
    return this.automationService.findAll(userId, active !== 'false');
  }

  @Get(':id')
  async findOne(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.automationService.findOne(userId, id);
  }

  @Put(':id')
  async update(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: any) {
    const userId = this.extractUserId(auth);
    return this.automationService.update(userId, id, body);
  }

  @Post(':id/activate')
  async activate(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.automationService.activate(userId, id);
  }

  @Post(':id/deactivate')
  async deactivate(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.automationService.deactivate(userId, id);
  }

  @Post(':id/trigger')
  async trigger(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.automationService.trigger(userId, id);
  }

  @Delete(':id')
  async remove(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.automationService.remove(userId, id);
  }

  private extractUserId(auth: string): string {
    return 'user-id';
  }
}
