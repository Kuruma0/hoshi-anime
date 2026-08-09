import { describe, expect, it } from 'vitest';
import { formatRatingValue, formatStars, ratingLabel, starsLabel, toStars } from './rating';

describe('formatRatingValue, the primary rating presentation', () => {
  it('normalises a 0–100 score to one decimal out of 5', () => {
    expect(formatRatingValue(92)).toBe('4.6');
    expect(formatRatingValue(84)).toBe('4.2');
    expect(formatRatingValue(78)).toBe('3.9');
  });

  it('does not assume every provider uses the same scale', () => {
    // 8.2 / 10 → 4.1 / 5, exactly as the spec's worked example.
    expect(formatRatingValue(8.2, 'ten')).toBe('4.1');
    expect(formatRatingValue(82, 'hundred')).toBe('4.1');
    expect(formatRatingValue(4.1, 'five')).toBe('4.1');
  });

  it('drops a redundant trailing zero', () => {
    expect(formatRatingValue(100)).toBe('5');
    expect(formatRatingValue(80)).toBe('4');
    expect(formatRatingValue(0)).toBe('0');
  });

  it('keeps precision a half-star scale would lose', () => {
    // Both round to 4 stars, but the numbers differ.
    expect(formatRatingValue(78)).not.toBe(formatRatingValue(82));
  });

  it('clamps out-of-range values', () => {
    expect(formatRatingValue(120)).toBe('5');
    expect(formatRatingValue(-5)).toBe('0');
  });

  it('returns undefined when there is no score', () => {
    expect(formatRatingValue(undefined)).toBeUndefined();
    expect(formatRatingValue(null)).toBeUndefined();
    expect(formatRatingValue(Number.NaN)).toBeUndefined();
  });
});

describe('ratingLabel', () => {
  it('describes the numeric rating for screen readers', () => {
    expect(ratingLabel('4.6')).toBe('Rated 4.6 out of 5');
  });

  it('returns undefined with no rating', () => {
    expect(ratingLabel(undefined)).toBeUndefined();
  });
});

describe('toStars', () => {
  it('converts a 0–100 score, which is what AniList publishes', () => {
    expect(toStars(100)).toBe(5);
    expect(toStars(80)).toBe(4);
    expect(toStars(50)).toBe(2.5);
    expect(toStars(0)).toBe(0);
  });

  it('rounds to the nearest half star', () => {
    expect(toStars(78)).toBe(4);
    expect(toStars(85)).toBe(4.5);
    expect(toStars(90)).toBe(4.5);
    expect(toStars(95)).toBe(5);
  });

  it('does not assume every provider uses the same scale', () => {
    // The same quality must produce the same stars regardless of scale.
    expect(toStars(8, 'ten')).toBe(toStars(80, 'hundred'));
    expect(toStars(4, 'five')).toBe(toStars(80, 'hundred'));
    expect(toStars(10, 'ten')).toBe(5);
  });

  it('clamps out-of-range values rather than discarding them', () => {
    expect(toStars(120)).toBe(5);
    expect(toStars(-10)).toBe(0);
  });

  it('returns undefined when there is no score', () => {
    expect(toStars(undefined)).toBeUndefined();
    expect(toStars(null)).toBeUndefined();
    expect(toStars(Number.NaN)).toBeUndefined();
  });
});

describe('formatStars', () => {
  it('renders full, half and empty stars to a fixed width of five', () => {
    expect(formatStars(5)).toBe('★★★★★');
    expect(formatStars(4.5)).toBe('★★★★½');
    expect(formatStars(4)).toBe('★★★★☆');
    expect(formatStars(2.5)).toBe('★★½☆☆');
    expect(formatStars(0)).toBe('☆☆☆☆☆');
  });

  it('always renders five positions', () => {
    for (const stars of [0, 0.5, 1, 2.5, 3, 4.5, 5]) {
      expect([...formatStars(stars)!].length, `stars=${stars}`).toBe(5);
    }
  });

  it('returns undefined with no rating', () => {
    expect(formatStars(undefined)).toBeUndefined();
  });
});

describe('starsLabel', () => {
  it('describes the rating for screen readers', () => {
    expect(starsLabel(4)).toBe('4 out of 5 stars');
    expect(starsLabel(4.5)).toBe('4 and a half out of 5 stars');
  });

  it('returns undefined with no rating', () => {
    expect(starsLabel(undefined)).toBeUndefined();
  });
});
