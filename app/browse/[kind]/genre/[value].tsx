import { Stack, useLocalSearchParams } from 'expo-router';
import { BrowseList } from '@/components/BrowseList';
import { toRowItem as toAnimeItem, useAnimeByGenre } from '@/data/anime';
import { toRowItem as toMangaItem, useMangaByGenre } from '@/data/manga';

/** Genre browsing. Rendering lives in BrowseList; this route only picks the query. */
export default function BrowseGenreScreen() {
  const { kind, value } = useLocalSearchParams<{ kind: string; value: string }>();

  const isAnime = kind === 'anime';
  const genre = decodeURIComponent(value ?? '');

  const anime = useAnimeByGenre(isAnime ? genre : undefined);
  const manga = useMangaByGenre(isAnime ? undefined : genre);
  const active = isAnime ? anime : manga;

  // Mapped here rather than inside BrowseList so the shared screen never has to
  // know which domain it is rendering.
  const items = isAnime
    ? (anime.data?.pages.flatMap((page) => page.items) ?? []).map(toAnimeItem)
    : (manga.data?.pages.flatMap((page) => page.items) ?? []).map(toMangaItem);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <BrowseList
        kind={isAnime ? 'anime' : 'manga'}
        title={genre}
        items={items}
        isPending={active.isPending}
        error={active.error}
        onRetry={() => void active.refetch()}
        hasNextPage={Boolean(active.hasNextPage)}
        isFetchingNextPage={active.isFetchingNextPage}
        fetchNextPage={() => void active.fetchNextPage()}
      />
    </>
  );
}
