import { describe, expect, it } from 'vitest';
import type { ScheduleEntry } from '@/domain/anime';
import {
  formatCountdown,
  groupByLocalDate,
  localDateKey,
  localWeekRange,
  weekDays,
} from './schedule';

const anime = {
  id: 'anilist:1',
  title: 'Test',
  alternativeTitles: [],
  genres: [],
  status: 'airing' as const,
  studios: [],
  externalLinks: [],
};

function entry(airingAt: number, episodeNumber = 1): ScheduleEntry {
  return { anime, episodeNumber, airingAt };
}

describe('localWeekRange', () => {
  it('starts at local midnight today, not at UTC midnight', () => {
    const now = new Date(2026, 7, 9, 14, 30, 0);
    const { start } = localWeekRange(now);

    const startDate = new Date(start * 1000);
    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(startDate.getDate()).toBe(9);
  });

  it('spans exactly seven days', () => {
    const now = new Date(2026, 7, 9, 14, 30, 0);
    const { start, end } = localWeekRange(now);
    expect(end - start).toBe(7 * 24 * 60 * 60);
  });

  it('handles a month boundary', () => {
    const { start, end } = localWeekRange(new Date(2026, 7, 30, 9, 0, 0));
    expect(new Date(end * 1000).getMonth()).toBe(8);
    expect(new Date(start * 1000).getMonth()).toBe(7);
  });
});

describe('weekDays', () => {
  it('returns seven days beginning with today', () => {
    const now = new Date(2026, 7, 9);
    const days = weekDays(now);

    expect(days).toHaveLength(7);
    expect(days[0]?.date.getDate()).toBe(9);
    // 2026-08-09 is a Sunday.
    expect(days[0]?.dayIndex).toBe(0);
    expect(days[1]?.dayIndex).toBe(1);
    expect(days[6]?.date.getDate()).toBe(15);
  });

  it('wraps across a month end', () => {
    const days = weekDays(new Date(2026, 7, 30));
    expect(days[6]?.date.getMonth()).toBe(8);
    expect(days[6]?.date.getDate()).toBe(5);
  });
});

describe('groupByLocalDate', () => {
  it('buckets airings by the viewer\'s local date', () => {
    const morning = new Date(2026, 7, 9, 9, 0, 0);
    const evening = new Date(2026, 7, 9, 23, 0, 0);
    const nextDay = new Date(2026, 7, 10, 1, 0, 0);

    const groups = groupByLocalDate([
      entry(Math.floor(evening.getTime() / 1000), 2),
      entry(Math.floor(morning.getTime() / 1000), 1),
      entry(Math.floor(nextDay.getTime() / 1000), 3),
    ]);

    expect(groups.get('2026-08-09')).toHaveLength(2);
    expect(groups.get('2026-08-10')).toHaveLength(1);
  });

  it('sorts each day by airing time', () => {
    const later = Math.floor(new Date(2026, 7, 9, 22, 0, 0).getTime() / 1000);
    const earlier = Math.floor(new Date(2026, 7, 9, 8, 0, 0).getTime() / 1000);

    const groups = groupByLocalDate([entry(later, 2), entry(earlier, 1)]);
    expect(groups.get('2026-08-09')?.map((e) => e.episodeNumber)).toEqual([1, 2]);
  });

  it('keeps the two edge instances of the same weekday apart', () => {
    // A seven-day window starting today contains today's weekday twice.
    const first = Math.floor(new Date(2026, 7, 9, 12, 0, 0).getTime() / 1000);
    const eighth = Math.floor(new Date(2026, 7, 16, 12, 0, 0).getTime() / 1000);

    const groups = groupByLocalDate([entry(first), entry(eighth)]);
    expect(groups.size).toBe(2);
  });

  it('returns an empty map for no entries', () => {
    expect(groupByLocalDate([]).size).toBe(0);
  });
});

describe('localDateKey', () => {
  it('zero-pads and never falls back to UTC', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('formatCountdown', () => {
  const now = new Date(2026, 7, 9, 12, 0, 0).getTime();
  const at = (seconds: number) => Math.floor(now / 1000) + seconds;

  it('formats days, hours and minutes', () => {
    expect(formatCountdown(at(2 * 86_400 + 4 * 3_600), now)).toBe('in 2d 4h');
    expect(formatCountdown(at(3 * 3_600 + 20 * 60), now)).toBe('in 3h 20m');
    expect(formatCountdown(at(35 * 60), now)).toBe('in 35m');
  });

  it('reports a past airing as aired', () => {
    expect(formatCountdown(at(-60), now)).toBe('aired');
    expect(formatCountdown(at(0), now)).toBe('aired');
  });
});
