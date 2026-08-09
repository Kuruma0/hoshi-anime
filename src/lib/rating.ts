/**
 * Score → 5-star conversion.
 *
 * Providers publish scores on different scales, so the scale is named at the
 * call site rather than assumed. AniList's `averageScore` is 0–100; a provider
 * using 0–10 would pass `'ten'` and get the same stars for the same quality.
 */

export type ScoreScale = 'hundred' | 'ten' | 'five';

const SCALE_MAX: Record<ScoreScale, number> = {
  hundred: 100,
  ten: 10,
  five: 5,
};

/**
 * Convert a raw score to stars out of five, rounded to the nearest half.
 *
 * Halves rather than whole stars because rounding 78/100 to four stars and
 * 82/100 to four stars erases a difference the score actually carries.
 */
export function toStars(
  score: number | undefined | null,
  scale: ScoreScale = 'hundred'
): number | undefined {
  if (score === undefined || score === null || !Number.isFinite(score)) return undefined;

  const max = SCALE_MAX[scale];
  // Out-of-range values are clamped rather than rejected: a provider returning
  // 101 should still render five stars, not nothing.
  const clamped = Math.max(0, Math.min(max, score));

  return Math.round((clamped / max) * 5 * 2) / 2;
}

/**
 * The rating as a number out of five, e.g. `"4.6"`.
 *
 * This is the primary presentation: a row of glyphs can only express half-star
 * steps, so 78/100 and 82/100 would look identical. One decimal keeps the
 * precision the source score actually carries.
 */
export function formatRatingValue(
  score: number | undefined | null,
  scale: ScoreScale = 'hundred'
): string | undefined {
  if (score === undefined || score === null || !Number.isFinite(score)) return undefined;

  const max = SCALE_MAX[scale];
  const clamped = Math.max(0, Math.min(max, score));
  const value = (clamped / max) * 5;

  // A whole number reads better without a redundant ".0".
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Render stars as glyphs.
 *
 * Secondary presentation only — used where a compact visual scale is genuinely
 * more useful than a number, such as the 1–5 tap targets in the source picker.
 */
export function formatStars(stars: number | undefined): string | undefined {
  if (stars === undefined) return undefined;

  const full = Math.floor(stars);
  const hasHalf = stars - full >= 0.5;
  const empty = 5 - full - (hasHalf ? 1 : 0);

  return '★'.repeat(full) + (hasHalf ? '½' : '') + '☆'.repeat(Math.max(0, empty));
}

/** Accessible description, e.g. "4 and a half out of 5 stars". */
export function starsLabel(stars: number | undefined): string | undefined {
  if (stars === undefined) return undefined;
  const whole = Math.floor(stars);
  const half = stars - whole >= 0.5;
  return `${whole}${half ? ' and a half' : ''} out of 5 stars`;
}

/** Accessible description for the numeric form, e.g. "Rated 4.6 out of 5". */
export function ratingLabel(value: string | undefined): string | undefined {
  return value === undefined ? undefined : `Rated ${value} out of 5`;
}
