/**
 * Splitting a long episode list into ranges.
 *
 * A virtualized list nested inside a scrolling page cannot virtualize: it has
 * no viewport of its own, so it renders every row anyway. One Piece rendered
 * 1173 tiles in one pass that way.
 *
 * Ranges solve both problems at once. Only one block is on screen, so the cost
 * is bounded no matter how long the series, and jumping to episode 900 takes
 * one tap instead of a very long scroll.
 */

/** Episodes per range block. */
export const RANGE_SIZE = 100;

/** Below this, ranges are more chrome than help and the whole list is shown. */
export const RANGE_THRESHOLD = 120;

export interface EpisodeRange {
  /** First episode number in the block. */
  start: number;
  /** Last episode number in the block. */
  end: number;
  label: string;
}

/**
 * Build range blocks for a series.
 *
 * Returns an empty array for short series, which is the caller's signal to
 * render everything without a range selector.
 */
export function buildRanges(episodeNumbers: readonly number[]): EpisodeRange[] {
  if (episodeNumbers.length <= RANGE_THRESHOLD) return [];

  const first = episodeNumbers[0] ?? 1;
  const last = episodeNumbers[episodeNumbers.length - 1] ?? first;

  const ranges: EpisodeRange[] = [];
  for (let start = first; start <= last; start += RANGE_SIZE) {
    const end = Math.min(start + RANGE_SIZE - 1, last);
    ranges.push({ start, end, label: `${start} to ${end}` });
  }
  return ranges;
}

/**
 * The block containing a given episode, or the first block.
 *
 * Used so opening a title mid-series lands on the range you are actually
 * watching rather than back at episode one.
 */
export function rangeIndexFor(
  ranges: readonly EpisodeRange[],
  episodeNumber: number | undefined
): number {
  if (episodeNumber === undefined || ranges.length === 0) return 0;
  const index = ranges.findIndex(
    (range) => episodeNumber >= range.start && episodeNumber <= range.end
  );
  return index === -1 ? 0 : index;
}
