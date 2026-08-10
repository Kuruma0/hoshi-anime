import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AiringCarousel } from '@/components/AiringCarousel';
import { AppHeader } from '@/components/AppHeader';
import { ContentRow } from '@/components/ContentRow';
import { ContinueRow } from '@/components/ContinueRow';
import { GenreRail } from '@/components/GenreRail';
import { SectionDivider } from '@/components/SectionDivider';
import {
  SECTION_LABEL,
  toRowItem,
  useAnimeGenres,
  useAnimeSection,
  useSupportsSection,
} from '@/data/anime';
import { useContinueWatching } from '@/data/library';
import { useRecommendedForYou } from '@/data/recommendations';
import { color, space } from '@/design/tokens';
import { routes } from '@/lib/routes';
import type { AnimeSection } from '@/providers/types';

/**
 * Anime home.
 *
 * The order is deliberate information architecture: anything already in
 * progress, then what is airing right now, then a Discover block for
 * everything else. The page answers "carry on where I was" before it answers
 * "show me something new".
 *
 * Discovery rails below Discover, in order.
 */
const DISCOVER_SECTIONS: AnimeSection[] = ['topRated', 'popular', 'upcoming'];

export default function AnimeHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const genres = useAnimeGenres();
  const continueWatching = useContinueWatching();
  const airing = useAnimeSection('airing');
  const supportsAiring = useSupportsSection('airing');
  const recommended = useRecommendedForYou(12);

  return (
    <View style={styles.screen}>
      <AppHeader
        context="Anime"
        actionLabel="Schedule"
        onAction={() => router.push(routes.schedule())}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Nothing in progress means no section at all, not an empty one. */}
        <ContinueRow
          title="Continue watching"
          items={(continueWatching.data ?? []).map((entry) => ({
            id: entry.animeId,
            title: entry.title,
            image: entry.image,
            position: `Episode ${entry.episodeNumber}`,
            fraction: entry.durationSeconds
              ? entry.positionSeconds / entry.durationSeconds
              : 0,
          }))}
          onSelect={(id) => router.push(routes.anime(id))}
        />

        {supportsAiring ? (
          <AiringCarousel
            items={airing.data?.items ?? []}
            isLoading={airing.isPending}
            error={airing.error}
            onRetry={() => void airing.refetch()}
            onSelect={(id) => router.push(routes.anime(id))}
          />
        ) : null}

        {/*
          Only appears once the viewer has saved something. With no history the
          section is absent rather than filled with trending under a personal
          heading, which would be a lie about where it came from.
        */}
        <ContentRow
          title="Recommended for you"
          items={(recommended.data ?? []).map(toRowItem)}
          onSelect={(id) => router.push(routes.anime(id))}
        />

        <SectionDivider title="Discover" />

        <GenreRail
          genres={genres.data ?? []}
          onSelect={(genre) => router.push(routes.genre('anime', genre))}
        />

        {DISCOVER_SECTIONS.map((section) => (
          <AnimeRail key={section} section={section} />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * One rail.
 *
 * Each section owns its own query, so a failing rail shows a retry in place
 * while every other rail on the screen still renders.
 */
function AnimeRail({ section }: { section: AnimeSection }) {
  const router = useRouter();
  const query = useAnimeSection(section);

  return (
    <ContentRow
      title={SECTION_LABEL[section]}
      items={(query.data?.items ?? []).map(toRowItem)}
      isLoading={query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      onSeeAll={
        query.data?.nextCursor
          ? () => router.push(routes.section('anime', section))
          : undefined
      }
      onSelect={(id) => router.push(routes.anime(id))}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { flexGrow: 1, paddingTop: space.xl },
});
