/**
 * NotesController - Notes HTTP endpoints
 */

import { Controller, Get, Post, Put, Delete, Body, Param, Headers, Query } from '@nestjs/common';
import { NotesService } from './notes.service';

@Controller('notes')
export class NotesController {
  constructor(private notesService: NotesService) {}

  @Post()
  async create(@Headers('authorization') auth: string, @Body() body: any) {
    const userId = this.extractUserId(auth);
    return this.notesService.create(userId, body);
  }

  @Get()
  async findAll(@Headers('authorization') auth: string, @Query() filters: any) {
    const userId = this.extractUserId(auth);
    return this.notesService.findAll(userId, filters);
  }

  @Get(':id')
  async findOne(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.notesService.findOne(userId, id);
  }

  @Put(':id')
  async update(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: any) {
    const userId = this.extractUserId(auth);
    return this.notesService.update(userId, id, body);
  }

  @Delete(':id')
  async remove(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.notesService.remove(userId, id);
  }

  @Post(':id/archive')
  async archive(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.notesService.archive(userId, id);
  }

  @Post(':id/pin')
  async pin(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.notesService.pin(userId, id);
  }

  private extractUserId(auth: string): string {
    return 'user-id';
  }
}
