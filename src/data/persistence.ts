import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

/**
 * Cross-launch metadata cache (§25).
 *
 * Without this, opening the app with no connection produces a screen of error
 * rails. With it, the last-seen home screen renders immediately from disk and
 * revalidates when the network returns — artwork is already on disk courtesy of
 * expo-image, so the result is a usable screen rather than a blank one.
 *
 * This is metadata only. It deliberately does not make the app offline-first:
 * playback and page images still need a connection, and pretending otherwise
 * would be worse than being clear about it.
 */
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'hoshi.query-cache.v1',
  // Writes are batched rather than fired per query resolution, so a home screen
  // settling six rails does not mean six serialisations of the whole cache.
  throttleTime: 2_000,
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: 24 * 60 * 60 * 1000,
  // Bump when a normalizer changes shape, so a stale cache is discarded rather
  // than rehydrated into UI that no longer understands it.
  buster: 'v1',
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      if (query.state.status !== 'success') return false;

      const [domain, kind] = query.queryKey as string[];

      // Never persist: MangaDex @Home page hosts and resolved playback URLs are
      // short-lived, and rehydrating an expired one produces a broken reader or
      // a dead player instead of a clean refetch.
      if (kind === 'pages' || kind === 'playback') return false;
      // The library reads from its own storage already; persisting it twice
      // just creates two sources of truth that can disagree.
      if (domain === 'library') return false;

      return true;
    },
  },
};
