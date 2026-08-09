import { describe, expect, it } from 'vitest';
import {
  collectAltTitles,
  compareChapters,
  coverImage,
  isReadable,
  normalizeChapter,
  normalizeContentRating,
  normalizeExternalIds,
  normalizeManga,
  normalizePages,
  normalizeStatus,
  normalizeTags,
  pickLocalized,
} from './normalize';
import type { Chapter } from '@/domain/manga';
import type { MdAtHome, MdChapter, MdManga, MdTag } from './types';

/**
 * Fixtures below are trimmed from live api.mangadex.org responses, so the
 * quirks they encode (title under `ja-ro`, licensed chapters with pages: 0)
 * are real API behaviour rather than invented edge cases.
 */

const chainsawMan: MdManga = {
  id: 'a77742b1-befd-49a4-bff5-1ad4e6b0ef7b',
  type: 'manga',
  attributes: {
    // Note: no `en` key. The English title lives in altTitles.
    title: { 'ja-ro': 'Chainsaw Man' },
    altTitles: [
      { uk: 'Людина-бензопила' },
      { ja: 'チェンソーマン' },
      { 'zh-hk': '鏈鋸人' },
      { tr: 'Testere Adam' },
      { en: 'Chainsaw Man' },
    ],
    description: { en: 'Denji merges with his chainsaw devil dog.', fr: 'Denji...' },
    originalLanguage: 'ja',
    lastChapter: null,
    status: 'ongoing',
    year: 2018,
    contentRating: 'suggestive',
    tags: [
      { id: 't1', type: 'tag', attributes: { name: { en: 'Action' }, description: {}, group: 'genre', version: 1 } },
      { id: 't2', type: 'tag', attributes: { name: { en: 'Gore' }, description: {}, group: 'content', version: 1 } },
      { id: 't3', type: 'tag', attributes: { name: { en: 'Oneshot' }, description: {}, group: 'format', version: 1 } },
      { id: 't4', type: 'tag', attributes: { name: { en: 'Demons' }, description: {}, group: 'theme', version: 1 } },
    ],
    availableTranslatedLanguages: ['en', 'fr', null, 'ru'],
  },
  relationships: [
    { id: 'c1', type: 'cover_art', attributes: { fileName: 'cover.jpg' } },
    { id: 'a1', type: 'author', attributes: { name: 'Fujimoto Tatsuki' } },
    { id: 'a1', type: 'artist', attributes: { name: 'Fujimoto Tatsuki' } },
    { id: 'u1', type: 'user' },
  ],
};

describe('pickLocalized', () => {
  it('prefers English', () => {
    expect(pickLocalized({ en: 'Attack on Titan', ja: '進撃の巨人' })).toBe('Attack on Titan');
  });

  it('falls back to romanised Japanese when there is no English key', () => {
    // The real Chainsaw Man case; reading `.en` directly would return nothing.
    expect(pickLocalized({ 'ja-ro': 'Chainsaw Man' })).toBe('Chainsaw Man');
  });

  it('falls back to any available value', () => {
    expect(pickLocalized({ uk: 'Людина-бензопила' })).toBe('Людина-бензопила');
  });

  it('returns undefined for empty or missing maps', () => {
    expect(pickLocalized(undefined)).toBeUndefined();
    expect(pickLocalized({})).toBeUndefined();
  });
});

describe('collectAltTitles', () => {
  it('flattens every language variant and de-duplicates', () => {
    const titles = collectAltTitles(chainsawMan.attributes);
    expect(titles).toContain('Chainsaw Man');
    expect(titles).toContain('チェンソーマン');
    expect(titles).toContain('Testere Adam');
    // Present in both `title` and `altTitles`, must appear once.
    expect(titles.filter((t) => t === 'Chainsaw Man')).toHaveLength(1);
  });
});

describe('normalizeTags', () => {
  it('keeps genre and theme tags only', () => {
    expect(normalizeTags(chainsawMan.attributes.tags)).toEqual(['Action', 'Demons']);
  });

  it('drops content warnings and publication formats', () => {
    const genres = normalizeTags(chainsawMan.attributes.tags);
    expect(genres).not.toContain('Gore');
    expect(genres).not.toContain('Oneshot');
  });

  it('handles an empty tag list', () => {
    expect(normalizeTags([] as MdTag[])).toEqual([]);
  });
});

