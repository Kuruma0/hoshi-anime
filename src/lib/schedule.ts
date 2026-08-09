import type { ScheduleEntry } from '@/domain/anime';

/**
 * Weekly schedule time handling.
 *
 * Providers report airing times as Unix seconds in UTC. Everything the user
 * sees is in their own timezone, so the conversion happens here once — §15
 * calls out timezone handling specifically, and getting it wrong shows up as an
 * anime appearing on the wrong day for anyone not near UTC.
 */

export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * The seven-day window starting at local midnight today.
 *
 * Anchored to today rather than to a calendar week so "what's airing today"
 * is always the first bucket, which is the question §15 says users are asking.
 */
export function localWeekRange(now: Date = new Date()): { start: number; end: number } {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  return {
    start: Math.floor(startOfToday.getTime() / 1000),
    end: Math.floor(endOfWeek.getTime() / 1000),
  };
}

/** The seven local days of the window, today first. */
export function weekDays(now: Date = new Date()): { date: Date; dayIndex: DayIndex }[] {
  const days: { date: Date; dayIndex: DayIndex }[] = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(cursor);
    date.setDate(date.getDate() + offset);
    days.push({ date, dayIndex: date.getDay() as DayIndex });
  }

  return days;
}

/**
 * Group airings by local calendar date.
 *
 * Keyed by local date rather than by weekday number, because a seven-day window
 * starting today spans two different instances of the same weekday at its
 * edges — bucketing by weekday alone would merge them.
 */
export function groupByLocalDate(entries: ScheduleEntry[]): Map<string, ScheduleEntry[]> {
  const groups = new Map<string, ScheduleEntry[]>();

  for (const entry of entries) {
    const key = localDateKey(new Date(entry.airingAt * 1000));
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }

  for (const bucket of groups.values()) {
    bucket.sort((a, b) => a.airingAt - b.airingAt);
  }

  return groups;
}

/** Stable local-date key, e.g. "2026-08-09". Never uses UTC. */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Local wall-clock time, e.g. "23:30". */
export function formatAiringTime(airingAt: number): string {
  const date = new Date(airingAt * 1000);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** Compact countdown to an airing, e.g. "in 2d 4h", "in 35m", "aired". */
export function formatCountdown(airingAt: number, now: number = Date.now()): string {
  const seconds = airingAt - Math.floor(now / 1000);
  if (seconds <= 0) return 'aired';

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}
