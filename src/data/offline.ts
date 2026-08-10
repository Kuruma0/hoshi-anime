import {
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ContentId } from '@/domain/common';
import type { Chapter, Manga } from '@/domain/manga';
import { getSettings } from '@/lib/settings';
import {
  availableBytes,
  deleteAllDownloads,
  deleteChapter,
  deleteManga,
  downloadChapter,
  estimateBytes,
  getOfflineChapter,
  listOffline,
} from '@/offline/mangaDownloads';
import { groupByManga, totalBytes } from '@/offline/types';
import { getMangaProvider } from '@/providers/registry';

/**
 * Offline hooks.
 *
 * Downloads are their own storage, deliberately not part of the query cache, so
 * these read through a small set of keys that nothing else invalidates.
 */

const offlineKeys = {
  all: ['offline'] as const,
  chapters: () => ['offline', 'chapters'] as const,
  chapter: (id: string) => ['offline', 'chapter', id] as const,
};

/** Everything downloaded, grouped by manga. */
export function useOfflineLibrary() {
  return useQuery({
    queryKey: offlineKeys.chapters(),
    queryFn: async () => {
      const chapters = await listOffline();
      return {
        manga: groupByManga(chapters),
        bytes: totalBytes(chapters),
        count: chapters.length,
      };
    },
    staleTime: 0,
  });
}

/** Whether one chapter is readable without a network. */
export function useOfflineChapter(chapterId: string | undefined) {
  return useQuery({
    queryKey: offlineKeys.chapter(chapterId ?? ''),
    // `?? null` because a query function must never resolve to undefined.
    queryFn: async () => (await getOfflineChapter(chapterId!)) ?? null,
    enabled: Boolean(chapterId),
    staleTime: 0,
  });
}

export interface DownloadInput {
  manga: Manga;
  chapter: Chapter;
}

/**
 * Download a chapter for offline reading.
 *
 * Resolves the pages first so the size is known, then refuses outright if the
 * estimate will not fit. Starting a download that is guaranteed to fail part
 * way through is worse than saying no.
 */
export function useDownloadChapter() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<Record<string, number>>({});

  const mutation = useMutation({
    mutationFn: async ({ manga, chapter }: DownloadInput) => {
      await assertConnectionAllowsDownload();

      const resolved = await getMangaProvider().getChapterPages(chapter.id);
      const pageUrls = resolved.pages;

      const estimate = estimateBytes(pageUrls.length);
      const free = availableBytes();
      if (free > 0 && estimate > free) {
        throw new Error('Not enough storage available.');
      }

      return downloadChapter({
        manga,
        chapter,
        pageUrls,
        onProgress: (value) =>
          setProgress((current) => ({ ...current, [chapter.id]: value })),
      });
    },
    onSettled: (_data, _error, variables) => {
      setProgress((current) => {
        const next = { ...current };
        delete next[variables.chapter.id];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: offlineKeys.all });
    },
  });

  return { ...mutation, progress };
}

/**
 * Refuse a download the viewer's own settings say should not happen.
 *
 * Checked here rather than in the download engine so the engine stays a pure
 * file operation, and checked at the moment of the tap rather than at render
 * time, because the connection can change between the two.
 */
async function assertConnectionAllowsDownload(): Promise<void> {
  if (!getSettings().downloadOverWifiOnly) return;

  let state: Network.NetworkState;
  try {
    state = await Network.getNetworkStateAsync();
  } catch {
    // Unknown connection type. Allowing it is the lesser failure: refusing
    // would make downloads impossible on any device that cannot report.
    return;
  }

  if (state.type === Network.NetworkStateType.CELLULAR) {
    throw new Error('Downloads are set to Wi-Fi only. Change this in Settings.');
  }
}

export function useDeleteOfflineChapter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (chapterId: string) => deleteChapter(chapterId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: offlineKeys.all }),
  });
}

export function useDeleteOfflineManga() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mangaId: ContentId) => deleteManga(mangaId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: offlineKeys.all }),
  });
}

export function useDeleteAllDownloads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteAllDownloads(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: offlineKeys.all }),
  });
}

/**
 * Feed the device's connection state into TanStack Query (§13).
 *
 * Mounted once, at the root. Query treats an offline manager as a reason to
 * pause fetches rather than retry them, so this is what actually stops the app
 * reissuing requests that cannot succeed; doing it per screen would leave every
 * screen that forgot still hammering the network. Cached data keeps rendering
 * throughout, and paused queries resume on their own when the connection
 * returns.
 */
export function useOnlineManagerBridge(): void {
  useEffect(() => {
    let active = true;

    const apply = (state: { isInternetReachable?: boolean | null; isConnected?: boolean | null }) => {
      // Assume online when the platform will not say: a false offline reading
      // would pause every query and make a working app look broken.
      onlineManager.setOnline(state.isInternetReachable ?? state.isConnected ?? true);
    };

    void Network.getNetworkStateAsync()
      .then((state) => {
        if (active) apply(state);
      })
      .catch(() => onlineManager.setOnline(true));

    const subscription = Network.addNetworkStateListener(apply);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
}

/**
 * Whether the device currently has a usable connection.
 *
 * Reads the same value Query itself acts on, so what a screen tells the viewer
 * and what the data layer is doing can never disagree.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true
  );
}

/** Free space, for the storage line in the offline library. */
export function useAvailableStorage(): number {
  return availableBytes();
}