describe('normalizeStatus', () => {
  it('maps every known status', () => {
    expect(normalizeStatus('ongoing')).toBe('ongoing');
    expect(normalizeStatus('completed')).toBe('completed');
    expect(normalizeStatus('hiatus')).toBe('hiatus');
    expect(normalizeStatus('cancelled')).toBe('cancelled');
  });

  it('falls back to unknown', () => {
    expect(normalizeStatus(undefined)).toBe('unknown');
    expect(normalizeStatus('something-new')).toBe('unknown');
  });
});

describe('normalizeContentRating', () => {
  it('passes through known ratings', () => {
    expect(normalizeContentRating('safe')).toBe('safe');
    expect(normalizeContentRating('erotica')).toBe('erotica');
  });

  it('treats an unknown rating as the most restrictive, not the least', () => {
    // Failing open here would leak unrated content past a "safe" filter.
    expect(normalizeContentRating(undefined)).toBe('pornographic');
    expect(normalizeContentRating('weird')).toBe('pornographic');
  });
});

describe('coverImage', () => {
  it('builds sized cover URLs from the relationship', () => {
    const image = coverImage(chainsawMan);
    expect(image?.url).toBe(
      'https://uploads.mangadex.org/covers/a77742b1-befd-49a4-bff5-1ad4e6b0ef7b/cover.jpg.512.jpg'
    );
    expect(image?.thumbnailUrl).toContain('.256.jpg');
  });

  it('returns undefined when cover_art was not included', () => {
    expect(coverImage({ ...chainsawMan, relationships: [] })).toBeUndefined();
  });
});

describe('normalizeManga', () => {
  const manga = normalizeManga(chainsawMan);

  it('namespaces the id so it stays unambiguous across providers', () => {
    expect(manga.id).toBe('mangadex:a77742b1-befd-49a4-bff5-1ad4e6b0ef7b');
  });

  it('resolves a display title even with no `en` key', () => {
    expect(manga.title).toBe('Chainsaw Man');
  });

  it('exposes the native title separately', () => {
    expect(manga.originalTitle).toBe('チェンソーマン');
  });

  it('does not repeat the display title in alternatives', () => {
    expect(manga.alternativeTitles).not.toContain('Chainsaw Man');
    expect(manga.alternativeTitles).toContain('Testere Adam');
  });

  it('maps authors and artists', () => {
    expect(manga.authors).toEqual(['Fujimoto Tatsuki']);
    expect(manga.artists).toEqual(['Fujimoto Tatsuki']);
  });

  it('drops null entries from available languages', () => {
    expect(manga.availableLanguages).toEqual(['en', 'fr', 'ru']);
  });

  it('carries status, year and rating', () => {
    expect(manga.status).toBe('ongoing');
    expect(manga.year).toBe(2018);
    expect(manga.contentRating).toBe('suggestive');
  });

  it('survives a sparse response without throwing', () => {
    const sparse: MdManga = {
      id: 'x',
      type: 'manga',
      attributes: { title: {}, altTitles: [], description: {}, tags: [] },
      relationships: [],
    };
    const result = normalizeManga(sparse);
    expect(result.title).toBe('Untitled');
    expect(result.genres).toEqual([]);
    expect(result.contentRating).toBe('pornographic');
  });
});

describe('normalizeExternalIds', () => {
  it('extracts the AniList and MyAnimeList ids MangaDex publishes', () => {
    // This is what makes manga → anime an exact lookup rather than a guess.
    expect(normalizeExternalIds({ al: '53390', mal: '23390', amz: 'https://amazon' })).toEqual({
      anilist: '53390',
      myAnimeList: '23390',
    });
  });

  it('omits ids that are absent', () => {
    expect(normalizeExternalIds({ al: '53390' })).toEqual({
      anilist: '53390',
      myAnimeList: undefined,
    });
  });

  it('returns undefined when the work is not cross-referenced', () => {
    expect(normalizeExternalIds(undefined)).toBeUndefined();
    expect(normalizeExternalIds(null)).toBeUndefined();
    expect(normalizeExternalIds({ amz: 'https://amazon' })).toBeUndefined();
    expect(normalizeExternalIds({ al: '  ' })).toBeUndefined();
  });
});

