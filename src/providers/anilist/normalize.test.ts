import { describe, expect, it } from 'vitest';
import {
  alternativeTitles,
  buildEpisodes,
  displayTitle,
  normalizeAnime,
  normalizeExternalLinks,
  normalizeRelations,
  normalizeSeason,
  normalizeStatus,
  normalizeTrailer,
  parseStreamingEpisodeNumber,
  stripEpisodePrefix,
  stripHtml,
} from './normalize';
import type { AlMedia } from './types';

/** Trimmed from a live graphql.anilist.co response. */
const yomiNoTsugai: AlMedia = {
  id: 195600,
  title: {
    romaji: 'Yomi no Tsugai',
    english: 'Daemons of the Shadow Realm',
    native: '黄泉のツガイ',
  },
  synonyms: ['ヨミツガ', 'YomiTsuga', 'Espíritus del Inframundo'],
  description: 'A boy meets his <i>twin</i>.<br><br>Chaos follows.',
  coverImage: {
    extraLarge: 'https://s4.anilist.co/large.jpg',
    large: 'https://s4.anilist.co/medium.jpg',
    color: '#d6e4a1',
  },
  bannerImage: 'https://s4.anilist.co/banner.jpg',
  genres: ['Action', 'Adventure', 'Fantasy'],
  status: 'RELEASING',
  episodes: 24,
  duration: 24,
  season: 'SPRING',
  seasonYear: 2026,
  averageScore: 78,
  isAdult: false,
  studios: { nodes: [{ name: 'Studio Bind' }] },
  nextAiringEpisode: { airingAt: 1786804200, episode: 19 },
};

describe('stripHtml', () => {
  it('removes markup AniList returns even with asHtml: false', () => {
    expect(stripHtml('A boy meets his <i>twin</i>.')).toBe('A boy meets his twin.');
  });

  it('converts breaks to newlines', () => {
    expect(stripHtml('One<br><br>Two')).toBe('One\n\nTwo');
  });

  it('decodes entities', () => {
    expect(stripHtml('Steins&amp;Gate &quot;quoted&quot;')).toBe('Steins&Gate "quoted"');
  });

  it('returns undefined for empty or missing input', () => {
    expect(stripHtml(null)).toBeUndefined();
    expect(stripHtml('')).toBeUndefined();
    expect(stripHtml('<br>')).toBeUndefined();
  });
});

describe('displayTitle', () => {
  it('prefers English', () => {
    expect(displayTitle(yomiNoTsugai)).toBe('Daemons of the Shadow Realm');
  });

  it('falls back to romaji when English is null, the common case', () => {
    const media: AlMedia = { id: 1, title: { romaji: 'Sousou no Frieren', english: null } };
    expect(displayTitle(media)).toBe('Sousou no Frieren');
  });

  it('falls back to native, then to a placeholder', () => {
    expect(displayTitle({ id: 1, title: { native: '進撃の巨人' } })).toBe('進撃の巨人');
    expect(displayTitle({ id: 1 })).toBe('Untitled');
  });
});

describe('alternativeTitles, the §14 search surface', () => {
  const alternatives = alternativeTitles(yomiNoTsugai);

  it('includes romaji so a Japanese-name search matches', () => {
    expect(alternatives).toContain('Yomi no Tsugai');
  });

  it('includes every synonym', () => {
    expect(alternatives).toContain('YomiTsuga');
    expect(alternatives).toContain('Espíritus del Inframundo');
  });

  it('excludes the display title to avoid double-scoring it', () => {
    expect(alternatives).not.toContain('Daemons of the Shadow Realm');
  });
});

describe('normalizeStatus / normalizeSeason', () => {
  it('maps AniList statuses to the domain vocabulary', () => {
    expect(normalizeStatus('RELEASING')).toBe('airing');
    expect(normalizeStatus('FINISHED')).toBe('finished');
    expect(normalizeStatus('NOT_YET_RELEASED')).toBe('upcoming');
    expect(normalizeStatus('CANCELLED')).toBe('cancelled');
    expect(normalizeStatus(null)).toBe('unknown');
  });

  it('maps seasons', () => {
    expect(normalizeSeason('SPRING')).toBe('spring');
    expect(normalizeSeason(null)).toBeUndefined();
  });
});

