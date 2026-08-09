import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContentId, Image, MediaKind } from '@/domain/common';
import { library } from '@/library/storage';
import { isChapterComplete, isEpisodeComplete } from '@/library/types';
import type { ReadProgress, WatchProgress } from '@/library/types';
import { keys } from './keys';

/**
 * Library and progress hooks.
 *
 * Local storage is fast enough that these read on demand rather than mirroring
 * into a store. Mutations invalidate the whole `library` key because saving a
 * title affects the list, the detail page's saved flag, and the continue rails
 * at once; keeping those in sync by hand is how they drift.
 */

export function useLibraryEntries(kind: MediaKind) {
  return useQuery({
    queryKey: keys.library.entries(kind),
    queryFn: () => library.getEntries(kind),
    staleTime: 0,
  });
}

export function useIsSaved(id: ContentId | undefined) {
  return useQuery({
    queryKey: keys.library.saved(id ?? ''),
    queryFn: () => library.isSaved(id!),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

export function useToggleSaved() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: ContentId;
      kind: MediaKind;
      title: string;
      image?: Image;
    }) => {
      const saved = await library.isSaved(input.id);
      if (saved) await library.removeEntry(input.id);
      else await library.addEntry(input);
      return !saved;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.library.all });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Watch progress                                                      */
/* ------------------------------------------------------------------ */

export function useWatchProgress(animeId: ContentId | undefined) {
  return useQuery({
    queryKey: keys.library.watchProgress(animeId ?? ''),
    // `?? null`: the repository returns undefined when there is no progress,
    // but a query function resolving to undefined is an error in TanStack Query
    //, the query never settles and resume silently stops working.
    queryFn: async () => (await library.getWatchProgress(animeId!)) ?? null,
    enabled: Boolean(animeId),
    staleTime: 0,
  });
}

export function useSaveWatchProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (progress: Omit<WatchProgress, 'updatedAt'>) =>
      library.setWatchProgress(progress),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.library.all });
    },
  });
}

/**
 * Continue Watching.
 *
 * Finished episodes are filtered out so a completed show does not sit at the
 * top of the rail forever. Everything else (including a show watched to 90%) 
 * stays resumable.
 */
export function useContinueWatching(limit = 12) {
  return useQuery({
    queryKey: keys.library.continueWatching(),
    queryFn: async () => {
      const entries = await library.listWatchProgress(limit * 2);
      return entries.filter((entry) => !isEpisodeComplete(entry)).slice(0, limit);
    },
    staleTime: 0,
  });
}

/* ------------------------------------------------------------------ */
/* Read progress                                                       */
/* ------------------------------------------------------------------ */

export function useReadProgress(mangaId: ContentId | undefined) {
  return useQuery({
    queryKey: keys.library.readProgress(mangaId ?? ''),
    // See useWatchProgress: undefined is not a valid query result.
    queryFn: async () => (await library.getReadProgress(mangaId!)) ?? null,
    enabled: Boolean(mangaId),
    staleTime: 0,
  });
}

export function useSaveReadProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (progress: Omit<ReadProgress, 'updatedAt'>) => library.setReadProgress(progress),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.library.all });
    },
  });
}

export function useContinueReading(limit = 12) {
  return useQuery({
    queryKey: keys.library.continueReading(),
    queryFn: async () => {
      const entries = await library.listReadProgress(limit * 2);
      return entries.filter((entry) => !isChapterComplete(entry)).slice(0, limit);
    },
    staleTime: 0,
  });
}
