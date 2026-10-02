/**
 * AutomationController - Automation HTTP endpoints
 */

import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { DeviceAuthGuard } from '../auth/guards/device-auth.guard';

@Controller('automation')
@UseGuards(DeviceAuthGuard)
export class AutomationController {
  constructor(private automationService: AutomationService) {}

  @Post()
  async create(@Request() req: any, @Body() body: any) {
    return this.automationService.create(req.user.id, body);
  }

  @Get()
  async findAll(@Request() req: any, @Query('active') active: string) {
    return this.automationService.findAll(req.user.id, active !== 'false');
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.automationService.findOne(req.user.id, id);
  }

  @Put(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.automationService.update(req.user.id, id, body);
  }

  @Post(':id/activate')
  async activate(@Request() req: any, @Param('id') id: string) {
    return this.automationService.activate(req.user.id, id);
  }

  @Post(':id/deactivate')
  async deactivate(@Request() req: any, @Param('id') id: string) {
    return this.automationService.deactivate(req.user.id, id);
  }

  @Post(':id/trigger')
  async trigger(@Request() req: any, @Param('id') id: string) {
    return this.automationService.trigger(req.user.id, id);
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.automationService.remove(req.user.id, id);
  }
}

