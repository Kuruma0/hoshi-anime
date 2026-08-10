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
 * The order is deliberate information architecture. Continue watching sits
 * above everything because resuming is the most common reason to open the app,
 * and it is the only section that is not discovery. Everything after it lives
 * under one Discover heading, so the page reads as "carry on" then "find
 * something", rather than as an undifferentiated stack of rails.
 *
 * Inside Discover the order narrows from browsing to specifics: genres to pick
 * a direction, what is airing now, then what suits you, then the evergreen
 * rails.
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

        <SectionDivider title="Discover" />

        <GenreRail
          genres={genres.data ?? []}
          onSelect={(genre) => router.push(routes.genre('anime', genre))}
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
          Never empty and never blocking: the engine falls back to a blend of
          trending, popular, top rated and this season when there is no history
          to personalise from, and the row renders its own loading state while
          the profile is built, so the rest of the page paints first.
        */}
        {/*
          Error is passed through rather than swallowed. Without it a failed
          recommendation query renders the rail's generic empty label, so a
          real outage is indistinguishable from having nothing to show, which
          is the state that hid the last bug for so long.
        */}
        <ContentRow
          title="Recommended for you"
          items={(recommended.data?.items ?? []).map(toRowItem)}
          caption={recommended.data?.reason}
          isLoading={recommended.isPending}
          error={recommended.error}
          onRetry={() => void recommended.refetch()}
          emptyLabel="Nothing to suggest while offline."
          onSelect={(id) => router.push(routes.anime(id))}
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
