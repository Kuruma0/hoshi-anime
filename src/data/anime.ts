import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Anime } from '@/domain/anime';
import { localWeekRange } from '@/lib/schedule';
import { getAnimeProvider, getStreamProvider } from '@/providers/registry';
import type { AnimeSection } from '@/providers/types';
import { keys } from './keys';

/**
 * Anime data hooks.
 *
 * Screens import only from this file. Nothing here leaks a provider type, so
 * swapping AniList for another metadata source changes registry.ts and nothing
 * that a screen can see.
 */

/**
 * The rail that leads the anime page.
 *
 * Currently-airing sorted by trend answers "what is everyone watching right
 * now", which is the question a returning viewer actually has.
 */
export const LEAD_SECTION: AnimeSection = 'airing';

/**
 * Sections below the genre rail, in display order.
 *
 * Filtering against the provider's own declaration is what keeps the UI from
 * advertising a rail the data source cannot back.
 */
export function useAnimeSections(): AnimeSection[] {
  const provider = getAnimeProvider();
  const preferred: AnimeSection[] = [
    'topRated',
    'trending',
    'popular',
    'upcoming',
    'recentlyAdded',
  ];
  return preferred.filter((section) => provider.supportedSections.includes(section));
}

export function useSupportsSection(section: AnimeSection): boolean {
  return getAnimeProvider().supportedSections.includes(section);
}

export const SECTION_LABEL: Record<AnimeSection, string> = {
  trending: 'Trending now',
  airing: 'Trending currently airing',
  popular: 'Most popular',
  topRated: 'Highest rated',
  upcoming: 'Coming soon',
  recentlyAdded: 'Recently added',
};

export function isAnimeSection(value: string): value is AnimeSection {
  return value in SECTION_LABEL;
}

export function useAnimeSection(section: AnimeSection, limit = 20) {
  return useQuery({
    queryKey: keys.anime.section(section),
    queryFn: ({ signal }) => getAnimeProvider().getSection(section, { limit, signal }),
  });
}

/** Paginated form of a section, for the dedicated "See more" browse page. */
export function useAnimeSectionPaged(section: AnimeSection | undefined) {
  return useInfiniteQuery({
    queryKey: [...keys.anime.section(section ?? 'trending'), 'paged'],
    queryFn: ({ pageParam, signal }) =>
      getAnimeProvider().getSection(section!, { cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(section),
  });
}

export function useAnime(id: string | undefined) {
  return useQuery({
    queryKey: keys.anime.detail(id ?? ''),
    queryFn: ({ signal }) => getAnimeProvider().getAnime(id!, signal),
    enabled: Boolean(id),
  });
}

export function useAnimeEpisodes(id: string | undefined) {
  return useQuery({
    queryKey: keys.anime.episodes(id ?? ''),
    queryFn: ({ signal }) => getAnimeProvider().getEpisodes(id!, signal),
    enabled: Boolean(id),
  });
}

export function useAnimeGenres() {
  return useQuery({
    queryKey: keys.anime.genres(),
    queryFn: ({ signal }) => getAnimeProvider().getGenres(signal),
    // Genres are a fixed vocabulary; refetching them is wasted budget.
    staleTime: Infinity,
  });
}

export function useAnimeByGenre(genre: string | undefined) {
  return useInfiniteQuery({
    queryKey: keys.anime.byGenre(genre ?? ''),
    queryFn: ({ pageParam, signal }) =>
      getAnimeProvider().getByGenre(genre!, { cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(genre),
  });
}

/**
 * Search.
 *
 * `enabled` gates on a trimmed query so clearing the field cancels in flight
 * work instead of firing a request for the empty string. Debouncing happens in
 * the search screen; this hook reacts to an already-settled term.
 */
export function useAnimeSearch(query: string) {
  const trimmed = query.trim();

  return useInfiniteQuery({
    queryKey: keys.anime.search(trimmed),
    queryFn: ({ pageParam, signal }) =>
      getAnimeProvider().search(trimmed, { cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: trimmed.length > 1,
    staleTime: 10 * 60 * 1000,
  });
}

export function useAnimeRecommendations(id: string | undefined) {
  const provider = getAnimeProvider();

  return useQuery({
    queryKey: keys.anime.recommendations(id ?? ''),
    queryFn: ({ signal }) => provider.getRecommendations!(id!, signal),
    enabled: Boolean(id) && provider.supportsRecommendations,
  });
}

/**
 * The weekly release schedule.
 *
 * The UTC window is derived from the device's local week here, so the provider
 * is never asked to reason about timezones; it just answers a range query.
 */
export function useSchedule() {
  const provider = getAnimeProvider();
  const { start, end } = localWeekRange();

  return useQuery({
    queryKey: keys.anime.schedule(start, end),
    queryFn: ({ signal }) => provider.getSchedule!(start, end, signal),
    enabled: provider.supportsSchedule,
    // Airing times shift rarely; an hour is well inside useful freshness.
    staleTime: 60 * 60 * 1000,
  });
}

/** Whether any playback source is usable right now. */
export function useHasStreamSource(): boolean {
  return getStreamProvider().isAvailable();
}

/** Rail entry shape. Keeps browse surfaces to artwork, title and one line. */
export function toRowItem(anime: Anime) {
  return {
    id: anime.id,
    title: anime.title,
    image: anime.artwork,
    caption: captionFor(anime),
  };
}

function captionFor(anime: Anime): string | undefined {
  if (anime.status === 'airing' && anime.nextEpisode) {
    return `Ep ${anime.nextEpisode.number - 1} out`;
  }
  if (anime.status === 'upcoming') return anime.year ? `${anime.year}` : 'Upcoming';
  if (anime.episodeCount) {
    return `${anime.episodeCount} episode${anime.episodeCount === 1 ? '' : 's'}`;
  }
  return anime.year ? String(anime.year) : undefined;
}
