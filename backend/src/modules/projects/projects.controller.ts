/**
 * ProjectsController - Project Tracker HTTP endpoints
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ProjectsService, CreateProjectDto, UpdateProjectDto } from './projects.service';
import { DeviceAuthGuard } from '../auth/guards/device-auth.guard';

@Controller('projects')
@UseGuards(DeviceAuthGuard)
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  async create(@Request() req: any, @Body() body: CreateProjectDto) {
    return this.projectsService.create(req.user.id, body);
  }

  @Get()
  async findAll(@Request() req: any, @Query() filters: any) {
    return this.projectsService.findAll(req.user.id, filters);
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.projectsService.findOne(req.user.id, id);
  }

  @Put(':id')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: UpdateProjectDto,
  ) {
    return this.projectsService.update(req.user.id, id, body);
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.projectsService.remove(req.user.id, id);
  }

  @Post(':id/tasks/:taskId')
  async linkTask(
    @Request() req: any,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
  ) {
    return this.projectsService.linkTask(req.user.id, id, taskId);
  }

  @Delete(':id/tasks/:taskId')
  async unlinkTask(
    @Request() req: any,
    @Param('taskId') taskId: string,
  ) {
    return this.projectsService.unlinkTask(req.user.id, taskId);
  }
}
