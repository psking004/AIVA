/**
 * FilesController - File HTTP endpoints
 */

import { Controller, Get, Post, Delete, Body, Param, Headers, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FilesService } from './files.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@Headers('authorization') auth: string, @Body() body: any) {
    const userId = this.extractUserId(auth);
    return this.filesService.upload(userId, body);
  }

  @Get()
  async findAll(@Headers('authorization') auth: string, @Query() filters: any) {
    const userId = this.extractUserId(auth);
    return this.filesService.findAll(userId, filters);
  }

  @Get(':id')
  async findOne(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.filesService.findOne(userId, id);
  }

  @Delete(':id')
  async remove(@Headers('authorization') auth: string, @Param('id') id: string) {
    const userId = this.extractUserId(auth);
    return this.filesService.remove(userId, id);
  }

  @Get('search/:query')
  async search(@Headers('authorization') auth: string, @Param('query') query: string) {
    const userId = this.extractUserId(auth);
    return this.filesService.search(userId, query);
  }

  private extractUserId(auth: string): string {
    return 'user-id';
  }
}
