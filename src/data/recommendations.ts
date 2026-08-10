import { useQuery } from '@tanstack/react-query';
import type { Anime } from '@/domain/anime';
import type { WatchProgress } from '@/library/types';
import {
  buildTasteProfile,
  classifyWatch,
  interleave,
  isProfileUsable,
  rankBySimilarity,
  rankByTaste,
  type ScoredAnime,
  type TasteSignal,
} from '@/lib/recommend';
import { getAnimeProvider } from '@/providers/registry';
import { useLibraryEntries, useWatchHistory } from './library';

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

const recommendationKeys = {
  forTitle: (id: string) => ['recommendations', 'title', id] as const,
  forYou: (signature: string) => ['recommendations', 'you', signature] as const,
};

/* -------------------------------------------------------------------------- */
/* Signals                                                                     */
/* -------------------------------------------------------------------------- */

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
  watched: readonly WatchProgress[],
  signal: AbortSignal | undefined,
  now: number
): Promise<TasteSignal[]> {
  const provider = getAnimeProvider();

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
  /** Stage-by-stage counts. Development only; see `logDiagnostics`. */
  diagnostics: RecommendationDiagnostics;
}

/** Where titles went at each stage of the pipeline. */
export interface RecommendationDiagnostics {
  savedCount: number;
  watchRecords: number;
  signals: number;
  signalsByKind: Record<string, number>;
  profileGenres: number;
  profileUsable: boolean;
  candidates: number;
  excluded: number;
  ranked: number;
  returned: number;
  path: 'personalised' | 'fallback';
}

/**
 * Print the pipeline's stage counts in development.
 *
 * Guarded by `__DEV__` so nothing reaches a release build. This exists because
 * "the row is empty" has at least six possible causes and guessing between them
 * from the outside is how the last bug survived: no history read, no candidates,
 * everything filtered, or a UI state problem all look identical on screen.
 */
function logDiagnostics(diagnostics: RecommendationDiagnostics): void {
  if (!__DEV__) return;

  console.log(
    [
      `[recommendations] ${diagnostics.path}`,
      `  saved: ${diagnostics.savedCount}`,
      `  watch records: ${diagnostics.watchRecords}`,
      `  signals: ${diagnostics.signals} ${JSON.stringify(diagnostics.signalsByKind)}`,
      `  profile genres: ${diagnostics.profileGenres} (usable: ${diagnostics.profileUsable})`,
      `  candidates: ${diagnostics.candidates}`,
      `  excluded: ${diagnostics.excluded}`,
      `  ranked: ${diagnostics.ranked}`,
      `  returned: ${diagnostics.returned}`,
    ].join('\n')
  );
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
  const history = useWatchHistory(HISTORY_LIMIT);

  const savedIds = (saved.data ?? []).map((entry) => entry.id);
  const watched = history.data ?? [];

  /*
    The cache key has to cover watch history, not just the saved list.
    Previously it was the saved ids alone, which meant that for anyone who
    watches without tapping Add to list the signature was permanently the empty
    string: watching more anime changed nothing, and the row stayed on whatever
    was cached until the hour expired. Episode numbers are included so getting
    further into a series counts as a change too.
  */
  const signature = [
    ...savedIds,
    ...watched.map((entry) => `${entry.animeId}@${entry.episodeNumber}`),
  ]
    .sort()
    .join(',');

  return useQuery({
    queryKey: recommendationKeys.forYou(signature),
    queryFn: async ({ signal }): Promise<RecommendationResult> => {
      const now = Date.now();
      const pools = await candidatePools(signal);
      const candidates = pools.flat();

      const signals = await collectSignals(savedIds, watched, signal, now);
      const profile = buildTasteProfile(signals, now);

      const signalsByKind: Record<string, number> = {};
      for (const entry of signals) {
        signalsByKind[entry.kind] = (signalsByKind[entry.kind] ?? 0) + 1;
      }

      const diagnostics: RecommendationDiagnostics = {
        savedCount: savedIds.length,
        watchRecords: watched.length,
        signals: signals.length,
        signalsByKind,
        profileGenres: profile.genres.size,
        profileUsable: isProfileUsable(profile),
        candidates: candidates.length,
        excluded: 0,
        ranked: 0,
        returned: 0,
        path: 'fallback',
      };

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

        diagnostics.excluded = exclude.size;
        diagnostics.ranked = scored.length;

        if (scored.length > 0) {
          diagnostics.path = 'personalised';
          diagnostics.returned = scored.length;
          logDiagnostics(diagnostics);

          return {
            items: scored.map((entry) => entry.anime),
            reason: 'Based on what you have watched and saved',
            personalised: true,
            scored,
            diagnostics,
          };
        }
      }

      // Cold start, and the fallback for a profile that matched nothing. Same
      // path for both, because the honest answer is the same in both cases.
      const items = interleave(pools, limit);
      diagnostics.returned = items.length;
      logDiagnostics(diagnostics);

      return {
        items,
        reason: 'Trending, popular and highly rated right now',
        personalised: false,
        scored: [],
        diagnostics,
      };
    },
    // Both feed the profile, so both must have loaded or the first run would
    // build a profile from half the history and cache the result.
    enabled: saved.isSuccess && history.isSuccess,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  });
}
