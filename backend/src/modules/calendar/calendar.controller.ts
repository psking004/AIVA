/**
 * CalendarController - Calendar HTTP endpoints
 */

import { Controller, Get, Post, Put, Delete, Body, Param, Headers, Query } from '@nestjs/common';
import { CalendarService } from './calendar.service';

@Controller('calendar')
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  @Post('events')
  async create(@Headers('authorization') auth: string, @Body() body: any) {
    const userId = this.extractUserId(auth);
    return this.calendarService.create(userId, body);
  }

  @Get('events')
  async findAll(@Headers('authorization') auth: string, @Query() filters: any) {
    const userId = this.extractUserId(auth);
    return this.calendarService.findAll(userId, filters);
  }

  @Get('events/:id')
  async findOne(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.calendarService.findOne(userId, id);
  }

  @Put('events/:id')
  async update(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: any) {
    const userId = this.extractUserId(auth);
    return this.calendarService.update(userId, id, body);
  }

  @Delete('events/:id')
  async remove(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.calendarService.remove(userId, id);
  }

  @Get('availability')
  async availability(@Headers('authorization') auth: string, @Query('date') date: string, @Query('duration') duration: string) {
    const userId = this.extractUserId(auth);
    return this.calendarService.findAvailability(userId, date, parseInt(duration));
  }

  private extractUserId(auth: string): string {
    return 'user-id';
  }
}