describe('normalizeExternalLinks', () => {
  it('maps link types and drops incomplete entries', () => {
    const links = normalizeExternalLinks([
      { site: 'Crunchyroll', url: 'https://crunchyroll.com/x', type: 'STREAMING', color: '#F47521' },
      { site: 'Twitter', url: 'https://x.com/y', type: 'SOCIAL' },
      { site: 'Broken', url: '', type: 'INFO' },
      null,
    ]);

    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ site: 'Crunchyroll', type: 'streaming', color: '#F47521' });
    expect(links[1]?.type).toBe('social');
  });

  it('handles a missing array', () => {
    expect(normalizeExternalLinks(null)).toEqual([]);
  });
});

describe('normalizeAnime', () => {
  const anime = normalizeAnime(yomiNoTsugai);

  it('namespaces the id', () => {
    expect(anime.id).toBe('anilist:195600');
  });

  it('carries artwork, banner, genres, studios and score', () => {
    expect(anime.artwork?.url).toBe('https://s4.anilist.co/large.jpg');
    expect(anime.banner?.url).toBe('https://s4.anilist.co/banner.jpg');
    expect(anime.genres).toEqual(['Action', 'Adventure', 'Fantasy']);
    expect(anime.studios).toEqual(['Studio Bind']);
    expect(anime.score).toBe(78);
  });

  it('exposes the next airing episode for the schedule', () => {
    expect(anime.nextEpisode).toEqual({ number: 19, airingAt: 1786804200 });
  });

  it('strips HTML from the synopsis', () => {
    expect(anime.synopsis).not.toContain('<');
  });

  it('survives a near-empty media object', () => {
    const sparse = normalizeAnime({ id: 7 });
    expect(sparse.title).toBe('Untitled');
    expect(sparse.genres).toEqual([]);
    expect(sparse.studios).toEqual([]);
    expect(sparse.externalLinks).toEqual([]);
  });
});

describe('normalizeTrailer', () => {
  it('trims the id, real responses carry trailing whitespace', () => {
    // Verified live: AniList returned "LHtdKWJdif4\t" for Attack on Titan.
    // Passing that through produces a dead embed URL.
    expect(normalizeTrailer({ id: 'LHtdKWJdif4\t', site: 'youtube' })).toEqual({
      youtubeId: 'LHtdKWJdif4',
      thumbnail: undefined,
    });
  });

  it('keeps the thumbnail when present', () => {
    expect(
      normalizeTrailer({ id: 'abc', site: 'youtube', thumbnail: 'https://i.ytimg.com/x.jpg' })
    ).toMatchObject({ youtubeId: 'abc', thumbnail: 'https://i.ytimg.com/x.jpg' });
  });

  it('ignores non-YouTube trailers the player cannot embed', () => {
    expect(normalizeTrailer({ id: 'x123', site: 'dailymotion' })).toBeUndefined();
  });

  it('returns undefined when there is no trailer', () => {
    expect(normalizeTrailer(null)).toBeUndefined();
    expect(normalizeTrailer({ id: '   ', site: 'youtube' })).toBeUndefined();
  });
});

