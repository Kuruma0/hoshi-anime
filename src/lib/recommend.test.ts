import { describe, expect, it } from 'vitest';
import type { Anime } from '@/domain/anime';
import {
  buildTasteProfile,
  eraSimilarity,
  rankBySimilarity,
  rankByTaste,
  similarityScore,
  tagSimilarity,
} from './recommend';

function anime(overrides: Partial<Anime> & { id: string }): Anime {
  return {
    title: overrides.id,
    alternativeTitles: [],
    genres: [],
    status: 'finished',
    studios: [],
    externalLinks: [],
    ...overrides,
  };
}

const seed = anime({
  id: 'seed',
  genres: ['Action', 'Drama', 'Fantasy'],
  studios: ['Wit Studio'],
  year: 2013,
  score: 85,
});

describe('tagSimilarity', () => {
  it('is 1 for identical sets and 0 for disjoint ones', () => {
    expect(tagSimilarity(['Action'], ['Action'])).toBe(1);
    expect(tagSimilarity(['Action'], ['Comedy'])).toBe(0);
  });

  it('ignores case', () => {
    expect(tagSimilarity(['Action'], ['action'])).toBe(1);
  });

  it('does not reward a title simply for carrying more tags', () => {
    // Jaccard, not raw overlap: a twelve genre title should not outrank a
    // focused match just by having more chances to intersect.
    const focused = tagSimilarity(['Action', 'Drama'], ['Action', 'Drama']);
    const bloated = tagSimilarity(
      ['Action', 'Drama'],
      ['Action', 'Drama', 'Comedy', 'Sports', 'Music', 'Horror']
    );
    expect(focused).toBeGreaterThan(bloated);
  });

  it('returns 0 when either side is empty', () => {
    expect(tagSimilarity([], ['Action'])).toBe(0);
    expect(tagSimilarity(['Action'], [])).toBe(0);
  });
});

describe('eraSimilarity', () => {
  it('is 1 for the same year and decays with distance', () => {
    expect(eraSimilarity(2013, 2013)).toBe(1);
    expect(eraSimilarity(2013, 2018)).toBeCloseTo(0.5, 5);
  });

  it('bottoms out rather than going negative', () => {
    expect(eraSimilarity(2000, 2030)).toBe(0);
  });

  it('returns 0 when a year is unknown', () => {
    expect(eraSimilarity(undefined, 2013)).toBe(0);
  });
});

describe('similarityScore', () => {
  it('scores a close match above a distant one', () => {
    const close = anime({
      id: 'close',
      genres: ['Action', 'Drama', 'Fantasy'],
      studios: ['Wit Studio'],
      year: 2014,
      score: 82,
    });
    const distant = anime({
      id: 'distant',
      genres: ['Comedy', 'Slice of Life'],
      studios: ['Other'],
      year: 1998,
      score: 70,
    });

    expect(similarityScore(seed, close)).toBeGreaterThan(similarityScore(seed, distant));
  });

  it('stays within 0 and 1', () => {
    const perfect = anime({ ...seed, id: 'perfect' });
    expect(similarityScore(seed, perfect)).toBeLessThanOrEqual(1);
    expect(similarityScore(seed, anime({ id: 'empty' }))).toBeGreaterThanOrEqual(0);
  });

  it('does not let popularity stand in for similarity', () => {
    // A wildly popular but unrelated title must not beat a genuine match.
    const popularUnrelated = anime({
      id: 'popular',
      genres: ['Comedy'],
      studios: ['Other'],
      year: 2020,
      score: 99,
    });
    const relatedAverage = anime({
      id: 'related',
      genres: ['Action', 'Drama', 'Fantasy'],
      studios: ['Wit Studio'],
      year: 2013,
      score: 60,
    });

    expect(similarityScore(seed, relatedAverage)).toBeGreaterThan(
      similarityScore(seed, popularUnrelated)
    );
  });
});

describe('rankBySimilarity', () => {
  const candidates = [
    anime({ id: 'a', genres: ['Action', 'Drama'], studios: ['Wit Studio'], year: 2013 }),
    anime({ id: 'b', genres: ['Comedy'], year: 1995 }),
    anime({ id: 'c', genres: ['Action', 'Fantasy'], year: 2015 }),
  ];

  it('ranks the closest candidate first', () => {
    expect(rankBySimilarity(seed, candidates)[0]?.id).toBe('a');
  });

  it('never recommends the seed back', () => {
    const withSeed = [...candidates, seed];
    expect(rankBySimilarity(seed, withSeed).some((item) => item.id === 'seed')).toBe(false);
  });

  it('excludes titles the viewer already has', () => {
    const ranked = rankBySimilarity(seed, candidates, { exclude: new Set(['a']) });
    expect(ranked.some((item) => item.id === 'a')).toBe(false);
  });

  it('drops weak matches rather than padding the list', () => {
    // A short honest list beats a long one whose tail is unrelated.
    const ranked = rankBySimilarity(seed, candidates, { threshold: 0.3 });
    expect(ranked.every((item) => item.id !== 'b')).toBe(true);
  });

  it('respects the limit', () => {
    expect(rankBySimilarity(seed, candidates, { limit: 1, threshold: 0 })).toHaveLength(1);
  });

  it('returns nothing when there are no candidates', () => {
    expect(rankBySimilarity(seed, [])).toEqual([]);
  });
});

describe('buildTasteProfile', () => {
  it('surfaces the most frequent genres and studios', () => {
    const profile = buildTasteProfile([
      anime({ id: '1', genres: ['Action', 'Drama'], studios: ['Bones'] }),
      anime({ id: '2', genres: ['Action', 'Comedy'], studios: ['Bones'] }),
      anime({ id: '3', genres: ['Action'], studios: ['Madhouse'] }),
    ]);

    expect(profile.genres[0]).toBe('Action');
    expect(profile.studios[0]).toBe('Bones');
  });

  it('is empty for a viewer with no history', () => {
    expect(buildTasteProfile([])).toEqual({ genres: [], studios: [] });
  });
});

describe('rankByTaste', () => {
  const candidates = [
    anime({ id: 'match', genres: ['Action', 'Drama'], studios: ['Bones'], score: 80 }),
    anime({ id: 'other', genres: ['Sports'], score: 80 }),
  ];

  it('ranks titles matching the profile first', () => {
    const profile = { genres: ['Action', 'Drama'], studios: ['Bones'] };
    expect(rankByTaste(profile, candidates)[0]?.id).toBe('match');
  });

  it('returns nothing for an empty profile, so the caller can fall back', () => {
    // Cold start is the caller's job to handle with trending, not ours to fake.
    expect(rankByTaste({ genres: [], studios: [] }, candidates)).toEqual([]);
  });

  it('excludes titles already in the library', () => {
    const profile = { genres: ['Action'], studios: [] };
    const ranked = rankByTaste(profile, candidates, { exclude: new Set(['match']) });
    expect(ranked.some((item) => item.id === 'match')).toBe(false);
  });
});
