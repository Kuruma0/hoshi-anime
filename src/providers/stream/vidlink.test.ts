import { describe, expect, it } from 'vitest';
import type { Anime, Episode } from '@/domain/anime';
import { parseVidLinkProgress, VIDLINK_EVENT_BRIDGE, VidLinkProvider } from './vidlink';

const anime: Anime = {
  id: 'anilist:16498',
  title: 'Attack on Titan',
  alternativeTitles: [],
  genres: [],
  status: 'finished',
  studios: [],
  externalLinks: [],
  providerMeta: { malId: 16498 },
};

const episode: Episode = { id: '5', number: 5 };
const provider = new VidLinkProvider();

describe('VidLinkProvider', () => {
  it('addresses anime by MyAnimeList id and absolute episode number', async () => {
    // No cross-database lookup: AniList already carries the MAL id.
    const target = await provider.resolve(anime, episode);

    expect(target.kind).toBe('embed');
    expect(target.url).toContain('https://vidlink.pro/anime/16498/5/sub');
  });

  it('serves the dub route when that option is chosen', async () => {
    const target = await provider.resolve(anime, episode, 'dub');
    expect(target.url).toContain('/anime/16498/5/dub');
  });

  it('defaults to sub for an unrecognised option', async () => {
    const target = await provider.resolve(anime, episode, 'nonsense');
    expect(target.url).toContain('/anime/16498/5/sub');
  });

  it('accepts a MyAnimeList id stored as a string', async () => {
    const target = await provider.resolve(
      { ...anime, providerMeta: { malId: '1735' } },
      episode
    );
    expect(target.url).toContain('/anime/1735/5/');
  });

  it('applies only documented parameters', async () => {
    const target = await provider.resolve(anime, episode);
    const url = target.url;

    expect(url).toContain('primaryColor=6D4AA8');
    // Mobile WebViews block unattended autoplay.
    expect(url).toContain('autoplay=false');
    // The app shows its own title and episode list above the player.
    expect(url).toContain('title=false');
    expect(url).toContain('nextbutton=false');
    // Serve the other audio track rather than failing when one is missing.
    expect(url).toContain('fallback=true');
  });

  it('tags the target with its provider so the screen can pick a runtime', async () => {
    const target = await provider.resolve(anime, episode);
    expect(target.provider).toBe('vidlink');
  });

  it('reports notFound when there is no MyAnimeList id to address', async () => {
    // This is what lets the service fall through to a TMDB-keyed provider.
    await expect(
      provider.resolve({ ...anime, providerMeta: undefined }, episode)
    ).rejects.toMatchObject({ kind: 'notFound', provider: 'vidlink' });
  });

  it('offers no options for a title it cannot address', async () => {
    expect(await provider.listOptions({ ...anime, providerMeta: {} })).toEqual([]);
  });

  it('offers sub and dub for a title it can address', async () => {
    const options = await provider.listOptions(anime);
    expect(options.map((option) => option.id)).toEqual(['sub', 'dub']);
  });
});

describe('parseVidLinkProgress', () => {
  /** Shape taken from the provider's own documented example. */
  const payload = {
    type: 'MEDIA_DATA',
    data: {
      '76479': {
        id: 76479,
        type: 'tv',
        title: 'The Boys',
        progress: { watched: 31.435372, duration: 3609.867 },
        last_season_watched: '1',
        last_episode_watched: '4',
        show_progress: {
          s1e4: {
            season: '1',
            episode: '4',
            progress: { watched: 120.5, duration: 1440 },
          },
        },
      },
    },
  };

  it('reads position and duration from the per-episode block', () => {
    // The per-episode block is more specific than the rolled-up top level.
    expect(parseVidLinkProgress(JSON.stringify(payload))).toMatchObject({
      positionSeconds: 120.5,
      durationSeconds: 1440,
      episodeNumber: 4,
    });
  });

  it('falls back to the top-level block when there is no episode detail', () => {
    const movie = {
      type: 'MEDIA_DATA',
      data: { '786892': { id: 786892, type: 'movie', progress: { watched: 42, duration: 600 } } },
    };
    expect(parseVidLinkProgress(JSON.stringify(movie))).toMatchObject({
      positionSeconds: 42,
      durationSeconds: 600,
    });
  });

  it('marks completion near the end so the title leaves Continue Watching', () => {
    const done = {
      type: 'MEDIA_DATA',
      data: { '1': { progress: { watched: 1400, duration: 1440 } } },
    };
    expect(parseVidLinkProgress(JSON.stringify(done))?.completed).toBe(true);
  });

  it('does not mark completion mid-episode', () => {
    const mid = {
      type: 'MEDIA_DATA',
      data: { '1': { progress: { watched: 300, duration: 1440 } } },
    };
    expect(parseVidLinkProgress(JSON.stringify(mid))?.completed).toBe(false);
  });

  it('picks the entry with a live position when several are reported', () => {
    // One payload can describe every title watched, not just the current one.
    const many = {
      type: 'MEDIA_DATA',
      data: {
        old: { progress: { watched: 10, duration: 1000 } },
        current: { progress: { watched: 900, duration: 1000 } },
      },
    };
    expect(parseVidLinkProgress(JSON.stringify(many))?.positionSeconds).toBe(900);
  });

  it('ignores unrelated traffic on the shared channel', () => {
    expect(parseVidLinkProgress('not json')).toBeUndefined();
    expect(parseVidLinkProgress('{}')).toBeUndefined();
    expect(parseVidLinkProgress('null')).toBeUndefined();
    expect(parseVidLinkProgress(JSON.stringify({ type: 'OTHER', data: {} }))).toBeUndefined();
    expect(parseVidLinkProgress(JSON.stringify({ type: 'MEDIA_DATA', data: {} }))).toBeUndefined();
  });

  it('rejects an entry with no usable position', () => {
    const empty = { type: 'MEDIA_DATA', data: { '1': { progress: {} } } };
    expect(parseVidLinkProgress(JSON.stringify(empty))).toBeUndefined();
  });
});

describe('VIDLINK_EVENT_BRIDGE', () => {
  it('checks the origin, as the provider documents', () => {
    expect(VIDLINK_EVENT_BRIDGE).toContain("event.origin !== 'https://vidlink.pro'");
  });

  it('forwards MEDIA_DATA to React Native', () => {
    expect(VIDLINK_EVENT_BRIDGE).toContain('MEDIA_DATA');
    expect(VIDLINK_EVENT_BRIDGE).toContain('ReactNativeWebView.postMessage');
  });

  it('guards against double injection', () => {
    expect(VIDLINK_EVENT_BRIDGE).toContain('__hoshiVidlinkBridge');
  });
});
