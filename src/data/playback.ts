import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Anime, Episode } from '@/domain/anime';
import { useSettings } from '@/lib/settings';
import { getStreamProvider } from '@/providers/registry';
import { keys } from './keys';

/**
 * Which player the viewer is using, and how to change it.
 *
 * The preference is remembered across titles so someone who found a player that
 * works for them is not asked again on every episode. With no preference set,
 * the registry's first provider is used.
 */
export function useVideoProvider() {
  const service = getStreamProvider();
  const preferred = useSettings((state) => state.preferredVideoProvider);
  const setPreferred = useSettings((state) => state.setPreferredVideoProvider);

  const providers = service.listProviders();

  // A remembered provider that no longer exists must not strand the viewer.
  const known = providers.some((provider) => provider.id === preferred);
  const activeId = (known ? preferred : undefined) ?? service.defaultProviderId;

  return {
    providers,
    activeId,
    select: setPreferred,
  };
}

/**
 * Resolve an episode with one specific player.
 *
 * There is no silent substitution: the viewer picked a player, so a failure is
 * reported rather than quietly answered by a different one. The screen turns
 * that into an offer to switch.
 */
export function usePlaybackTarget(
  anime: Anime | undefined,
  episode: Episode | undefined,
  providerId: string | undefined
) {
  return useQuery({
    queryKey: [
      ...keys.anime.playback(anime?.id ?? '', episode?.number ?? 0),
      providerId ?? 'default',
    ],
    queryFn: ({ signal }) =>
      getStreamProvider().resolveWith(providerId!, anime!, episode!, signal),
    enabled: Boolean(anime && episode && providerId),
    // Every provider declining is not something a retry changes, and a spinner
    // that retries twice before showing the real message is worse than showing
    // it immediately.
    retry: false,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Players that failed after their page was already running.
 *
 * Some embeds answer HTTP 200 and only then report they have no stream, so the
 * failure cannot be seen during resolution. The player screen reports it here
 * and the UI offers the other provider.
 */
export function useReportedFailure() {
  const service = getStreamProvider();

  return useCallback(
    (providerId: string) => {
      // Named for clarity at the call site; the service owns nothing stateful
      // here, the screen decides what to show.
      return service.listProviders().filter((provider) => provider.id !== providerId);
    },
    [service]
  );
}
