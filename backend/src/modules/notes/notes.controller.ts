/**
 * NotesController - Notes HTTP endpoints
 */

import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { NotesService } from './notes.service';
import { DeviceAuthGuard } from '../auth/guards/device-auth.guard';

@Controller('notes')
@UseGuards(DeviceAuthGuard)
export class NotesController {
  constructor(private notesService: NotesService) {}

  @Post()
  async create(@Request() req: any, @Body() body: any) {
    return this.notesService.create(req.user.id, body);
  }

  @Get()
  async findAll(@Request() req: any, @Query() filters: any) {
    return this.notesService.findAll(req.user.id, filters);
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.notesService.findOne(req.user.id, id);
  }

  @Put(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.notesService.update(req.user.id, id, body);
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.notesService.remove(req.user.id, id);
  }

  @Post(':id/archive')
  async archive(@Request() req: any, @Param('id') id: string) {
    return this.notesService.archive(req.user.id, id);
  }

  @Post(':id/pin')
  async pin(@Request() req: any, @Param('id') id: string) {
    return this.notesService.pin(req.user.id, id);
  }
}

