import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContentRow } from '@/components/ContentRow';
import { CrossLinkRow } from '@/components/CrossLinkRow';
import { DetailHero } from '@/components/DetailHero';
import { EpisodeGrid } from '@/components/EpisodeGrid';
import { FloatingBack } from '@/components/FloatingBack';
import { MetaList } from '@/components/MetaRow';
import { SeasonSelector } from '@/components/SeasonSelector';
import { SectionHeader } from '@/components/SectionHeader';
import { StarRating } from '@/components/StarRating';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { Trailer } from '@/components/Trailer';
import { toRowItem, useAnime, useAnimeEpisodes } from '@/data/anime';
import { useSimilarAnime } from '@/data/recommendations';
import { useIsSaved, useToggleSaved, useWatchProgress } from '@/data/library';
import { useAnimeSeasons, useMangaForAnime } from '@/data/relations';
import { Button } from '@/design/Button';
import { Text } from '@/design/Text';
import { color, gutter, sectionGap, space } from '@/design/tokens';
import { useContentNavigation } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { formatCountdown } from '@/lib/schedule';

/**
 * Anime detail.
 *
 * WATCH is the single filled purple element on the screen; everything else is
 * an outline or plain text, which is what makes the primary action obvious
 * without a banner or a floating button.
 */
