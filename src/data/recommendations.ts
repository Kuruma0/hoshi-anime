import { useQuery } from '@tanstack/react-query';
import type { Anime } from '@/domain/anime';
import { buildTasteProfile, rankBySimilarity, rankByTaste } from '@/lib/recommend';
import { getAnimeProvider } from '@/providers/registry';
import { useLibraryEntries } from './library';

/**
 * Recommendations.
 *
 * Two layers, in this order:
 *
 *   1. The metadata provider's own community recommendations, which are people
 *      saying "if you liked this, try that". Nothing computed beats that.
 *   2. Local scoring over popular titles when the provider has none, using
 *      genres, studios, era and rating.
 *
 * The engine itself lives in lib/recommend and is pure, so the UI depends on
 * hooks and the scoring can be tuned without touching a screen.
 */

const CACHE_TIME = 60 * 60 * 1000;

const recommendationKeys = {
  forTitle: (id: string) => ['recommendations', 'title', id] as const,
  forYou: (signature: string) => ['recommendations', 'you', signature] as const,
};

/**
 * "You may also like", for one title.
 *
 * Falls back to local scoring only when the provider returns nothing, so a
 * curated list is never replaced by a computed one.
 */
export function useSimilarAnime(anime: Anime | undefined) {
  const provider = getAnimeProvider();
  const saved = useLibraryEntries('anime');

  return useQuery({
    queryKey: recommendationKeys.forTitle(anime?.id ?? ''),
    queryFn: async ({ signal }): Promise<Anime[]> => {
      const exclude = new Set((saved.data ?? []).map((entry) => entry.id));

      if (provider.supportsRecommendations) {
        const curated = await provider.getRecommendations!(anime!.id, signal);
        const usable = curated.filter((item) => !exclude.has(item.id));
        if (usable.length > 0) return usable;
      }

      // Nothing curated: score the popular pool against this title instead.
      const pool = await provider.getSection('popular', { limit: 50, signal });
      return rankBySimilarity(anime!, pool.items, { exclude, limit: 12 });
    },
    enabled: Boolean(anime),
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  });
}

/**
 * "Recommended for you", from what the viewer has saved.
 *
 * Returns an empty list on a cold start rather than inventing a profile. The
 * home screen treats that as "show trending instead", which is the honest
 * answer for someone with no history.
 */
export function useRecommendedForYou(limit = 20) {
  const provider = getAnimeProvider();
  const saved = useLibraryEntries('anime');

  const savedIds = (saved.data ?? []).map((entry) => entry.id);
  // Cache key follows the library, so adding a title refreshes the list and
  // nothing else does.
  const signature = savedIds.join(',');

  return useQuery({
    queryKey: recommendationKeys.forYou(signature),
    queryFn: async ({ signal }): Promise<Anime[]> => {
      if (savedIds.length === 0) return [];

      // Detail for saved titles is already cached from browsing them, so this
      // is usually free.
      const history = await Promise.all(
        savedIds.slice(0, 12).map((id) => provider.getAnime(id, signal).catch(() => undefined))
      );

      const profile = buildTasteProfile(
        history.filter((item): item is Anime => item !== undefined)
      );
      if (profile.genres.length === 0) return [];

      const pool = await provider.getSection('popular', { limit: 50, signal });
      return rankByTaste(profile, pool.items, { exclude: new Set(savedIds), limit });
    },
    enabled: saved.isSuccess,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  });
}
