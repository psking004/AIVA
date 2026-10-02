/**
 * FilesController - Secure File HTTP endpoints
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { DeviceAuthGuard } from '../auth/guards/device-auth.guard';

@Controller('files')
@UseGuards(DeviceAuthGuard)
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max limit
    }),
  )
  async upload(
    @Request() req: any,
    @UploadedFile() file: any,
    @Body() body: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded (field name "file" required)');
    }

    let metadata = {};
    if (body.metadata) {
      try {
        metadata = typeof body.metadata === 'string' ? JSON.parse(body.metadata) : body.metadata;
      } catch {
        // ignore JSON parse error
      }
    }

    return this.filesService.uploadBinary(
      req.user.id,
      file.buffer,
      file.originalname,
      file.mimetype,
      metadata,
    );
  }

  @Get()
  async findAll(@Request() req: any, @Query() filters: any) {
    return this.filesService.findAll(req.user.id, filters);
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.filesService.findOne(req.user.id, id);
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.filesService.remove(req.user.id, id);
  }

  @Get('search/:query')
  async search(@Request() req: any, @Param('query') query: string) {
    return this.filesService.search(req.user.id, query);
  }
}
