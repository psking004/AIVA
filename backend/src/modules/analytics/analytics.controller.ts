/**
 * AnalyticsController - Analytics HTTP endpoints
 */

import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('dashboard')
  async getDashboard(@Headers('authorization') auth: string) {
    const userId = this.extractUserId(auth);
    return this.analyticsService.getDashboard(userId);
  }

  @Get('activity')
  async getActivity(@Headers('authorization') auth: string, @Query('days') days: string) {
    const userId = this.extractUserId(auth);
    return this.analyticsService.getActivitySummary(userId, parseInt(days) || 7);
  }

  @Get('productivity')
  async getProductivity(
    @Headers('authorization') auth: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    const userId = this.extractUserId(auth);
    return this.analyticsService.getProductivityStats(
      userId,
      new Date(start),
      new Date(end),
    );
  }

  private extractUserId(auth: string): string {
    return 'user-id';
  }
}
