import { useQuery } from '@tanstack/react-query';
import type { Anime, Episode } from '@/domain/anime';
import { getStreamProvider } from '@/providers/registry';
import { keys } from './keys';

/**
 * Resolve an episode into something playable.
 *
 * The screen asks for a PlaybackTarget and gets one; which source produced it
 * is the chain's business. `retry: false` because a failure here is almost
 * always "no source configured" or "this source has no such episode" — neither
 * improves by asking again, and a spinner that retries twice before showing the
 * real message is worse than showing it immediately.
 */
export function usePlaybackTarget(anime: Anime | undefined, episode: Episode | undefined) {
  return useQuery({
    queryKey: keys.anime.playback(anime?.id ?? '', episode?.number ?? 0),
    queryFn: ({ signal }) => getStreamProvider().resolve(anime!, episode!, undefined, signal),
    enabled: Boolean(anime && episode),
    retry: false,
    // Embed URLs and manifests can be short-lived; do not serve a stale one.
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });
}
