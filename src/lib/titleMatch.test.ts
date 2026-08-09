import { describe, expect, it } from 'vitest';
import {
  findBestMatch,
  normalizeTitle,
  rankByTitle,
  scoreTitleMatch,
  type TitleBearer,
} from './titleMatch';

const aot: TitleBearer = {
  title: 'Attack on Titan',
  originalTitle: '進撃の巨人',
  alternativeTitles: ['Shingeki no Kyojin', 'AoT', 'SnK'],
};

const csm: TitleBearer = {
  title: 'Chainsaw Man',
  originalTitle: 'チェンソーマン',
  alternativeTitles: ['Chainsaw Man', '电锯人', 'Testere Adam'],
};

describe('normalizeTitle', () => {
  it('folds case, accents and punctuation', () => {
    expect(normalizeTitle('Pokémon')).toBe('pokemon');
    expect(normalizeTitle('Fate/stay night: Unlimited Blade Works')).toBe(
      'fate stay night unlimited blade works'
    );
    expect(normalizeTitle("JoJo's Bizarre Adventure")).toBe('jojos bizarre adventure');
  });

  it('collapses whitespace', () => {
    expect(normalizeTitle('  Attack   on  Titan ')).toBe('attack on titan');
  });

  it('preserves non-latin scripts', () => {
    expect(normalizeTitle('進撃の巨人')).toBe('進撃の巨人');
  });
});

/** Any score at or above this is an exact hit on some title variant. */
const EXACT = 0.95;

describe('scoreTitleMatch — the §14 requirement', () => {
  it('matches the English title', () => {
    expect(scoreTitleMatch('Attack on Titan', aot)).toBeGreaterThanOrEqual(EXACT);
  });

  it('matches the romanised Japanese title', () => {
    expect(scoreTitleMatch('Shingeki no Kyojin', aot)).toBeGreaterThanOrEqual(EXACT);
  });

  it('matches the native Japanese title', () => {
    expect(scoreTitleMatch('進撃の巨人', aot)).toBeGreaterThanOrEqual(EXACT);
  });

  it('matches an abbreviation synonym', () => {
    expect(scoreTitleMatch('snk', aot)).toBeGreaterThanOrEqual(EXACT);
  });

  it('matches a prefix as the user types', () => {
    const partial = scoreTitleMatch('attack on', aot);
    expect(partial).toBeGreaterThan(0.5);
    // A prefix must never outrank a full exact match.
    expect(partial).toBeLessThan(EXACT);
  });

  it('matches words out of order', () => {
    expect(scoreTitleMatch('titan attack', aot)).toBeGreaterThan(0);
  });

  it('scores an unrelated query at zero', () => {
    expect(scoreTitleMatch('chainsaw man', aot)).toBe(0);
  });

  it('ranks a primary-title hit above the same hit on a synonym', () => {
    const synonymOnly: TitleBearer = {
      title: 'Something Else',
      alternativeTitles: ['Attack on Titan'],
    };
    expect(scoreTitleMatch('Attack on Titan', aot)).toBeGreaterThan(
      scoreTitleMatch('Attack on Titan', synonymOnly)
    );
  });
});

describe('rankByTitle', () => {
  it('promotes the exact match without dropping other results', () => {
    const spinOff: TitleBearer = {
      title: 'Attack on Titan: Junior High',
      alternativeTitles: [],
    };
    const ranked = rankByTitle('Attack on Titan', [spinOff, aot, csm]);

    expect(ranked[0]).toBe(aot);
    expect(ranked).toHaveLength(3);
    expect(ranked).toContain(csm);
  });

  it('is stable for equally-scoring items', () => {
    const ranked = rankByTitle('zzzz-no-match', [aot, csm]);
    expect(ranked).toEqual([aot, csm]);
  });
});

describe('findBestMatch — cross-provider matching', () => {
  it('matches across providers via a shared synonym', () => {
    const catalogue: TitleBearer[] = [
      { title: 'Chainsaw Man', alternativeTitles: [] },
      { title: 'Shingeki no Kyojin', alternativeTitles: [] },
    ];
    expect(findBestMatch(aot, catalogue)?.title).toBe('Shingeki no Kyojin');
  });

  it('ignores season suffixes when comparing', () => {
    const catalogue: TitleBearer[] = [{ title: 'Attack on Titan Season 2', alternativeTitles: [] }];
    expect(findBestMatch(aot, catalogue)).toBeDefined();
  });

  it('returns undefined rather than guessing when nothing is close', () => {
    const catalogue: TitleBearer[] = [
      { title: 'Cowboy Bebop', alternativeTitles: [] },
      { title: 'Neon Genesis Evangelion', alternativeTitles: [] },
    ];
    expect(findBestMatch(aot, catalogue)).toBeUndefined();
  });

  it('returns undefined for an empty catalogue', () => {
    expect(findBestMatch(aot, [])).toBeUndefined();
  });
});