export default function AnimeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Pushes rather than replaces, and ignores a tap on the title already open;
  // so back always returns to the screen actually navigated from.
  const navigate = useContentNavigation(id);

  const anime = useAnime(id);
  const episodes = useAnimeEpisodes(id);
  const similar = useSimilarAnime(anime.data);
  const seasons = useAnimeSeasons(anime.data);
  const mangaLink = useMangaForAnime(anime.data);
  const saved = useIsSaved(id);
  const toggleSaved = useToggleSaved();
  const progress = useWatchProgress(id);

  const aired = useMemo(
    () => (episodes.data ?? []).filter((episode) => !episode.upcoming),
    [episodes.data]
  );

  if (anime.isPending) return <LoadingState />;
  if (anime.error || !anime.data) {
    return <ErrorState error={anime.error} onRetry={() => void anime.refetch()} />;
  }

  const data = anime.data;

  // Resume where the user stopped; otherwise start at episode 1.
  const resumeEpisode = progress.data?.episodeNumber ?? aired[0]?.number ?? 1;
  const watchLabel = progress.data ? `Resume episode ${resumeEpisode}` : 'Watch';

  const openEpisode = (episodeNumber: number) => {
    router.push(routes.watch(data.id, episodeNumber));
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Floats over the artwork so the hero is never cut off by a bar. */}
      <FloatingBack backdropColor={data.banner?.color ?? data.artwork?.color} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <DetailHero
          title={data.title}
          originalTitle={data.originalTitle}
          poster={data.artwork}
          banner={data.banner ?? data.artwork}
          summary={summaryLine(data.year, data.episodeCount, data.status)}
        />

        <View style={styles.actions}>
          <Button
            label={watchLabel}
            glyph="▶"
            onPress={() => openEpisode(resumeEpisode)}
            block
            disabled={aired.length === 0}
            accessibilityHint={
              aired.length === 0 ? 'No episodes have aired yet' : 'Opens the player'
            }
          />
        </View>

        {data.nextEpisode ? (
          <Text variant="meta" tone="accent" style={styles.nextAiring}>
            Episode {data.nextEpisode.number} {formatCountdown(data.nextEpisode.airingAt)}
          </Text>
        ) : null}

        {data.synopsis ? (
          <View style={styles.block}>
            <SectionHeader title="Synopsis" />
            <Text variant="body" tone="muted" style={styles.synopsis}>
              {data.synopsis}
            </Text>
          </View>
        ) : null}

        {data.trailer ? (
          <View style={styles.block}>
            <SectionHeader title="Trailer" />
            <Trailer
              youtubeId={data.trailer.youtubeId}
              thumbnail={data.trailer.thumbnail}
              title={data.title}
            />
          </View>
        ) : null}

        <View style={styles.block}>
          <Button
            label={saved.data ? 'In your list' : 'Add to list'}
            variant="secondary"
            onPress={() =>
              toggleSaved.mutate({
                id: data.id,
                kind: 'anime',
                title: data.title,
                image: data.artwork,
              })
            }
            block
            style={styles.addToList}
          />
        </View>

        {(seasons.data?.length ?? 0) > 1 ? (
          <View style={styles.block}>
            {/*
              Pushes, not replaces. A season jump is navigation, and replacing
              erased the season you came from; which is what made back appear
              to skip all the way to Anime Home.
            */}
            <SeasonSelector
              seasons={seasons.data ?? []}
              onSelect={(seasonId) => navigate.openAnime(seasonId)}
            />
          </View>
        ) : null}

        {/* Only rendered when a counterpart was actually identified. */}
        {mangaLink.data ? (
          <View style={styles.block}>
            <CrossLinkRow
              label="Read the manga"
              targetTitle={mangaLink.data.title}
              approximate={mangaLink.data.via === 'title'}
              onPress={() => navigate.openManga(mangaLink.data!.id)}
            />
          </View>
        ) : null}

        <View style={styles.block}>
          <SectionHeader title="Extra information" />
          <MetaList
            items={[
              // The rating lives here rather than in the hero: it is one more
              // fact about the title, not a headline.
              {
                label: 'Rating',
                node: data.score !== undefined ? <StarRating score={data.score} /> : undefined,
              },
              { label: 'Status', value: STATUS_LABEL[data.status] ?? 'Unknown' },
              { label: 'Genres', value: data.genres.join(', ') },
              { label: 'Studio', value: data.studios.join(', ') },
              { label: 'Season', value: seasonLine(data.season, data.year) },
              { label: 'Episodes', value: data.episodeCount ? String(data.episodeCount) : '' },
              {
                label: 'Runtime',
                value: data.durationMinutes ? `${data.durationMinutes} min` : '',
              },
            ]}
          />
        </View>

        <View style={styles.block}>
          <SectionHeader title={`Episodes${aired.length > 0 ? ` · ${aired.length}` : ''}`} />

          {episodes.isPending ? (
            <LoadingState />
          ) : episodes.error ? (
            <ErrorState error={episodes.error} onRetry={() => void episodes.refetch()} />
          ) : (
            <EpisodeGrid
              episodes={episodes.data ?? []}
              currentEpisode={progress.data?.episodeNumber}
              // Everything before the episode in progress has been seen.
              watchedThrough={
                progress.data ? Math.max(0, progress.data.episodeNumber - 1) : undefined
              }
              onSelect={openEpisode}
            />
          )}
        </View>

        {(similar.data?.length ?? 0) > 0 ? (
          <ContentRow
            title="You may also like"
            items={(similar.data ?? []).map(toRowItem)}
            onSelect={navigate.openAnime}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const STATUS_LABEL: Record<string, string> = {
  airing: 'Airing',
  finished: 'Finished',
  upcoming: 'Not yet aired',
  cancelled: 'Cancelled',
  unknown: 'Unknown',
};

function summaryLine(
  year: number | undefined,
  episodeCount: number | undefined,
  status: string
): string {
  return [
    year ? String(year) : undefined,
    episodeCount ? `${episodeCount} episodes` : undefined,
    STATUS_LABEL[status],
  ]
    .filter(Boolean)
    .join(' · ');
}

function seasonLine(season: string | undefined, year: number | undefined): string {
  if (!season) return year ? String(year) : '';
  const label = season.charAt(0).toUpperCase() + season.slice(1);
  return year ? `${label} ${year}` : label;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  actions: { paddingHorizontal: gutter },
  addToList: { marginHorizontal: gutter },
  nextAiring: { paddingHorizontal: gutter, marginTop: space.md },
  block: { marginTop: sectionGap },
  synopsis: { paddingHorizontal: gutter },
});
