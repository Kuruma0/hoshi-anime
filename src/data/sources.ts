import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Manga } from '@/domain/manga';
import { getSourceRatings, rateSource } from '@/library/sourceRatings';
import { useSettings } from '@/lib/settings';
import { findBestMatch } from '@/lib/titleMatch';
import { implementedSources, type ResolvedSource } from '@/providers/mangaSources';
import { getMangaProviders } from '@/providers/registry';

/**
 * Manga source resolution.
 *
 * Every figure shown in the picker comes from the provider: chapter counts are
 * the totals the API reports for the selected language, and languages come from
 * the title's own metadata. Nothing is hard-coded, and a source that cannot
 * answer is marked unavailable rather than being given a plausible number.
 */

/**
 * One query per source, so a slow or failing source cannot hold up the others
 * (§34). A failure resolves to `unavailable` rather than rejecting.
 */
export function useMangaSources(manga: Manga | undefined) {
  const language = useSettings((state) => state.chapterLanguage);
  const sources = implementedSources(getMangaProviders());

  return useQueries({
    queries: sources.map(({ descriptor, provider }) => ({
      queryKey: ['sources', descriptor.id, manga?.id ?? '', language],
      enabled: Boolean(manga),
      staleTime: 10 * 60 * 1000,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<ResolvedSource> => {
        const base = { id: descriptor.id, name: descriptor.name };

        try {
          // The manga's own provider needs no lookup; others must be matched.
          const mangaId =
            manga!.id.startsWith(`${provider.id}:`)
              ? manga!.id
              : await resolveByTitle(provider, manga!, signal);

          if (!mangaId) return { ...base, unavailable: true };

          // limit: 1; we want the reported total, not the chapters themselves.
          const chapters = await provider.getChapters(mangaId, {
            language,
            limit: 1,
            signal,
          });

          return {
            ...base,
            mangaId,
            chapterCount: chapters.total,
            language,
          };
        } catch {
          return { ...base, unavailable: true };
        }
      },
    })),
    combine: (results) => ({
      sources: results
        .map((result) => result.data)
        .filter((source): source is ResolvedSource => source !== undefined),
      isPending: results.some((result) => result.isPending),
    }),
  });
}

/**
 * Find the same work in another provider's catalogue.
 *
 * Requires a confident title match; returning nothing marks the source
 * unavailable, which is preferable to opening an unrelated series.
 */
async function resolveByTitle(
  provider: { search: (query: string, page?: { limit?: number; signal?: AbortSignal }) => Promise<{ items: Manga[] }> },
  manga: Manga,
  signal: AbortSignal
): Promise<string | undefined> {
  const results = await provider.search(manga.title, { limit: 12, signal });
  const match = findBestMatch(
    {
      title: manga.title,
      originalTitle: manga.originalTitle,
      alternativeTitles: manga.alternativeTitles,
    },
    results.items
  );
  return match?.id;
}

/* ------------------------------------------------------------------ */
/* Ratings                                                             */
/* ------------------------------------------------------------------ */

const RATINGS_KEY = ['sources', 'ratings'] as const;

/** This device's source ratings. There is no account system, so no global average. */
export function useSourceRatings() {
  return useQuery({
    queryKey: RATINGS_KEY,
    queryFn: getSourceRatings,
    staleTime: 0,
  });
}

export function useRateSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceId, stars }: { sourceId: string; stars: number }) =>
      rateSource(sourceId, stars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RATINGS_KEY });
    },
  });
}
