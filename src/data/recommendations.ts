import { useQuery } from '@tanstack/react-query';
import type { Anime } from '@/domain/anime';
import { library } from '@/library/storage';
import { isEpisodeComplete, type WatchProgress } from '@/library/types';
import {
  buildTasteProfile,
  interleave,
  isProfileUsable,
  rankBySimilarity,
  rankByTaste,
  type ScoredAnime,
  type TasteSignal,
} from '@/lib/recommend';
import { getAnimeProvider } from '@/providers/registry';
import { useLibraryEntries } from './library';

/**
 * Recommendation service.
 *
 * This module owns everything the pure engine in `lib/recommend` cannot do:
 * reading local activity, fetching candidates, caching, and choosing what to
 * fall back to. Screens consume the hooks and never see any of it.
 *
 * Two layers, in this order:
 *
 *   1. The metadata provider's own community recommendations, which are real
 *      people saying "if you liked this, try that". Nothing computed beats it.
 *   2. Local deterministic scoring, used when the provider has none, or when
 *      the row is personalised rather than about one title.
 *
 * Nothing here is machine learning. See the header of `lib/recommend`.
 */

/** Recommendations are stable for an hour unless the library changes. */
const CACHE_TIME = 60 * 60 * 1000;

/** How many recent watch records feed the profile. */
const HISTORY_LIMIT = 20;

/** How many candidates each pool contributes before scoring. */
const POOL_SIZE = 50;

/**
 * Progress below this fraction of the first episodes, with nothing since,
 * reads as abandoned rather than as taste.
 */
const ABANDON_PROGRESS = 0.5;
const ABANDON_EPISODE = 2;
const ABANDON_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const recommendationKeys = {
  forTitle: (id: string) => ['recommendations', 'title', id] as const,
  forYou: (signature: string) => ['recommendations', 'you', signature] as const,
};

/* -------------------------------------------------------------------------- */
/* Signals                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Classify one watch record into a taste signal kind.
 *
 * Completion needs the episode count, which many currently-airing shows do not
 * publish; without it the record can only be called "watching", which is the
 * conservative reading and is exactly what it is.
 */
export function classifyWatch(
  progress: WatchProgress,
  anime: Anime,
  now: number
): 'completed' | 'watching' | 'abandoned' {
  const finishedEpisode = isEpisodeComplete(progress);

  if (
    anime.episodeCount !== undefined &&
    progress.episodeNumber >= anime.episodeCount &&
    finishedEpisode
  ) {
    return 'completed';
  }

  // Barely started, and untouched for a month. Treated cautiously: this only
  // ever contributes a small negative, and one title cannot veto a genre.
  const fraction = progress.durationSeconds
    ? progress.positionSeconds / progress.durationSeconds
    : 1;
  const stale = now - progress.updatedAt > ABANDON_AGE_MS;

  if (stale && progress.episodeNumber <= ABANDON_EPISODE && fraction < ABANDON_PROGRESS) {
    return 'abandoned';
  }

  return 'watching';
}

/**
 * Everything the app legitimately knows about this viewer's anime taste.
 *
 * Only local data, only what the recommender uses: the saved list, and watch
 * progress the app already records to power Continue watching. Nothing extra
 * is collected to make recommendations work, and none of it leaves the device.
 *
 * Watch records win over saved entries for the same title, because having
 * actually watched something says more than having bookmarked it.
 */
async function collectSignals(
  savedIds: readonly string[],
  signal: AbortSignal | undefined,
  now: number
): Promise<TasteSignal[]> {
  const provider = getAnimeProvider();
  const watched = await library.listWatchProgress(HISTORY_LIMIT);

  const ids = new Set<string>([...savedIds, ...watched.map((entry) => entry.animeId)]);
  const progressById = new Map(watched.map((entry) => [entry.animeId, entry]));

  // Detail for these is usually already in the query cache from browsing them,
  // so this is cheap in practice. A title that fails to load is skipped rather
  // than failing the whole profile.
  const details = await Promise.all(
    [...ids].slice(0, HISTORY_LIMIT).map(async (id) => {
      const anime = await provider.getAnime(id, signal).catch(() => undefined);
      return anime ? ([id, anime] as const) : undefined;
    })
  );

  const signals: TasteSignal[] = [];

  for (const entry of details) {
    if (!entry) continue;
    const [id, anime] = entry;
    const progress = progressById.get(id);

    if (progress) {
      signals.push({
        anime,
        kind: classifyWatch(progress, anime, now),
        updatedAt: progress.updatedAt,
      });
    } else {
      signals.push({ anime, kind: 'saved', updatedAt: now });
    }
  }

  return signals;
}

