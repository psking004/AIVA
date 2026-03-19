/**
 * TasksController - Task HTTP endpoints
 */

import { Controller, Get, Post, Put, Delete, Body, Param, Headers, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Post()
  async create(@Headers('authorization') auth: string, @Body() body: any) {
    const userId = this.extractUserId(auth);
    return this.tasksService.create(userId, body);
  }

  @Get()
  async findAll(@Headers('authorization') auth: string, @Query() filters: any) {
    const userId = this.extractUserId(auth);
    return this.tasksService.findAll(userId, filters);
  }

  @Get(':id')
  async findOne(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.tasksService.findOne(userId, id);
  }

  @Put(':id')
  async update(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: any) {
    const userId = this.extractUserId(auth);
    return this.tasksService.update(userId, id, body);
  }

  @Delete(':id')
  async remove(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.tasksService.remove(userId, id);
  }

  private extractUserId(auth: string): string {
    // In production, would validate JWT and extract userId
    return 'user-id';
  }
}
