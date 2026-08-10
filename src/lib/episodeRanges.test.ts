import { describe, expect, it } from 'vitest';
import { buildRanges, rangeIndexFor, RANGE_SIZE } from './episodeRanges';

const numbers = (count: number, from = 1) =>
  Array.from({ length: count }, (_, index) => index + from);

describe('buildRanges', () => {
  it('returns nothing for a short series, so the whole list is shown', () => {
    expect(buildRanges(numbers(12))).toEqual([]);
    expect(buildRanges(numbers(24))).toEqual([]);
    expect(buildRanges(numbers(100))).toEqual([]);
  });

  it('splits a long series into blocks', () => {
    const ranges = buildRanges(numbers(1173));

    expect(ranges).toHaveLength(Math.ceil(1173 / RANGE_SIZE));
    expect(ranges[0]).toMatchObject({ start: 1, end: 100, label: '1 to 100' });
    expect(ranges.at(-1)).toMatchObject({ start: 1101, end: 1173 });
  });

  it('gives the final block only the episodes that exist', () => {
    const ranges = buildRanges(numbers(250));
    expect(ranges.at(-1)).toMatchObject({ start: 201, end: 250 });
  });

  it('handles a series that does not start at one', () => {
    const ranges = buildRanges(numbers(200, 501));
    expect(ranges[0]?.start).toBe(501);
    expect(ranges.at(-1)?.end).toBe(700);
  });

  it('handles an empty list', () => {
    expect(buildRanges([])).toEqual([]);
  });
});

describe('rangeIndexFor', () => {
  const ranges = buildRanges(numbers(1173));

  it('finds the block holding the episode in progress', () => {
    // Opening mid series should land where you are watching, not at episode 1.
    expect(rangeIndexFor(ranges, 950)).toBe(9);
    expect(rangeIndexFor(ranges, 1)).toBe(0);
    expect(rangeIndexFor(ranges, 1173)).toBe(ranges.length - 1);
  });

  it('falls back to the first block', () => {
    expect(rangeIndexFor(ranges, undefined)).toBe(0);
    expect(rangeIndexFor(ranges, 99999)).toBe(0);
    expect(rangeIndexFor([], 500)).toBe(0);
  });
});
