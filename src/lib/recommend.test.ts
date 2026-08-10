import { describe, expect, it } from 'vitest';
import type { Anime } from '@/domain/anime';
import type { WatchProgress } from '@/library/types';
import {
  buildTasteProfile,
  classifyWatch,
  dedupeById,
  diversify,
  eraSimilarity,
  explain,
  interleave,
  isProfileUsable,
  profileAffinity,
  rankBySimilarity,
  rankByTaste,
  recencyWeight,
  scoreAgainstProfile,
  scoreAgainstSeed,
  tagSimilarity,
  WEIGHTS,
  type ScoredAnime,
  type TasteSignal,
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

const NOW = Date.UTC(2026, 0, 1);
const DAY = 24 * 60 * 60 * 1000;

const seed = anime({
  id: 'seed',
  genres: ['Action', 'Drama', 'Fantasy'],
  studios: ['Wit Studio'],
  year: 2013,
  score: 85,
});

function signal(overrides: Partial<TasteSignal> & { anime: Anime }): TasteSignal {
  return { kind: 'completed', updatedAt: NOW, ...overrides };
}

function scoredOf(items: readonly ScoredAnime[]): string[] {
  return items.map((entry) => entry.anime.id);
}

function watch(overrides: Partial<WatchProgress> = {}): WatchProgress {
  return {
    animeId: 'anilist:1',
    episodeNumber: 1,
    positionSeconds: 1400,
    durationSeconds: 1440,
    updatedAt: NOW,
    title: 'Show',
    ...overrides,
  };
}

/*
  This is the step that did not exist before. Recommendations read the saved
  list and nothing else, so watching an anime without pressing Add to list
  produced no signal, an unusable profile, an empty result and the rail's
  default "Nothing here yet". These cover the classification directly.
*/
describe('classifyWatch', () => {
  it('counts watching an episode as history without any explicit action', () => {
    const kind = classifyWatch(watch(), anime({ id: 'a', episodeCount: 12 }), NOW);
    expect(kind).toBe('watching');
  });

  it('marks a finished final episode as completed', () => {
    const kind = classifyWatch(
      watch({ episodeNumber: 12, positionSeconds: 1430, durationSeconds: 1440 }),
      anime({ id: 'a', episodeCount: 12 }),
      NOW
    );
    expect(kind).toBe('completed');
  });

  it('does not call the final episode complete when it was only half watched', () => {
    const kind = classifyWatch(
      watch({ episodeNumber: 12, positionSeconds: 700, durationSeconds: 1440 }),
      anime({ id: 'a', episodeCount: 12 }),
      NOW
    );
    expect(kind).toBe('watching');
  });

  it('stays conservative when the provider publishes no episode count', () => {
    const kind = classifyWatch(
      watch({ episodeNumber: 99, positionSeconds: 1430, durationSeconds: 1440 }),
      anime({ id: 'a', episodeCount: undefined }),
      NOW
    );
    expect(kind).toBe('watching');
  });

  it('treats a barely started, long untouched title as abandoned', () => {
    const kind = classifyWatch(
      watch({ episodeNumber: 1, positionSeconds: 200, durationSeconds: 1440, updatedAt: NOW - 60 * DAY }),
      anime({ id: 'a', episodeCount: 24 }),
      NOW
    );
    expect(kind).toBe('abandoned');
  });

  it('does not call a recent drop-off abandoned', () => {
    const kind = classifyWatch(
      watch({ episodeNumber: 1, positionSeconds: 200, durationSeconds: 1440, updatedAt: NOW - DAY }),
      anime({ id: 'a', episodeCount: 24 }),
      NOW
    );
    expect(kind).toBe('watching');
  });

  it('does not call someone deep into a series abandoned', () => {
    const kind = classifyWatch(
      watch({ episodeNumber: 9, positionSeconds: 200, durationSeconds: 1440, updatedAt: NOW - 60 * DAY }),
      anime({ id: 'a', episodeCount: 24 }),
      NOW
    );
    expect(kind).toBe('watching');
  });
});

describe('watch history produces a usable profile on its own', () => {
  it('builds a profile from watching alone, with nothing saved', () => {
    const profile = buildTasteProfile(
      [
        signal({ anime: anime({ id: 'a', genres: ['Action'] }), kind: 'watching' }),
        signal({ anime: anime({ id: 'b', genres: ['Action'] }), kind: 'watching' }),
      ],
      NOW
    );

    expect(isProfileUsable(profile)).toBe(true);
    expect(profile.genres.get('action')).toBe(1);
  });

  it('ranks real candidates from a watch-only profile', () => {
    const profile = buildTasteProfile(
      [
        signal({ anime: anime({ id: 'a', genres: ['Action'], score: 80 }), kind: 'watching' }),
        signal({ anime: anime({ id: 'b', genres: ['Action'], score: 80 }), kind: 'watching' }),
      ],
      NOW
    );

    const ranked = rankByTaste(profile, [
      anime({ id: 'match', genres: ['Action'], score: 82 }),
      anime({ id: 'miss', genres: ['Sports'], score: 40 }),
    ]);

    expect(scoredOf(ranked)[0]).toBe('match');
  });
});

/*
  Candidates are pooled from four sections and a popular show legitimately
  appears in several, so the flattened pool repeats titles. Those repeats used
  to survive scoring and reach the rail, which keys on anime.id: duplicate keys
  make a recycling list render blank cells, which is what the gaps in
  Recommended for you were.
*/
describe('dedupeById', () => {
  it('keeps the first occurrence and drops repeats', () => {
    const result = dedupeById([
      anime({ id: 'a' }),
      anime({ id: 'b' }),
      anime({ id: 'a' }),
    ]);
    expect(result.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('drops entries with no id, which cannot be keyed', () => {
    const result = dedupeById([anime({ id: 'a' }), { id: '' } as Anime]);
    expect(result.map((item) => item.id)).toEqual(['a']);
  });

  it('leaves an already unique list untouched', () => {
    const list = [anime({ id: 'a' }), anime({ id: 'b' })];
    expect(dedupeById(list).map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('ranking never emits a duplicate id', () => {
  const profile = buildTasteProfile(
    [
      signal({ anime: anime({ id: 'h1', genres: ['Action'], score: 80 }) }),
      signal({ anime: anime({ id: 'h2', genres: ['Action'], score: 80 }) }),
    ],
    NOW
  );

  // The exact shape candidatePools() produces: four sections, overlapping.
  const shared = anime({ id: 'anilist:21', genres: ['Action'], score: 88 });
  const pools = [
    [shared, anime({ id: 'anilist:5', genres: ['Action'], score: 70 })],
    [shared, anime({ id: 'anilist:6', genres: ['Action'], score: 71 })],
    [shared, anime({ id: 'anilist:7', genres: ['Action'], score: 72 })],
    [shared],
  ];

  it('returns each title once from an overlapping pool', () => {
    const ids = scoredOf(rankByTaste(profile, pools.flat(), { limit: 20 }));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === 'anilist:21')).toHaveLength(1);
  });

  it('still returns every distinct title, rather than trimming the list', () => {
    const ids = scoredOf(rankByTaste(profile, pools.flat(), { limit: 20 }));
    expect(ids).toContain('anilist:5');
    expect(ids).toContain('anilist:6');
    expect(ids).toContain('anilist:7');
  });

  it('deduplicates the similar-titles path too', () => {
    const ids = scoredOf(
      rankBySimilarity(seed, [
        anime({ id: 'dup', genres: ['Action', 'Drama'], score: 80 }),
        anime({ id: 'dup', genres: ['Action', 'Drama'], score: 80 }),
      ])
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('weights', () => {
  it('sum to exactly 1, so a perfect match scores 1', () => {
    const total = Object.values(WEIGHTS).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('tagSimilarity', () => {
  it('is 1 for identical sets and 0 for disjoint ones', () => {
    expect(tagSimilarity(['Action'], ['Action'])).toBe(1);
    expect(tagSimilarity(['Action'], ['Comedy'])).toBe(0);
  });

  it('ignores case', () => {
    expect(tagSimilarity(['Action'], ['action'])).toBe(1);
  });

  it('is 0 when either side is empty', () => {
    expect(tagSimilarity([], ['Action'])).toBe(0);
    expect(tagSimilarity(['Action'], [])).toBe(0);
  });

  it('does not reward a title for carrying many tags', () => {
    const focused = tagSimilarity(['Action', 'Drama'], ['Action', 'Drama']);
    const broad = tagSimilarity(
      ['Action', 'Drama'],
      ['Action', 'Drama', 'Comedy', 'Sports', 'Music', 'Horror']
    );
    expect(focused).toBeGreaterThan(broad);
  });
});

describe('eraSimilarity', () => {
  it('is 1 for the same year and 0 a decade apart', () => {
    expect(eraSimilarity(2013, 2013)).toBe(1);
    expect(eraSimilarity(2013, 2023)).toBe(0);
  });

  it('never goes negative', () => {
    expect(eraSimilarity(1990, 2025)).toBe(0);
  });

  it('is 0 when a year is unknown', () => {
    expect(eraSimilarity(undefined, 2013)).toBe(0);
  });
});

describe('recencyWeight', () => {
  it('is 1 now and one half at the half life', () => {
    expect(recencyWeight(NOW, NOW)).toBe(1);
    expect(recencyWeight(NOW - 120 * DAY, NOW)).toBeCloseTo(0.5, 6);
  });

  it('decays but never reaches zero', () => {
    const old = recencyWeight(NOW - 1000 * DAY, NOW);
    expect(old).toBeGreaterThan(0);
    expect(old).toBeLessThan(0.01);
  });

  it('does not exceed 1 for a future timestamp', () => {
    expect(recencyWeight(NOW + 10 * DAY, NOW)).toBe(1);
  });
});

describe('buildTasteProfile', () => {
  it('normalises the strongest genre to 1', () => {
    const profile = buildTasteProfile(
      [
        signal({ anime: anime({ id: 'a', genres: ['Action', 'Drama'] }) }),
        signal({ anime: anime({ id: 'b', genres: ['Action'] }) }),
      ],
      NOW
    );

    expect(profile.genres.get('action')).toBe(1);
    expect(profile.genres.get('drama')).toBeLessThan(1);
  });

  it('weights a completed title above a saved one', () => {
    const completed = buildTasteProfile(
      [signal({ anime: anime({ id: 'a', genres: ['Action'] }), kind: 'completed' })],
      NOW
    );
    const saved = buildTasteProfile(
      [signal({ anime: anime({ id: 'a', genres: ['Action'] }), kind: 'saved' })],
      NOW
    );

    // Both normalise to 1 alone, so compare against a shared competing genre.
    const mixedCompleted = buildTasteProfile(
      [
        signal({ anime: anime({ id: 'a', genres: ['Action'] }), kind: 'completed' }),
        signal({ anime: anime({ id: 'b', genres: ['Comedy'] }), kind: 'saved' }),
      ],
      NOW
    );

    expect(completed.genres.get('action')).toBe(1);
    expect(saved.genres.get('action')).toBe(1);
    expect(mixedCompleted.genres.get('comedy')!).toBeLessThan(
      mixedCompleted.genres.get('action')!
    );
  });

  it('lets an abandoned genre fall away', () => {
    const profile = buildTasteProfile(
      [
        signal({ anime: anime({ id: 'a', genres: ['Action'] }), kind: 'completed' }),
        signal({ anime: anime({ id: 'b', genres: ['Ecchi'] }), kind: 'abandoned' }),
      ],
      NOW
    );

    expect(profile.genres.get('action')).toBe(1);
    expect(profile.genres.has('ecchi')).toBe(false);
  });

  it('does not let one abandoned title veto a genre the viewer watches', () => {
    const profile = buildTasteProfile(
      [
        signal({ anime: anime({ id: 'a', genres: ['Action'] }), kind: 'completed' }),
        signal({ anime: anime({ id: 'b', genres: ['Action'] }), kind: 'completed' }),
        signal({ anime: anime({ id: 'c', genres: ['Action'] }), kind: 'abandoned' }),
      ],
      NOW
    );

    expect(profile.genres.get('action')).toBe(1);
  });

  it('discounts old activity relative to recent activity', () => {
    const profile = buildTasteProfile(
      [
        signal({ anime: anime({ id: 'old', genres: ['Mecha'] }), updatedAt: NOW - 480 * DAY }),
        signal({ anime: anime({ id: 'new', genres: ['Slice of Life'] }), updatedAt: NOW }),
      ],
      NOW
    );

    expect(profile.genres.get('slice of life')).toBe(1);
    expect(profile.genres.get('mecha')!).toBeLessThan(0.2);
  });

  it('excludes abandoned titles from the quality baseline', () => {
    const profile = buildTasteProfile(
      [
        signal({ anime: anime({ id: 'a', genres: ['Action'], score: 90 }), kind: 'completed' }),
        signal({ anime: anime({ id: 'b', genres: ['Action'], score: 30 }), kind: 'abandoned' }),
      ],
      NOW
    );

    expect(profile.qualityBaseline).toBeCloseTo(0.9, 6);
  });

  it('counts only positive signals towards the sample size', () => {
    const profile = buildTasteProfile(
      [
        signal({ anime: anime({ id: 'a', genres: ['Action'] }), kind: 'completed' }),
        signal({ anime: anime({ id: 'b', genres: ['Ecchi'] }), kind: 'abandoned' }),
      ],
      NOW
    );

    expect(profile.sampleSize).toBe(1);
  });

  it('produces an unusable profile from nothing', () => {
    const profile = buildTasteProfile([], NOW);
    expect(profile.genres.size).toBe(0);
    expect(isProfileUsable(profile)).toBe(false);
  });

  it('treats a single title as too thin to personalise from', () => {
    const profile = buildTasteProfile(
      [signal({ anime: anime({ id: 'a', genres: ['Action'] }) })],
      NOW
    );
    expect(isProfileUsable(profile)).toBe(false);
  });
});

describe('profileAffinity', () => {
  it('rewards matching a strongly preferred tag over a weak one', () => {
    const profile = new Map([
      ['action', 1],
      ['comedy', 0.2],
    ]);

    expect(profileAffinity(profile, ['Action'])).toBeGreaterThan(
      profileAffinity(profile, ['Comedy'])
    );
  });

  it('does not reward padding a title with unmatched tags', () => {
    const profile = new Map([['action', 1]]);

    expect(profileAffinity(profile, ['Action'])).toBeGreaterThan(
      profileAffinity(profile, ['Action', 'Horror', 'Sports', 'Music'])
    );
  });

  it('is 0 against an empty profile', () => {
    expect(profileAffinity(new Map(), ['Action'])).toBe(0);
  });
});

describe('scoreAgainstProfile', () => {
  const profile = buildTasteProfile(
    [
      signal({ anime: anime({ id: 'a', genres: ['Action'], studios: ['Wit Studio'], year: 2013, score: 85 }) }),
      signal({ anime: anime({ id: 'b', genres: ['Action'], studios: ['Wit Studio'], year: 2014, score: 85 }) }),
    ],
    NOW
  );

  it('scores a close match above an unrelated one', () => {
    const near = scoreAgainstProfile(
      profile,
      anime({ id: 'near', genres: ['Action'], studios: ['Wit Studio'], year: 2013, score: 85 })
    );
    const far = scoreAgainstProfile(
      profile,
      anime({ id: 'far', genres: ['Sports'], studios: ['Other'], year: 1999, score: 60 })
    );

    expect(near.total).toBeGreaterThan(far.total);
  });

  it('reports every component, and a total equal to their weighted sum', () => {
    const breakdown = scoreAgainstProfile(
      profile,
      anime({ id: 'x', genres: ['Action'], studios: ['Wit Studio'], year: 2013, score: 85 })
    );

    const recomputed =
      breakdown.genre * WEIGHTS.genre +
      breakdown.studio * WEIGHTS.studio +
      breakdown.quality * WEIGHTS.quality +
      breakdown.era * WEIGHTS.era +
      breakdown.popularity * WEIGHTS.popularity;

    expect(breakdown.total).toBeCloseTo(recomputed, 10);
  });

  it('does not punish a candidate rated above the viewer baseline', () => {
    const better = scoreAgainstProfile(profile, anime({ id: 'better', score: 95 }));
    expect(better.quality).toBe(1);
  });

  it('keeps every component within 0..1', () => {
    const breakdown = scoreAgainstProfile(
      profile,
      anime({ id: 'x', genres: ['Action'], studios: ['Wit Studio'], year: 2013, score: 10 })
    );

    for (const value of Object.values(breakdown)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('scoreAgainstSeed', () => {
  it('scores a same-studio same-genre title highest', () => {
    const twin = scoreAgainstSeed(
      seed,
      anime({ id: 'twin', genres: ['Action', 'Drama', 'Fantasy'], studios: ['Wit Studio'], year: 2013, score: 85 })
    );
    const other = scoreAgainstSeed(seed, anime({ id: 'other', genres: ['Comedy'], year: 2005 }));

    expect(twin.total).toBeGreaterThan(other.total);
  });
});

describe('rankByTaste', () => {
  const profile = buildTasteProfile(
    [
      signal({ anime: anime({ id: 'a', genres: ['Action', 'Fantasy'], score: 85 }) }),
      signal({ anime: anime({ id: 'b', genres: ['Action', 'Fantasy'], score: 85 }) }),
    ],
    NOW
  );

  const pool = [
    anime({ id: 'match', genres: ['Action', 'Fantasy'], score: 88 }),
    anime({ id: 'partial', genres: ['Action', 'Comedy'], score: 70 }),
    anime({ id: 'unrelated', genres: ['Sports'], score: 40 }),
  ];

  it('ranks the closest match first', () => {
    expect(scoredOf(rankByTaste(profile, pool))[0]).toBe('match');
  });

  it('excludes ids the viewer already has', () => {
    const result = rankByTaste(profile, pool, { exclude: new Set(['match']) });
    expect(scoredOf(result)).not.toContain('match');
  });

  it('drops candidates below the threshold rather than padding', () => {
    const result = rankByTaste(profile, pool, { threshold: 0.5 });
    expect(result.length).toBeLessThan(pool.length);
  });

  it('returns nothing for an unusable profile, so the caller can fall back', () => {
    expect(rankByTaste(buildTasteProfile([], NOW), pool)).toEqual([]);
  });

  it('attaches a reason to every result', () => {
    for (const entry of rankByTaste(profile, pool)) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it('respects the limit', () => {
    expect(rankByTaste(profile, pool, { limit: 1 })).toHaveLength(1);
  });
});

describe('rankBySimilarity', () => {
  const pool = [
    anime({ id: 'close', genres: ['Action', 'Drama', 'Fantasy'], studios: ['Wit Studio'], year: 2013, score: 84 }),
    anime({ id: 'loose', genres: ['Action'], year: 2016, score: 70 }),
    anime({ id: 'unrelated', genres: ['Sports'], year: 1998, score: 55 }),
  ];

  it('ranks the closest title first', () => {
    expect(scoredOf(rankBySimilarity(seed, pool))[0]).toBe('close');
  });

  it('never returns the seed itself', () => {
    expect(scoredOf(rankBySimilarity(seed, [seed, ...pool]))).not.toContain('seed');
  });

  it('names the shared genres in the reason', () => {
    const [top] = rankBySimilarity(seed, pool);
    expect(top!.reason).toContain(seed.title);
  });
});

describe('diversify', () => {
  it('breaks up a run of near-identical titles', () => {
    const scored: ScoredAnime[] = [
      { anime: anime({ id: 'a1', genres: ['Action'] }), score: 0.9, breakdown: null as never, reason: '' },
      { anime: anime({ id: 'a2', genres: ['Action'] }), score: 0.89, breakdown: null as never, reason: '' },
      { anime: anime({ id: 'a3', genres: ['Action'] }), score: 0.88, breakdown: null as never, reason: '' },
      { anime: anime({ id: 'c1', genres: ['Comedy'] }), score: 0.7, breakdown: null as never, reason: '' },
    ];

    const picked = diversify(scored, 2);
    expect(picked[0]!.anime.id).toBe('a1');
    // The comedy title is worse on score but adds something the row lacks.
    expect(picked[1]!.anime.id).toBe('c1');
  });

  it('caps how many titles one studio can take', () => {
    const scored: ScoredAnime[] = ['s1', 's2', 's3', 's4'].map((id, index) => ({
      anime: anime({ id, genres: ['Action'], studios: ['Kyoto Animation'] }),
      score: 0.9 - index * 0.01,
      breakdown: null as never,
      reason: '',
    }));

    expect(diversify(scored, 4)).toHaveLength(2);
  });

  it('keeps the best title first', () => {
    const scored: ScoredAnime[] = [
      { anime: anime({ id: 'best', genres: ['Action'] }), score: 0.95, breakdown: null as never, reason: '' },
      { anime: anime({ id: 'other', genres: ['Comedy'] }), score: 0.5, breakdown: null as never, reason: '' },
    ];

    expect(diversify(scored, 2)[0]!.anime.id).toBe('best');
  });

  it('is deterministic for the same input', () => {
    const scored: ScoredAnime[] = ['a', 'b', 'c'].map((id, index) => ({
      anime: anime({ id, genres: ['Action', 'Drama'] }),
      score: 0.8 - index * 0.1,
      breakdown: null as never,
      reason: '',
    }));

    expect(scoredOf(diversify(scored, 3))).toEqual(scoredOf(diversify(scored, 3)));
  });

  it('handles an empty list', () => {
    expect(diversify([], 5)).toEqual([]);
  });
});

describe('explain', () => {
  const profile = buildTasteProfile(
    [
      signal({ anime: anime({ id: 'a', genres: ['Action', 'Dark Fantasy'], studios: ['Mappa'] }) }),
      signal({ anime: anime({ id: 'b', genres: ['Action', 'Dark Fantasy'], studios: ['Mappa'] }) }),
    ],
    NOW
  );

  it('names the shared genres when genre led the score', () => {
    const candidate = anime({ id: 'x', genres: ['Action', 'Dark Fantasy'] });
    const reason = explain(profile, candidate, scoreAgainstProfile(profile, candidate));

    expect(reason).toContain('Action');
    expect(reason).toContain('Dark Fantasy');
  });

  it('falls back to a generic line when nothing matched', () => {
    const candidate = anime({ id: 'x', genres: [], score: undefined });
    const reason = explain(profile, candidate, {
      genre: 0,
      studio: 0,
      quality: 0,
      era: 0,
      popularity: 0,
      total: 0,
    });

    expect(reason).toBe('Popular with viewers');
  });

  it('never uses an em dash', () => {
    const candidate = anime({ id: 'x', genres: ['Action', 'Dark Fantasy'], studios: ['Mappa'] });
    const reason = explain(profile, candidate, scoreAgainstProfile(profile, candidate));

    // Escaped rather than literal so the character itself stays out of the tree.
    expect(reason).not.toContain('\u2014');
  });
});

describe('interleave', () => {
  it('takes one from each pool in turn', () => {
    const result = interleave(
      [
        [anime({ id: 'a1' }), anime({ id: 'a2' })],
        [anime({ id: 'b1' }), anime({ id: 'b2' })],
      ],
      4
    );

    expect(result.map((item) => item.id)).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  it('drops titles that appear in more than one pool', () => {
    const shared = anime({ id: 'shared' });
    const result = interleave([[shared], [shared, anime({ id: 'other' })]], 5);

    expect(result.map((item) => item.id)).toEqual(['shared', 'other']);
  });

  it('respects the limit', () => {
    expect(interleave([[anime({ id: 'a' }), anime({ id: 'b' })]], 1)).toHaveLength(1);
  });

  it('survives empty pools', () => {
    expect(interleave([[], []], 5)).toEqual([]);
    expect(interleave([], 5)).toEqual([]);
  });
});
