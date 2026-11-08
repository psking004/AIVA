/**
 * Google Calendar Provider
 *
 * Implements real Google Calendar integration via Google Calendar REST API v3.
 * Handles OAuth 2.0 token refreshes, event CRUD, timezone awareness, and error isolation.
 * If credentials are not configured, truthfully reports NOT_CONNECTED without faking.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import {
  CalendarProvider,
  CalendarEventInput,
  CalendarEventUpdateInput,
  CalendarEventOutput,
  CalendarProviderStatus,
} from './calendar-provider.interface';

@Injectable()
export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = 'GOOGLE' as const;
  private readonly logger = new Logger(GoogleCalendarProvider.name);

  private cachedAccessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private getRequiredEnvVars(): string[] {
    return [
      'GOOGLE_CALENDAR_CLIENT_ID',
      'GOOGLE_CALENDAR_CLIENT_SECRET',
      'GOOGLE_CALENDAR_REFRESH_TOKEN',
    ];
  }

  private async getOAuthCredentials(userId?: string): Promise<{
    clientId: string | null;
    clientSecret: string | null;
    refreshToken: string | null;
    accountEmail?: string;
  }> {
    // 1. Check environment variables
    const clientId =
      this.configService.get<string>('GOOGLE_CALENDAR_CLIENT_ID') ||
      this.configService.get<string>('GOOGLE_CLIENT_ID') ||
      null;
    const clientSecret =
      this.configService.get<string>('GOOGLE_CALENDAR_CLIENT_SECRET') ||
      this.configService.get<string>('GOOGLE_CLIENT_SECRET') ||
      null;
    const refreshToken =
      this.configService.get<string>('GOOGLE_CALENDAR_REFRESH_TOKEN') ||
      this.configService.get<string>('GOOGLE_REFRESH_TOKEN') ||
      null;

    if (clientId && clientSecret && refreshToken) {
      return { clientId, clientSecret, refreshToken };
    }

    // 2. Check per-user stored EmailAccount in Prisma
    if (userId) {
      const account = await this.prisma.emailAccount.findFirst({
        where: {
          userId,
          provider: { in: ['google', 'gmail'] },
          isActive: true,
        },
      });

      if (account && account.refreshToken) {
        return {
          clientId: clientId || this.configService.get<string>('GOOGLE_CLIENT_ID') || null,
          clientSecret: clientSecret || this.configService.get<string>('GOOGLE_CLIENT_SECRET') || null,
          refreshToken: account.refreshToken,
          accountEmail: account.email,
        };
      }
    }

    return { clientId, clientSecret, refreshToken };
  }

  async getStatus(userId?: string): Promise<CalendarProviderStatus> {
    const creds = await this.getOAuthCredentials(userId);
    const missing: string[] = [];

    if (!creds.clientId) missing.push('GOOGLE_CALENDAR_CLIENT_ID');
    if (!creds.clientSecret) missing.push('GOOGLE_CALENDAR_CLIENT_SECRET');
    if (!creds.refreshToken) missing.push('GOOGLE_CALENDAR_REFRESH_TOKEN');

    if (missing.length > 0) {
      return {
        connected: false,
        provider: 'GOOGLE',
        error: `Google Calendar OAuth is not configured. Missing required credentials: ${missing.join(', ')}`,
        requiredEnvVars: this.getRequiredEnvVars(),
      };
    }

    return {
      connected: true,
      provider: 'GOOGLE',
      accountEmail: creds.accountEmail || 'primary',
      requiredEnvVars: this.getRequiredEnvVars(),
    };
  }

  private async getValidAccessToken(userId?: string): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && this.tokenExpiresAt > now + 60000) {
      return this.cachedAccessToken;
    }

    const creds = await this.getOAuthCredentials(userId);
    if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
      throw new Error(
        `Google Calendar is not connected to AIVA. Required environment variables: ${this.getRequiredEnvVars().join(', ')}`,
      );
    }

    this.logger.debug('Refreshing Google Calendar OAuth access token...');

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          refresh_token: creds.refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Google OAuth token refresh failed: HTTP ${response.status} - ${errorText}`);
        throw new Error(`Google Calendar authorization failed: HTTP ${response.status}`);
      }

      const data: any = await response.json();
      if (!data.access_token) {
        throw new Error('Google OAuth token refresh did not return an access token.');
      }

      this.cachedAccessToken = String(data.access_token);
      this.tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      return this.cachedAccessToken;
    } catch (err: any) {
      this.logger.error(`Google Calendar token refresh exception: ${err.message}`);
      throw new Error(`Google Calendar authorization error: ${err.message}`);
    }
  }

  async listEvents(
    userId: string,
    options?: { startTime?: Date; endTime?: Date; limit?: number },
  ): Promise<CalendarEventOutput[]> {
    const token = await this.getValidAccessToken(userId);
    const limit = options?.limit ?? 20;

    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('maxResults', String(limit));
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    if (options?.startTime) {
      url.searchParams.set('timeMin', options.startTime.toISOString());
    }
    if (options?.endTime) {
      url.searchParams.set('timeMax', options.endTime.toISOString());
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Calendar API error (HTTP ${res.status}): ${err}`);
    }

    const data: any = await res.json();
    const items = data.items || [];

    return items.map((item: any) => this.mapGoogleEventToOutput(item));
  }

  async getEvent(userId: string, eventId: string): Promise<CalendarEventOutput | null> {
    const token = await this.getValidAccessToken(userId);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (res.status === 404) return null;
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Calendar API error (HTTP ${res.status}): ${err}`);
    }

    const data: any = await res.json();
    return this.mapGoogleEventToOutput(data);
  }

  async createEvent(userId: string, input: CalendarEventInput): Promise<CalendarEventOutput> {
    const token = await this.getValidAccessToken(userId);
    const timeZone = input.timeZone || 'UTC';

    const body: Record<string, unknown> = {
      summary: input.title,
      description: input.description ?? undefined,
      location: input.location ?? undefined,
    };

    if (input.isAllDay) {
      body.start = { date: input.startTime.toISOString().slice(0, 10) };
      body.end = { date: input.endTime.toISOString().slice(0, 10) };
    } else {
      body.start = { dateTime: input.startTime.toISOString(), timeZone };
      body.end = { dateTime: input.endTime.toISOString(), timeZone };
    }

    if (input.attendees && input.attendees.length > 0) {
      body.attendees = input.attendees.map((email) => ({ email }));
    }

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Calendar event creation failed (HTTP ${res.status}): ${err}`);
    }

    const created: any = await res.json();
    this.logger.log(`Created Google Calendar event: "${created.summary}" (id: ${created.id})`);
    return this.mapGoogleEventToOutput(created);
  }

  async updateEvent(
    userId: string,
    eventId: string,
    updates: CalendarEventUpdateInput,
  ): Promise<CalendarEventOutput> {
    const token = await this.getValidAccessToken(userId);
    const body: Record<string, unknown> = {};

    if (updates.title !== undefined) body.summary = updates.title;
    if (updates.description !== undefined) body.description = updates.description;
    if (updates.location !== undefined) body.location = updates.location;

    if (updates.startTime) {
      body.start = updates.isAllDay
        ? { date: updates.startTime.toISOString().slice(0, 10) }
        : { dateTime: updates.startTime.toISOString() };
    }
    if (updates.endTime) {
      body.end = updates.isAllDay
        ? { date: updates.endTime.toISOString().slice(0, 10) }
        : { dateTime: updates.endTime.toISOString() };
    }

    if (updates.attendees) {
      body.attendees = updates.attendees.map((email) => ({ email }));
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Calendar event update failed (HTTP ${res.status}): ${err}`);
    }

    const updated: any = await res.json();
    return this.mapGoogleEventToOutput(updated);
  }

  async deleteEvent(userId: string, eventId: string): Promise<boolean> {
    const token = await this.getValidAccessToken(userId);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (res.status === 204 || res.status === 200) {
      return true;
    }
    if (res.status === 404) {
      return false;
    }

    const err = await res.text();
    throw new Error(`Google Calendar event deletion failed (HTTP ${res.status}): ${err}`);
  }

  private mapGoogleEventToOutput(item: any): CalendarEventOutput {
    const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
    const startStr = item.start?.dateTime || item.start?.date || new Date().toISOString();
    const endStr = item.end?.dateTime || item.end?.date || startStr;

    return {
      id: item.id,
      provider: 'GOOGLE',
      title: item.summary || 'Untitled Event',
      description: item.description || null,
      location: item.location || null,
      startTime: new Date(startStr),
      endTime: new Date(endStr),
      isAllDay,
      attendees: (item.attendees || []).map((a: any) => a.email).filter(Boolean),
      meetingLink: item.hangoutLink || item.conferenceData?.entryPoints?.[0]?.uri || null,
      status: item.status || 'confirmed',
      htmlLink: item.htmlLink || undefined,
    };
  }
}