describe('normalizeRelations', () => {
  const edges = [
    {
      relationType: 'ADAPTATION',
      node: { id: 53390, type: 'MANGA', format: 'MANGA', title: { english: 'Attack on Titan' } },
    },
    {
      relationType: 'SEQUEL',
      node: {
        id: 25777,
        type: 'ANIME',
        format: 'TV',
        title: { english: 'Attack on Titan Season 2' },
        seasonYear: 2017,
      },
    },
    {
      relationType: 'SOURCE',
      node: { id: 1, type: 'MANGA', format: 'MANGA', title: { romaji: 'Source Work' } },
    },
    { relationType: 'SPIN_OFF', node: { id: 2, type: 'ANIME', format: 'TV', title: { english: 'Junior High' } } },
    { relationType: 'WHAT_IS_THIS', node: { id: 3, type: 'ANIME', title: { english: 'Odd' } } },
    null,
    { relationType: 'SEQUEL', node: null },
  ];

  const relations = normalizeRelations(edges);

  it('maps AniList relation types to the domain vocabulary', () => {
    expect(relations[0]).toMatchObject({ relation: 'adaptation', kind: 'manga' });
    expect(relations[1]).toMatchObject({ relation: 'sequel', kind: 'anime', year: 2017 });
    expect(relations[3]).toMatchObject({ relation: 'sideStory' });
  });

  it('collapses SOURCE and ADAPTATION; the UI asks the same question either way', () => {
    expect(relations[2]?.relation).toBe('adaptation');
  });

  it('falls back to "other" for relation types it does not know', () => {
    expect(relations[4]?.relation).toBe('other');
  });

  it('namespaces ids so they can be navigated to directly', () => {
    expect(relations[1]?.id).toBe('anilist:25777');
  });

  it('drops entries with no node rather than emitting broken links', () => {
    expect(relations).toHaveLength(5);
  });

  it('handles a missing relations block', () => {
    expect(normalizeRelations(null)).toEqual([]);
    expect(normalizeRelations(undefined)).toEqual([]);
  });
});

describe('parseStreamingEpisodeNumber / stripEpisodePrefix', () => {
  it('extracts the episode number from the partner format', () => {
    expect(parseStreamingEpisodeNumber('Episode 12 - The Title')).toBe(12);
    expect(parseStreamingEpisodeNumber('episode 3 – Dash')).toBe(3);
  });

  it('returns undefined for entries that are not numbered', () => {
    expect(parseStreamingEpisodeNumber('Special Feature')).toBeUndefined();
    expect(parseStreamingEpisodeNumber(null)).toBeUndefined();
  });

  it('strips the prefix, leaving the episode title', () => {
    expect(stripEpisodePrefix('Episode 12 - The Title')).toBe('The Title');
  });

  it('returns undefined when there is no prefix to strip', () => {
    expect(stripEpisodePrefix('The Title')).toBeUndefined();
  });
});

describe('buildEpisodes', () => {
  it('generates a numbered list from the total count', () => {
    const episodes = buildEpisodes({ episodes: 12, status: 'FINISHED' });
    expect(episodes).toHaveLength(12);
    expect(episodes[0]).toMatchObject({ number: 1, upcoming: false });
    expect(episodes[11]?.number).toBe(12);
  });

  it('marks not-yet-aired episodes of a releasing show as upcoming', () => {
    // 24 planned, next airing is #19 → 18 have aired.
    const episodes = buildEpisodes({
      episodes: 24,
      status: 'RELEASING',
      nextAiringEpisode: { airingAt: 1786804200, episode: 19 },
    });

    expect(episodes).toHaveLength(24);
    expect(episodes[17]?.upcoming).toBe(false);
    expect(episodes[18]).toMatchObject({ number: 19, upcoming: true, airedAt: 1786804200 });
    expect(episodes.filter((episode) => !episode.upcoming)).toHaveLength(18);
  });

  it('enriches episodes with matching streaming metadata', () => {
    const episodes = buildEpisodes({
      episodes: 3,
      streamingEpisodes: [
        { title: 'Episode 2 - Second', thumbnail: 'https://x/2.jpg' },
        { title: 'Not numbered', thumbnail: 'https://x/none.jpg' },
        null,
      ],
    });

    expect(episodes[1]).toMatchObject({ number: 2, title: 'Second' });
    expect(episodes[1]?.thumbnail?.url).toBe('https://x/2.jpg');
    // Unmatched entries must not leak onto an arbitrary episode.
    expect(episodes[0]?.thumbnail).toBeUndefined();
    expect(episodes[2]?.title).toBeUndefined();
  });

  it('falls back to aired count when the total is unknown', () => {
    const episodes = buildEpisodes({
      episodes: null,
      status: 'RELEASING',
      nextAiringEpisode: { airingAt: 1, episode: 8 },
    });
    expect(episodes).toHaveLength(7);
    expect(episodes.every((episode) => !episode.upcoming)).toBe(true);
  });

  it('returns an empty list when nothing is known', () => {
    expect(buildEpisodes({})).toEqual([]);
    expect(buildEpisodes({ episodes: 0 })).toEqual([]);
  });
});
