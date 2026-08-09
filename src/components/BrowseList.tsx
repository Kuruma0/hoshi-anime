import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppHeader } from './AppHeader';
import { PosterGrid, type GridItem } from './PosterGrid';
import { ScreenHeader } from './ScreenHeader';
import { SearchBar } from './SearchBar';
import { color, space } from '@/design/tokens';
import { routes } from '@/lib/routes';
import { normalizeTitle } from '@/lib/titleMatch';

export interface BrowseListProps {
  kind: 'anime' | 'manga';
  title: string;
  items: GridItem[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

/**
 * The page behind every "See more".
 *
 * Shared by section and genre browsing because the two differ only in which
 * query feeds them; duplicating this screen per filter type would mean
 * maintaining the same grid, filter and pagination logic twice. Callers map
 * their own domain objects to grid items, so this component stays unaware of
 * whether it is showing anime or manga.
 *
 * The filter narrows what has already been loaded rather than issuing a request
 * per keystroke: the provider's own search covers a different corpus
 * (everything, not this section), so querying it here would answer a different
 * question than the one asked; and spend rate limit doing it.
 */
export function BrowseList({
  kind,
  title,
  items,
  isPending,
  error,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: BrowseListProps) {
  const router = useRouter();
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const query = normalizeTitle(filter);
    if (!query) return items;
    // Same normalisation as search, so accents and punctuation behave the same
    // way here as they do everywhere else.
    return items.filter((item) => normalizeTitle(item.title).includes(query));
  }, [items, filter]);

  return (
    <View style={styles.screen}>
      <AppHeader context={title} />

      <ScreenHeader title={title} />

      <View style={styles.filter}>
        <SearchBar value={filter} onChange={setFilter} placeholder={`Filter ${title.toLowerCase()}`} />
      </View>

      <PosterGrid
        items={visible}
        isLoading={isPending}
        error={error}
        onRetry={onRetry}
        onSelect={(id) => router.push(routes.detail(kind, id))}
        onEndReached={() => {
          // Filtering only narrows what is loaded, so keep paging regardless.
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        isFetchingMore={isFetchingNextPage}
        emptyTitle={filter.trim() ? 'Nothing matches that filter.' : `No ${kind} found.`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  filter: { marginBottom: space.lg },
});
