import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import type { Anime, Episode } from '@/domain/anime';
import { getStreamProvider } from '@/providers/registry';
import { keys } from './keys';

/**
 * Resolve an episode into something playable.
 *
 * Providers are tried in order by the playback service, so this hook does not
 * know or care which one answered. `retry: false` because a failure here means
 * every provider declined; asking again changes nothing and a spinner that
 * retries twice before showing the real message is worse than showing it.
 */
export function usePlaybackTarget(
  anime: Anime | undefined,
  episode: Episode | undefined,
  /** Providers that already failed during playback of this episode. */
  exclude: readonly string[] = []
) {
  return useQuery({
    queryKey: [...keys.anime.playback(anime?.id ?? '', episode?.number ?? 0), ...exclude],
    queryFn: ({ signal }) =>
      getStreamProvider().resolve(anime!, episode!, undefined, signal, exclude),
    enabled: Boolean(anime && episode),
    retry: false,
    // Embed URLs can be short-lived; do not serve a stale one.
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Tracks providers that failed once their player was already running.
 *
 * A player that answers HTTP 200 and only then reports it has no stream cannot
 * be caught during resolution, so the screen reports the failure back here and
 * the next resolution skips it.
 *
 * Each provider can be reported once. That cap is what stops the fallback from
 * cycling: the list only grows, so every retry has strictly fewer providers to
 * try and the sequence terminates.
 */
export function useProviderFallback() {
  const [failed, setFailed] = useState<readonly string[]>([]);

  const reportFailure = useCallback((providerId: string) => {
    setFailed((current) =>
      current.includes(providerId) ? current : [...current, providerId]
    );
  }, []);

  const reset = useCallback(() => setFailed([]), []);

  return { failed, reportFailure, reset };
}
