import { describe, expect, it, vi } from 'vitest';
import type { Anime, Episode } from '@/domain/anime';
import { ProviderError } from '@/lib/errors';
import type { AnimeStreamProvider, PlaybackTarget, StreamOption } from '../types';
import { isPlayable, PlaybackService } from './playbackService';
import type { EmbedRuntime } from './types';

const anime: Anime = {
  id: 'anilist:16498',
  title: 'Attack on Titan',
  alternativeTitles: [],
  genres: [],
  status: 'finished',
  studios: [],
  externalLinks: [],
};

const episode: Episode = { id: '1', number: 1 };

/** Minimal provider used to drive the ordering and fallback behaviour. */
function stubProvider(
  id: string,
  behaviour: {
    resolve?: () => Promise<PlaybackTarget>;
    options?: StreamOption[];
    available?: boolean;
  } = {}
): AnimeStreamProvider {
  return {
    id,
    name: id,
    attribution: '',
    kind: 'embed',
    isAvailable: () => behaviour.available ?? true,
    listOptions: async () => behaviour.options ?? [],
    resolve:
      behaviour.resolve ??
      (async () => ({ kind: 'embed', provider: id, url: `https://${id}.test/play` })),
  };
}

function runtime(providerId: string): EmbedRuntime {
  return {
    providerId,
    bridge: 'true;',
    resumeParam: 'at',
    parseProgress: () => undefined,
  };
}

describe('PlaybackService ordering', () => {
  it('uses the first provider when it succeeds', async () => {
    const second = vi.fn();
    const service = new PlaybackService(
      [stubProvider('primary'), stubProvider('secondary', { resolve: second as never })],
      []
    );

    const target = await service.resolve(anime, episode);

    expect(target.provider).toBe('primary');
    // The fallback must not be consulted when the primary works.
    expect(second).not.toHaveBeenCalled();
  });

  it('falls back when the primary throws', async () => {
    const service = new PlaybackService(
      [
        stubProvider('primary', {
          resolve: async () => {
            throw new ProviderError('notFound', 'primary', 'no mapping');
          },
        }),
        stubProvider('secondary'),
      ],
      []
    );

    const target = await service.resolve(anime, episode);
    expect(target.provider).toBe('secondary');
  });

  it('falls back when the primary returns an unplayable target', async () => {
    const service = new PlaybackService(
      [
        stubProvider('primary', {
          resolve: async () => ({ kind: 'embed', provider: 'primary', url: '   ' }),
        }),
        stubProvider('secondary'),
      ],
      []
    );

    expect((await service.resolve(anime, episode)).provider).toBe('secondary');
  });

  it('skips a provider that reports itself unavailable', async () => {
    const service = new PlaybackService(
      [stubProvider('primary', { available: false }), stubProvider('secondary')],
      []
    );

    expect((await service.resolve(anime, episode)).provider).toBe('secondary');
  });

  it('walks the list once, so no fallback loop can form', async () => {
    const attempts: string[] = [];
    const failing = (id: string) =>
      stubProvider(id, {
        resolve: async () => {
          attempts.push(id);
          throw new ProviderError('providerFailure', id, 'down');
        },
      });

    const service = new PlaybackService([failing('a'), failing('b')], []);

    await expect(service.resolve(anime, episode)).rejects.toBeInstanceOf(ProviderError);
    // Each provider is tried exactly once, in order.
    expect(attempts).toEqual(['a', 'b']);
  });

  it('reports a single plain failure when every provider fails', async () => {
    const service = new PlaybackService(
      [
        stubProvider('a', {
          resolve: async () => {
            throw new ProviderError('providerFailure', 'a', 'internal detail');
          },
        }),
      ],
      []
    );

    await expect(service.resolve(anime, episode)).rejects.toBeInstanceOf(ProviderError);
  });

  it('reports notConfigured when nothing is available at all', async () => {
    const service = new PlaybackService([stubProvider('a', { available: false })], []);
    await expect(service.resolve(anime, episode)).rejects.toMatchObject({
      kind: 'notConfigured',
    });
  });
});

describe('PlaybackService option routing', () => {
  it('namespaces options so each can be routed back to its provider', async () => {
    const service = new PlaybackService(
      [stubProvider('primary', { options: [{ id: 'sub', label: 'Subtitled' }] })],
      []
    );

    const options = await service.listOptions(anime, episode);
    expect(options[0]?.id).toBe('primary::sub');
  });

  it('honours an explicitly chosen provider rather than starting from the top', async () => {
    const service = new PlaybackService(
      [stubProvider('primary'), stubProvider('secondary')],
      []
    );

    const target = await service.resolve(anime, episode, 'secondary::dub');
    expect(target.provider).toBe('secondary');
  });
});

describe('PlaybackService runtimes', () => {
  it('returns the runtime matching a resolved target', () => {
    const service = new PlaybackService(
      [stubProvider('primary')],
      [runtime('primary'), runtime('secondary')]
    );

    expect(service.runtimeFor('secondary')?.providerId).toBe('secondary');
    expect(service.runtimeFor('unknown')).toBeUndefined();
  });
});

describe('isPlayable', () => {
  it('accepts a real URL', () => {
    expect(isPlayable({ kind: 'embed', provider: 'x', url: 'https://a.test/p' })).toBe(true);
  });

  it('rejects empty, blank and non-http targets', () => {
    expect(isPlayable({ kind: 'embed', provider: 'x', url: '' })).toBe(false);
    expect(isPlayable({ kind: 'embed', provider: 'x', url: '   ' })).toBe(false);
    expect(isPlayable({ kind: 'embed', provider: 'x', url: 'about:blank' })).toBe(false);
    expect(isPlayable(undefined)).toBe(false);
  });
});
