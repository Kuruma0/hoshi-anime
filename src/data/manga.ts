import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Manga } from '@/domain/manga';
import { useSettings } from '@/lib/settings';
import { getMangaProvider } from '@/providers/registry';
import type { MangaSection } from '@/providers/types';
import { keys } from './keys';

/**
 * Manga data hooks. Same contract as data/anime.ts, screens see domain models
 * and nothing else.
 */

export function useMangaSections(): MangaSection[] {
  const provider = getMangaProvider();
  const preferred: MangaSection[] = [
    'trending',
    'popular',
    'recentlyUpdated',
    'topRated',
    'recentlyAdded',
  ];
  // MangaDex publishes no trending metric, so 'trending' silently drops out
  // here rather than being faked from follower counts.
  return preferred.filter((section) => provider.supportedSections.includes(section));
}

export const SECTION_LABEL: Record<MangaSection, string> = {
  trending: 'Trending now',
  popular: 'Most followed',
  recentlyUpdated: 'Recently updated',
  topRated: 'Highest rated',
  recentlyAdded: 'Newly added',
};

export function isMangaSection(value: string): value is MangaSection {
  return value in SECTION_LABEL;
}

export function useMangaSection(section: MangaSection, limit = 20) {
  const contentRatings = useSettings((state) => state.contentRatings);

  return useQuery({
    // Ratings are part of the key: changing the filter must not serve the
    // previous filter's cached results.
    queryKey: [...keys.manga.section(section), contentRatings.join(',')],
    queryFn: ({ signal }) => getMangaProvider().getSection(section, { limit, signal }),
  });
}

/** Paginated form of a section, for the dedicated "See more" browse page. */
export function useMangaSectionPaged(section: MangaSection | undefined) {
  const contentRatings = useSettings((state) => state.contentRatings);

  return useInfiniteQuery({
    queryKey: [...keys.manga.section(section ?? 'popular'), 'paged', contentRatings.join(',')],
    queryFn: ({ pageParam, signal }) =>
      getMangaProvider().getSection(section!, { cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(section),
  });
}

export function useManga(id: string | undefined) {
  return useQuery({
    queryKey: keys.manga.detail(id ?? ''),
    queryFn: ({ signal }) => getMangaProvider().getManga(id!, signal),
    enabled: Boolean(id),
  });
}

export function useChapters(id: string | undefined) {
  const language = useSettings((state) => state.chapterLanguage);

  return useInfiniteQuery({
    queryKey: keys.manga.chapters(id ?? '', language),
    queryFn: ({ pageParam, signal }) =>
      getMangaProvider().getChapters(id!, { language, cursor: pageParam, limit: 100, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(id),
  });
}

/**
 * Page images for one chapter.
 *
 * `staleTime` is short and `gcTime` shorter because MangaDex @Home hosts are
 * ephemeral; caching these for hours would serve URLs that 404 mid-read.
 */
export function useChapterPages(chapterId: string | undefined) {
  return useQuery({
    queryKey: keys.manga.pages(chapterId ?? ''),
    queryFn: ({ signal }) => getMangaProvider().getChapterPages(chapterId!, signal),
    enabled: Boolean(chapterId),
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useMangaGenres() {
  return useQuery({
    queryKey: keys.manga.genres(),
    queryFn: ({ signal }) => getMangaProvider().getGenres(signal),
    staleTime: Infinity,
  });
}

export function useMangaByGenre(genre: string | undefined) {
  return useInfiniteQuery({
    queryKey: keys.manga.byGenre(genre ?? ''),
    queryFn: ({ pageParam, signal }) =>
      getMangaProvider().getByGenre(genre!, { cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(genre),
  });
}

export function useMangaSearch(query: string) {
  const trimmed = query.trim();

  return useInfiniteQuery({
    queryKey: keys.manga.search(trimmed),
    queryFn: ({ pageParam, signal }) =>
      getMangaProvider().search(trimmed, { cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: trimmed.length > 1,
    staleTime: 10 * 60 * 1000,
  });
}

export function toRowItem(manga: Manga) {
  return {
    id: manga.id,
    title: manga.title,
    image: manga.cover,
    caption: captionFor(manga),
  };
}

function captionFor(manga: Manga): string | undefined {
  if (manga.status === 'ongoing') return 'Ongoing';
  if (manga.status === 'completed') {
    return manga.lastChapter ? `${manga.lastChapter} chapters` : 'Complete';
  }
  if (manga.status === 'hiatus') return 'On hiatus';
  return manga.year ? String(manga.year) : undefined;
}
