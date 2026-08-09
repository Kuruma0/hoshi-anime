import { Stack, useLocalSearchParams } from 'expo-router';
import { BrowseList } from '@/components/BrowseList';
import {
  isAnimeSection,
  SECTION_LABEL as ANIME_LABEL,
  toRowItem as toAnimeItem,
  useAnimeSectionPaged,
} from '@/data/anime';
import {
  isMangaSection,
  SECTION_LABEL as MANGA_LABEL,
  toRowItem as toMangaItem,
  useMangaSectionPaged,
} from '@/data/manga';

/**
 * The destination for "See more" on a discovery rail.
 *
 * The section name is validated against what the provider supports before being
 * used, so a stale or hand-typed link produces an empty state rather than a
 * request for a section that does not exist.
 */
export default function BrowseSectionScreen() {
  const { kind, value } = useLocalSearchParams<{ kind: string; value: string }>();

  const isAnime = kind === 'anime';
  const raw = decodeURIComponent(value ?? '');

  const animeSection = isAnime && isAnimeSection(raw) ? raw : undefined;
  const mangaSection = !isAnime && isMangaSection(raw) ? raw : undefined;

  const anime = useAnimeSectionPaged(animeSection);
  const manga = useMangaSectionPaged(mangaSection);
  const active = isAnime ? anime : manga;

  const title = animeSection
    ? ANIME_LABEL[animeSection]
    : mangaSection
      ? MANGA_LABEL[mangaSection]
      : 'Browse';

  const items = isAnime
    ? (anime.data?.pages.flatMap((page) => page.items) ?? []).map(toAnimeItem)
    : (manga.data?.pages.flatMap((page) => page.items) ?? []).map(toMangaItem);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <BrowseList
        kind={isAnime ? 'anime' : 'manga'}
        title={title}
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