describe('normalizeChapter', () => {
  const licensed: MdChapter = {
    id: '6f2b5712-2461-48fd-a519-c2c9cb93f0b1',
    type: 'chapter',
    attributes: {
      volume: '1',
      chapter: '1',
      title: null,
      translatedLanguage: 'en',
      externalUrl: 'https://viz.com/shonenjump/-/chapter/17489',
      isUnavailable: false,
      publishAt: '2024-05-01T15:29:06+00:00',
      readableAt: '2024-05-01T15:29:06+00:00',
      pages: 0,
    },
    relationships: [
      { id: 'g1', type: 'scanlation_group', attributes: { name: 'Viz Manga (Anglosphere Only)' } },
    ],
  };

  it('maps fields and converts the timestamp to Unix seconds', () => {
    const chapter = normalizeChapter(licensed);
    expect(chapter.number).toBe('1');
    expect(chapter.volume).toBe('1');
    expect(chapter.language).toBe('en');
    expect(chapter.scanlationGroup).toBe('Viz Manga (Anglosphere Only)');
    expect(chapter.publishedAt).toBe(Math.floor(Date.parse('2024-05-01T15:29:06+00:00') / 1000));
  });

  it('preserves the external URL for officially licensed chapters', () => {
    // Real behaviour: licensed chapters report pages: 0 and live off-site.
    // Losing this field would produce an empty reader instead of a "read on
    // Viz" link.
    expect(normalizeChapter(licensed).externalUrl).toContain('viz.com');
  });
});

describe('isReadable', () => {
  const base: Chapter = {
    id: 'c', language: 'en', pageCount: 20, publishedAt: 0,
  };

  it('accepts a normal chapter', () => {
    expect(isReadable(base)).toBe(true);
  });

  it('rejects externally hosted chapters', () => {
    expect(isReadable({ ...base, externalUrl: 'https://viz.com/x' })).toBe(false);
  });

  it('rejects chapters with no pages', () => {
    expect(isReadable({ ...base, pageCount: 0 })).toBe(false);
  });
});

describe('compareChapters', () => {
  const make = (number: string | undefined, publishedAt = 0): Chapter => ({
    id: number ?? 'none', number, language: 'en', pageCount: 1, publishedAt,
  });

  it('orders numerically, not lexically', () => {
    const sorted = [make('10'), make('2'), make('1')].sort(compareChapters);
    expect(sorted.map((c) => c.number)).toEqual(['1', '2', '10']);
  });

  it('places decimal chapters between their neighbours', () => {
    const sorted = [make('11'), make('10.5'), make('10')].sort(compareChapters);
    expect(sorted.map((c) => c.number)).toEqual(['10', '10.5', '11']);
  });

  it('sorts unnumbered chapters to the end by publish date', () => {
    const sorted = [make(undefined, 200), make('1'), make(undefined, 100)].sort(compareChapters);
    expect(sorted[0]?.number).toBe('1');
    expect(sorted[1]?.publishedAt).toBe(100);
    expect(sorted[2]?.publishedAt).toBe(200);
  });
});

describe('normalizePages', () => {
  const atHome: MdAtHome = {
    result: 'ok',
    baseUrl: 'https://cmdxd98sb0x3yprd.mangadex.network',
    chapter: {
      hash: '5c96155c006b3bbb59c21e0f1b66c845',
      data: ['1-abc.jpg', '2-def.jpg'],
      dataSaver: ['1-ghi.jpg', '2-jkl.jpg'],
    },
  };

  it('builds full-quality URLs under /data/', () => {
    expect(normalizePages(atHome).pages[0]).toBe(
      'https://cmdxd98sb0x3yprd.mangadex.network/data/5c96155c006b3bbb59c21e0f1b66c845/1-abc.jpg'
    );
  });

  it('builds data-saver URLs under /data-saver/', () => {
    expect(normalizePages(atHome).dataSaverPages[0]).toContain('/data-saver/');
  });

  it('preserves page order', () => {
    expect(normalizePages(atHome).pages).toHaveLength(2);
    expect(normalizePages(atHome).pages[1]).toContain('2-def.jpg');
  });

  it('sets an expiry so the reader re-resolves an ephemeral host', () => {
    expect(normalizePages(atHome).expiresAt).toBeGreaterThan(Date.now());
  });
});
