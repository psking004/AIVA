/**
 * AnalyticsController - Analytics HTTP endpoints
 */

import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { DeviceAuthGuard } from '../auth/guards/device-auth.guard';

@Controller('analytics')
@UseGuards(DeviceAuthGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('dashboard')
  async getDashboard(@Request() req: any) {
    return this.analyticsService.getDashboard(req.user.id);
  }

  @Get('activity')
  async getActivity(@Request() req: any, @Query('days') days: string) {
    return this.analyticsService.getActivitySummary(req.user.id, parseInt(days) || 7);
  }

  @Get('productivity')
  async getProductivity(
    @Request() req: any,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    return this.analyticsService.getProductivityStats(
      req.user.id,
      new Date(start),
      new Date(end),
    );
  }
}

