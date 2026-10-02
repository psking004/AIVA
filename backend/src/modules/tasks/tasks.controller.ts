/**
 * TasksController - Task HTTP endpoints
 */

import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { DeviceAuthGuard } from '../auth/guards/device-auth.guard';

@Controller('tasks')
@UseGuards(DeviceAuthGuard)
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Post()
  async create(@Request() req: any, @Body() body: any) {
    return this.tasksService.create(req.user.id, body);
  }

  @Get()
  async findAll(@Request() req: any, @Query() filters: any) {
    return this.tasksService.findAll(req.user.id, filters);
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.tasksService.findOne(req.user.id, id);
  }

  @Put(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.tasksService.update(req.user.id, id, body);
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.tasksService.remove(req.user.id, id);
  }
}

