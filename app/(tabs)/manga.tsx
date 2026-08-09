import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { ContentRow } from '@/components/ContentRow';
import { ContinueRow } from '@/components/ContinueRow';
import { GenreRail } from '@/components/GenreRail';
import { useContinueReading } from '@/data/library';
import {
  SECTION_LABEL,
  toRowItem,
  useMangaGenres,
  useMangaSection,
  useMangaSections,
} from '@/data/manga';
import { color, space } from '@/design/tokens';
import { routes } from '@/lib/routes';
import type { MangaSection } from '@/providers/types';

/**
 * Manga home.
 *
 * Same shape as the anime page — in-progress first, then genres, then discovery
 * — but the lead rail is recently-updated rather than trending, because the
 * question a reader returns with is "what has new chapters".
 */
export default function MangaHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const sections = useMangaSections();
  const genres = useMangaGenres();
  const continueReading = useContinueReading();

  const [lead, ...rest] = sections;

  return (
    <View style={styles.screen}>
      <AppHeader context="Manga" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <ContinueRow
          title="Continue reading"
          items={(continueReading.data ?? []).map((entry) => ({
            id: entry.mangaId,
            title: entry.title,
            image: entry.image,
            position: entry.chapterNumber ? `Chapter ${entry.chapterNumber}` : 'In progress',
            fraction: entry.pageCount > 0 ? (entry.page + 1) / entry.pageCount : 0,
          }))}
          onSelect={(id) => router.push(routes.manga(id))}
        />

        {lead ? <MangaRail section={lead} /> : null}

        <GenreRail
          genres={genres.data ?? []}
          onSelect={(genre) => router.push(routes.genre('manga', genre))}
        />

        {rest.map((section) => (
          <MangaRail key={section} section={section} />
        ))}
      </ScrollView>
    </View>
  );
}

function MangaRail({ section }: { section: MangaSection }) {
  const router = useRouter();
  const query = useMangaSection(section);

  return (
    <ContentRow
      title={SECTION_LABEL[section]}
      items={(query.data?.items ?? []).map(toRowItem)}
      isLoading={query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      onSeeAll={
        query.data?.nextCursor
          ? () => router.push(routes.section('manga', section))
          : undefined
      }
      onSelect={(id) => router.push(routes.manga(id))}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { flexGrow: 1, paddingTop: space.xl },
});
