/**
 * AIVA System Context Provider
 *
 * Provides live, authoritative system time, date, timezone, weekday,
 * device metadata, and execution environment.
 * The model should NEVER be asked to guess or hallucinate time/date.
 */

import { Injectable } from '@nestjs/common';
import * as os from 'os';

export interface SystemContext {
  date: string;
  time: string;
  isoTimestamp: string;
  timezone: string;
  weekday: string;
  unixTimestampMs: number;
  hostname: string;
  platform: string;
  arch: string;
}

@Injectable()
export class SystemContextProvider {
  /**
   * Get current structured system context
   */
  public getContext(): SystemContext {
    const now = new Date();

    // Timezone string (e.g. Asia/Kolkata, America/New_York)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    // Locale-formatted human readable date and time
    const date = now.toLocaleDateString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const time = now.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const weekday = now.toLocaleDateString('en-US', {
      timeZone: timezone,
      weekday: 'long',
    });

    return {
      date,
      time,
      isoTimestamp: now.toISOString(),
      timezone,
      weekday,
      unixTimestampMs: now.getTime(),
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
    };
  }

  /**
   * Formatted string summary for LLM context injection
   */
  public getPromptHeader(): string {
    const ctx = this.getContext();
    return `[System Real-World Context]\n- Current Date: ${ctx.weekday}, ${ctx.date}\n- Current Time: ${ctx.time} (${ctx.timezone})\n- Host Machine: ${ctx.hostname} (${ctx.platform}-${ctx.arch})\n`;
  }
}
