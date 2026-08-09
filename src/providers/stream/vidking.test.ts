import { describe, expect, it } from 'vitest';
import type { Anime, Episode } from '@/domain/anime';
import { ArmMappingClient } from '../mapping/arm';
import { parseVidKingEvent, VIDKING_EVENT_BRIDGE, VidKingProvider } from './vidking';

const anime: Anime = {
  id: 'anilist:16498',
  title: 'Attack on Titan',
  alternativeTitles: ['Shingeki no Kyojin'],
  genres: [],
  status: 'finished',
  studios: [],
  externalLinks: [],
  providerMeta: { malId: 16498 },
};

const episode: Episode = { id: '5', number: 5 };

/** Stands in for the mapping service so URL construction is tested in isolation. */
function stubMapping(target: { tmdbId: number; season: number; isMovie: boolean } | undefined) {
  return {
    resolveTmdb: async () => target,
  } as unknown as ArmMappingClient;
}

describe('VidKingProvider', () => {
  it('builds a TV embed URL from the mapped TMDB id and season', async () => {
    const provider = new VidKingProvider(
      stubMapping({ tmdbId: 1429, season: 1, isMovie: false })
    );

    const target = await provider.resolve(anime, episode);

    expect(target.kind).toBe('embed');
    expect(target.kind === 'embed' && target.url).toContain(
      'https://www.vidking.net/embed/tv/1429/1/5'
    );
  });

  it('uses the mapped season, not the episode’s own numbering', async () => {
    // AniList lists each season separately; TMDB keeps them under one show.
    const provider = new VidKingProvider(
      stubMapping({ tmdbId: 1429, season: 3, isMovie: false })
    );

    const target = await provider.resolve(anime, episode);
    expect(target.kind === 'embed' && target.url).toContain('/embed/tv/1429/3/5');
  });

  it('addresses movies through the movie endpoint', async () => {
    const provider = new VidKingProvider(
      stubMapping({ tmdbId: 12345, season: 1, isMovie: true })
    );

    const target = await provider.resolve(anime, episode);
    expect(target.kind === 'embed' && target.url).toContain('/embed/movie/12345');
    expect(target.kind === 'embed' && target.url).not.toContain('/embed/tv/');
  });

  it('applies only verified player parameters', async () => {
    const provider = new VidKingProvider(
      stubMapping({ tmdbId: 1429, season: 1, isMovie: false })
    );

    const target = await provider.resolve(anime, episode);
    const url = target.kind === 'embed' ? target.url : '';

    expect(url).toContain('color=6D4AA8');
    // Mobile webviews block unattended autoplay; a player that silently fails
    // to start reads as broken.
    expect(url).toContain('autoPlay=false');
    expect(url).toContain('nextEpisode=true');
  });

  it('sets a Referer so the embed is requested in context', async () => {
    const provider = new VidKingProvider(
      stubMapping({ tmdbId: 1429, season: 1, isMovie: false })
    );
    const target = await provider.resolve(anime, episode);
    expect(target.kind === 'embed' && target.referer).toBe('https://www.vidking.net');
  });

  it('fails clearly when no TMDB mapping exists rather than guessing an id', async () => {
    const provider = new VidKingProvider(stubMapping(undefined));

    await expect(provider.resolve(anime, episode)).rejects.toMatchObject({
      kind: 'notFound',
      provider: 'vidking',
    });
  });

  it('rejects an id it cannot address', async () => {
    const provider = new VidKingProvider(
      stubMapping({ tmdbId: 1, season: 1, isMovie: false })
    );

    await expect(
      provider.resolve({ ...anime, id: 'mangadex:abc' }, episode)
    ).rejects.toMatchObject({ kind: 'notFound' });
  });

  it('tags the target with its provider so the screen can pick a runtime', async () => {
    const provider = new VidKingProvider(
      stubMapping({ tmdbId: 1429, season: 1, isMovie: false })
    );
    const target = await provider.resolve(anime, episode);
    expect(target.provider).toBe('vidking');
  });
});

describe('parseVidKingEvent', () => {
  const payload = {
    event: 'timeupdate',
    currentTime: 412.5,
    duration: 1440,
    progress: 28.6,
    id: '1429',
    mediaType: 'tv',
    season: 1,
    episode: 5,
    timestamp: 1_700_000_000_000,
  };

  it('parses a player event', () => {
    const parsed = parseVidKingEvent(JSON.stringify(payload));
    expect(parsed).toMatchObject({
      event: 'timeupdate',
      currentTime: 412.5,
      duration: 1440,
      episode: 5,
      season: 1,
    });
  });

  it('parses every documented event type', () => {
    for (const event of ['timeupdate', 'play', 'pause', 'ended', 'seeked']) {
      const parsed = parseVidKingEvent(JSON.stringify({ ...payload, event }));
      expect(parsed?.event, event).toBe(event);
    }
  });

  it('ignores unrelated messages on the shared channel', () => {
    // The WebView message channel also carries traffic from the embedded page;
    // throwing on those would break playback tracking entirely.
    expect(parseVidKingEvent('not json')).toBeUndefined();
    expect(parseVidKingEvent('{}')).toBeUndefined();
    expect(parseVidKingEvent('null')).toBeUndefined();
    expect(parseVidKingEvent(JSON.stringify({ type: 'other' }))).toBeUndefined();
  });

  it('rejects an event with no usable position', () => {
    expect(parseVidKingEvent(JSON.stringify({ event: 'play' }))).toBeUndefined();
  });

  it('defaults missing optional numbers rather than producing NaN', () => {
    const parsed = parseVidKingEvent(JSON.stringify({ event: 'play', currentTime: 10 }));
    expect(parsed?.duration).toBe(0);
    expect(parsed?.progress).toBe(0);
  });
});

describe('VIDKING_EVENT_BRIDGE', () => {
  it('forwards PLAYER_EVENT messages to React Native', () => {
    expect(VIDKING_EVENT_BRIDGE).toContain('PLAYER_EVENT');
    expect(VIDKING_EVENT_BRIDGE).toContain('ReactNativeWebView.postMessage');
  });

  it('guards against double injection', () => {
    // injectedJavaScript re-runs on every navigation within the player.
    expect(VIDKING_EVENT_BRIDGE).toContain('__hoshiBridge');
  });

  it('ends with a truthy value so injection does not warn', () => {
    expect(VIDKING_EVENT_BRIDGE.trim().endsWith('true;')).toBe(true);
  });
});