/* -------------------------------------------------------------------------- */
/* Candidate generation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Pool candidates from several sections rather than one.
 *
 * Drawing only from `popular` would mean personalisation could never surface
 * anything outside the top fifty, so the pool spans popular, top rated,
 * trending and what is airing now. Every section here is already fetched and
 * cached for the home page rails, so in practice this costs nothing extra.
 *
 * Sections are requested independently and failures are dropped, so one dead
 * section degrades the pool instead of breaking the row.
 */
async function candidatePools(signal: AbortSignal | undefined): Promise<Anime[][]> {
  const provider = getAnimeProvider();
  const sections = ['trending', 'popular', 'topRated', 'airing'] as const;

  const pools = await Promise.all(
    sections.map((section) =>
      provider
        .getSection(section, { limit: POOL_SIZE, signal })
        .then((page) => page.items)
        .catch(() => [] as Anime[])
    )
  );

  return pools;
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                       */
/* -------------------------------------------------------------------------- */

export interface RecommendationResult {
  items: Anime[];
  /** One line for the UI saying where the row came from. */
  reason: string;
  /** False when this is the cold start blend rather than a computed profile. */
  personalised: boolean;
  /** Per title scoring, for tests and development inspection. Empty when cold. */
  scored: ScoredAnime[];
}

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
      const pool = await provider.getSection('popular', { limit: POOL_SIZE, signal });
      return rankBySimilarity(anime!, pool.items, { exclude, limit: 12 }).map(
        (entry) => entry.anime
      );
    },
    enabled: Boolean(anime),
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  });
}

/**
 * "Recommended for you".
 *
 * Always returns something. With enough history it is a scored, filtered and
 * diversified list built from the viewer's own activity; without it, it is an
 * interleaved blend of trending, popular, top rated and this season, labelled
 * honestly as such rather than dressed up as personal.
 *
 * The cache key is the library signature, so saving, finishing or dropping a
 * title refreshes the row and ordinary browsing does not. Within an hour the
 * whole thing is served from cache, so opening the home page repeatedly does
 * no work at all.
 */
export function useRecommendedForYou(limit = 20) {
  const saved = useLibraryEntries('anime');
  const savedIds = (saved.data ?? []).map((entry) => entry.id);
  const signature = savedIds.join(',');

  return useQuery({
    queryKey: recommendationKeys.forYou(signature),
    queryFn: async ({ signal }): Promise<RecommendationResult> => {
      const now = Date.now();
      const pools = await candidatePools(signal);
      const candidates = pools.flat();

      const signals = await collectSignals(savedIds, signal, now);
      const profile = buildTasteProfile(signals, now);

      if (isProfileUsable(profile)) {
        // Everything the viewer already has or already finished is excluded.
        // Titles in progress are not: continuing a series is useful.
        const exclude = new Set<string>(savedIds);
        for (const entry of signals) {
          if (entry.kind === 'completed' || entry.kind === 'abandoned') {
            exclude.add(entry.anime.id);
          }
        }

        const scored = rankByTaste(profile, candidates, { exclude, limit });

        if (scored.length > 0) {
          return {
            items: scored.map((entry) => entry.anime),
            reason: 'Based on what you have watched and saved',
            personalised: true,
            scored,
          };
        }
      }

      // Cold start, and the fallback for a profile that matched nothing. Same
      // path for both, because the honest answer is the same in both cases.
      return {
        items: interleave(pools, limit),
        reason: 'Trending, popular and highly rated right now',
        personalised: false,
        scored: [],
      };
    },
    enabled: saved.isSuccess,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  });
}
