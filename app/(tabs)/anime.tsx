import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { ContentRow } from '@/components/ContentRow';
import { ContinueRow } from '@/components/ContinueRow';
import { GenreRail } from '@/components/GenreRail';
import { SectionHeader } from '@/components/SectionHeader';
import {
  LEAD_SECTION,
  SECTION_LABEL,
  toRowItem,
  useAnimeGenres,
  useAnimeSection,
  useAnimeSections,
  useSupportsSection,
} from '@/data/anime';
import { useContinueWatching } from '@/data/library';
import { Text } from '@/design/Text';
import { color, gutter, hairline, sectionGap, space, touchTarget } from '@/design/tokens';
import { routes } from '@/lib/routes';
import type { AnimeSection } from '@/providers/types';

/**
 * Anime home.
 *
 * Ordering is deliberate: anything already in progress comes first, then what
 * is airing now, then genres. Discovery rails follow. The page answers "carry
 * on where I was" before it answers "show me something new".
 */
export default function AnimeHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const sections = useAnimeSections();
  const hasLeadSection = useSupportsSection(LEAD_SECTION);
  const genres = useAnimeGenres();
  const continueWatching = useContinueWatching();

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

        {hasLeadSection ? <AnimeRail section={LEAD_SECTION} /> : null}

        <GenreRail
          genres={genres.data ?? []}
          onSelect={(genre) => router.push(routes.genre('anime', genre))}
        />

        {sections.map((section) => (
          <AnimeRail key={section} section={section} />
        ))}

        <ScheduleLink onPress={() => router.push(routes.schedule())} />
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

/** Entry point to the release schedule, in the run of content rather than a button. */
function ScheduleLink({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.scheduleBlock}>
      <SectionHeader title="Release schedule" />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Open the release schedule"
        style={({ pressed }) => [styles.scheduleRow, pressed && styles.pressed]}
      >
        <Text variant="body" style={styles.scheduleText}>
          What&apos;s airing this week
        </Text>
        <Text variant="meta" tone="accent" caps>
          Open
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { flexGrow: 1, paddingTop: space.xl },
  scheduleBlock: { marginBottom: sectionGap },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget,
    paddingHorizontal: gutter,
    paddingVertical: space.md,
    borderTopWidth: hairline,
    borderTopColor: color.line,
    borderBottomWidth: hairline,
    borderBottomColor: color.line,
  },
  scheduleText: { flex: 1 },
  pressed: { backgroundColor: color.surface },
});
