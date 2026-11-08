/**
 * AIVA Calendar Provider Interface
 *
 * Defines the contract for calendar integrations:
 * - LocalCalendarProvider: Internal Prisma database calendar
 * - GoogleCalendarProvider: External Google Calendar API (v3)
 */

export interface CalendarEventInput {
  title: string;
  description?: string | null | undefined;
  location?: string | null | undefined;
  startTime: Date;
  endTime: Date;
  isAllDay?: boolean | undefined;
  attendees?: string[] | undefined;
  meetingLink?: string | null | undefined;
  timeZone?: string | undefined;
}

export interface CalendarEventOutput {
  id: string;
  provider: 'LOCAL' | 'GOOGLE';
  title: string;
  description?: string | null | undefined;
  location?: string | null | undefined;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  attendees: string[];
  meetingLink?: string | null | undefined;
  status?: string | undefined;
  htmlLink?: string | undefined;
}

export interface CalendarProviderStatus {
  connected: boolean;
  provider: 'LOCAL' | 'GOOGLE';
  accountEmail?: string | undefined;
  error?: string | undefined;
  requiredEnvVars?: string[] | undefined;
}

export type CalendarEventUpdateInput = {
  [K in keyof CalendarEventInput]?: CalendarEventInput[K] | undefined;
};

export interface CalendarProvider {
  readonly name: 'LOCAL' | 'GOOGLE';

  getStatus(userId: string): Promise<CalendarProviderStatus>;

  listEvents(
    userId: string,
    options?: { startTime?: Date | undefined; endTime?: Date | undefined; limit?: number | undefined } | undefined,
  ): Promise<CalendarEventOutput[]>;

  getEvent(userId: string, eventId: string): Promise<CalendarEventOutput | null>;

  createEvent(userId: string, input: CalendarEventInput): Promise<CalendarEventOutput>;

  updateEvent(
    userId: string,
    eventId: string,
    updates: CalendarEventUpdateInput,
  ): Promise<CalendarEventOutput>;

  deleteEvent(userId: string, eventId: string): Promise<boolean>;
}
