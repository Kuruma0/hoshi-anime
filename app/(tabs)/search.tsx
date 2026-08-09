import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { PosterGrid } from '@/components/PosterGrid';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchBar } from '@/components/SearchBar';
import { Segmented } from '@/components/Segmented';
import { EmptyState } from '@/components/StateViews';
import { toRowItem as toAnimeItem, useAnimeSearch } from '@/data/anime';
import { toRowItem as toMangaItem, useMangaSearch } from '@/data/manga';
import { color, space } from '@/design/tokens';
import { routes } from '@/lib/routes';
import { useDebounced } from '@/lib/useDebounced';

type Mode = 'anime' | 'manga';

const MODES = [
  { value: 'anime' as const, label: 'Anime' },
  { value: 'manga' as const, label: 'Manga' },
];

/**
 * Unified search.
 *
 * One field, one segmented switch. Both providers already return every title
 * variant they know, and lib/titleMatch re-ranks locally, so "Shingeki no
 * Kyojin", "Attack on Titan" and "進撃の巨人" all resolve to the same entry (§14).
 */
export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('anime');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query);

  // Both hooks stay mounted so switching modes shows cached results instantly
  // rather than re-querying; the inactive one is disabled by its own `enabled`.
  const anime = useAnimeSearch(mode === 'anime' ? debouncedQuery : '');
  const manga = useMangaSearch(mode === 'manga' ? debouncedQuery : '');
  const active = mode === 'anime' ? anime : manga;

  const items =
    mode === 'anime'
      ? (anime.data?.pages.flatMap((page) => page.items) ?? []).map(toAnimeItem)
      : (manga.data?.pages.flatMap((page) => page.items) ?? []).map(toMangaItem);

  const hasQuery = debouncedQuery.trim().length > 1;
  // `isFetching` rather than `isPending`: a disabled query is permanently
  // pending, which would otherwise render a spinner over the prompt state.
  const isSearching = hasQuery && active.isFetching && items.length === 0;

  return (
    <View style={styles.screen}>
      <AppHeader context="Search" />

      <ScreenHeader title="Search" />

      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder={mode === 'anime' ? 'Search anime' : 'Search manga'}
      />

      <View style={styles.modes}>
        <Segmented
          options={MODES}
          value={mode}
          onChange={setMode}
          accessibilityLabel="Search in"
        />
      </View>

      {!hasQuery ? (
        <EmptyState
          title="Find something to watch or read."
          detail="Search by English, Japanese, or romanised title."
        />
      ) : (
        <PosterGrid
          items={items}
          isLoading={isSearching}
          error={active.error}
          onRetry={() => void active.refetch()}
          onSelect={(id) => router.push(routes.detail(mode, id))}
          onEndReached={() => {
            if (active.hasNextPage && !active.isFetchingNextPage) {
              void active.fetchNextPage();
            }
          }}
          isFetchingMore={active.isFetchingNextPage}
          emptyTitle={`No ${mode} found.`}
          emptyDetail={`Nothing matched “${debouncedQuery.trim()}”.`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  modes: { marginTop: space.lg, marginBottom: space.lg },
});
