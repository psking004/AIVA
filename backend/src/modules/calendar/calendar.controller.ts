/**
 * CalendarController - Calendar HTTP endpoints
 */

import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { DeviceAuthGuard } from '../auth/guards/device-auth.guard';

@Controller('calendar')
@UseGuards(DeviceAuthGuard)
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  @Post('events')
  async create(@Request() req: any, @Body() body: any) {
    return this.calendarService.create(req.user.id, body);
  }

  @Get('events')
  async findAll(@Request() req: any, @Query() filters: any) {
    return this.calendarService.findAll(req.user.id, filters);
  }

  @Get('events/:id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.calendarService.findOne(req.user.id, id);
  }

  @Put('events/:id')
  async update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.calendarService.update(req.user.id, id, body);
  }

  @Delete('events/:id')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.calendarService.remove(req.user.id, id);
  }

  @Get('availability')
  async availability(@Request() req: any, @Query('date') date: string, @Query('duration') duration: string) {
    return this.calendarService.findAvailability(req.user.id, date, parseInt(duration));
  }
}

