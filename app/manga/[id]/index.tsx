import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CrossLinkRow } from '@/components/CrossLinkRow';
import { DetailHero } from '@/components/DetailHero';
import { FloatingBack } from '@/components/FloatingBack';
import { MetaList } from '@/components/MetaRow';
import { SectionHeader } from '@/components/SectionHeader';
import { SourcePicker } from '@/components/SourcePicker';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useIsSaved, useReadProgress, useToggleSaved } from '@/data/library';
import { useChapters, useManga } from '@/data/manga';
import { useAnimeForManga } from '@/data/relations';
import { useMangaSources, useRateSource, useSourceRatings } from '@/data/sources';
import { useContentNavigation } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { Button } from '@/design/Button';
import { Text } from '@/design/Text';
import { color, gutter, hairline, sectionGap, space, touchTarget } from '@/design/tokens';
import type { Chapter } from '@/domain/manga';
import { isReadable } from '@/providers/mangadex/normalize';

/**
 * Manga detail (§10).
 *
 * Chapters that are officially licensed carry an `externalUrl` and no pages.
 * Rather than hiding them — which would make a fully-licensed series look like
 * it has no chapters at all — they are listed and marked, and tapping one opens
 * the publisher's site.
 */
export default function MangaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navigate = useContentNavigation(id);

  const manga = useManga(id);
  const chapters = useChapters(id);
  const saved = useIsSaved(id);
  const toggleSaved = useToggleSaved();
  const progress = useReadProgress(id);
  const animeLink = useAnimeForManga(manga.data);

  const [pickerOpen, setPickerOpen] = useState(false);
  const { sources, isPending: sourcesPending } = useMangaSources(manga.data);
  const ratings = useSourceRatings();
  const rateSource = useRateSource();

  const allChapters = useMemo(
    () => chapters.data?.pages.flatMap((page) => page.items) ?? [],
    [chapters.data]
  );
  const readableChapters = useMemo(() => allChapters.filter(isReadable), [allChapters]);

  if (manga.isPending) return <LoadingState />;
  if (manga.error || !manga.data) {
    return <ErrorState error={manga.error} onRetry={() => void manga.refetch()} />;
  }

  const data = manga.data;

  // Resume the chapter in progress if it is still in the list; else start at
  // the first readable one.
  const resumeChapter =
    readableChapters.find((chapter) => chapter.id === progress.data?.chapterId) ??
    readableChapters[0];

  const readLabel = progress.data?.chapterId
    ? `Resume chapter ${progress.data.chapterNumber ?? ''}`.trim()
    : 'Read';

  const openChapter = (chapter: Chapter) => {
    if (chapter.externalUrl) {
      void Linking.openURL(chapter.externalUrl);
      return;
    }
    router.push(routes.read(data.id, chapter.id));
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <FloatingBack backdropColor={data.cover?.color} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <DetailHero
          title={data.title}
          originalTitle={data.originalTitle}
          poster={data.cover}
          banner={data.cover}
          summary={summaryLine(data)}
        />

        <View style={styles.actions}>
          <Button
            label={readLabel}
            // READ opens the source picker, where chapter counts, language and
            // your own source ratings live.
            onPress={() => setPickerOpen(true)}
            block
            disabled={!resumeChapter}
            accessibilityHint={
              resumeChapter ? 'Choose a source and start reading' : 'No readable chapters in this language'
            }
            style={styles.read}
          />
          <Button
            label={saved.data ? 'In your list' : 'Add to list'}
            variant="secondary"
            onPress={() =>
              toggleSaved.mutate({
                id: data.id,
                kind: 'manga',
                title: data.title,
                image: data.cover,
              })
            }
            block
          />
        </View>

        {animeLink.data ? (
          <View style={styles.block}>
            <CrossLinkRow
              label="Watch the anime"
              targetTitle={animeLink.data.title}
              approximate={animeLink.data.via === 'title'}
              onPress={() => navigate.openAnime(animeLink.data!.id)}
            />
          </View>
        ) : null}

      {data.description ? (
        <View style={styles.block}>
          <SectionHeader title="Description" />
          <Text variant="body" tone="muted" style={styles.description}>
            {data.description}
          </Text>
        </View>
      ) : null}

      <View style={styles.block}>
        <MetaList
          items={[
            { label: 'Status', value: STATUS_LABEL[data.status] ?? 'Unknown' },
            { label: 'Author', value: data.authors.join(', ') },
            { label: 'Artist', value: data.artists.join(', ') },
            { label: 'Genres', value: data.genres.join(', ') },
            { label: 'Year', value: data.year ? String(data.year) : '' },
            { label: 'Chapters', value: data.lastChapter ?? '' },
            { label: 'Rating', value: RATING_LABEL[data.contentRating] ?? '' },
          ]}
        />
      </View>

      <View style={styles.block}>
        <SectionHeader
          title={`Chapters${allChapters.length > 0 ? ` · ${allChapters.length}` : ''}`}
        />
        <ChapterList
          chapters={allChapters}
          isLoading={chapters.isPending}
          error={chapters.error}
          onRetry={() => void chapters.refetch()}
          currentChapterId={progress.data?.chapterId}
          onSelect={openChapter}
        />

        {chapters.hasNextPage ? (
          <Button
            label={chapters.isFetchingNextPage ? 'Loading…' : 'Load more chapters'}
            variant="ghost"
            onPress={() => void chapters.fetchNextPage()}
            style={styles.loadMore}
          />
        ) : null}
        </View>
      </ScrollView>

      <SourcePicker
        visible={pickerOpen}
        title={data.title}
        sources={sources}
        isPending={sourcesPending}
        ratings={ratings.data ?? {}}
        onRate={(sourceId, stars) => rateSource.mutate({ sourceId, stars })}
        onClose={() => setPickerOpen(false)}
        onSelect={(source) => {
          setPickerOpen(false);
          // Reading always continues in the chosen source's own id space.
          const targetId = source.mangaId ?? data.id;
          if (targetId === data.id && resumeChapter) {
            openChapter(resumeChapter);
          } else {
            navigate.openManga(targetId);
          }
        }}
      />
    </View>
  );
}

function ChapterList({
  chapters,
  isLoading,
  error,
  onRetry,
  onSelect,
  currentChapterId,
}: {
  chapters: Chapter[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onSelect: (chapter: Chapter) => void;
  currentChapterId?: string;
}) {
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  if (chapters.length === 0) {
    return (
      <Text variant="body" tone="faint" style={styles.emptyChapters}>
        No chapters in your selected language. Try another in Settings.
      </Text>
    );
  }

  return (
    <View>
      {chapters.map((chapter) => {
        const external = Boolean(chapter.externalUrl);
        const isCurrent = chapter.id === currentChapterId;

        return (
          <Pressable
            key={chapter.id}
            onPress={() => onSelect(chapter)}
            accessibilityRole="button"
            accessibilityLabel={
              external
                ? `Chapter ${chapter.number ?? ''}, read on the publisher's site`
                : `Read chapter ${chapter.number ?? ''}${chapter.title ? `, ${chapter.title}` : ''}`
            }
            accessibilityState={{ selected: isCurrent }}
            style={({ pressed }) => [
              styles.chapter,
              isCurrent && styles.chapterCurrent,
              pressed && styles.chapterPressed,
            ]}
          >
            <Text
              variant="meta"
              tone={isCurrent ? 'accent' : 'muted'}
              style={styles.chapterNumber}
            >
              {chapter.number ?? '—'}
            </Text>

            <View style={styles.chapterText}>
              <Text variant="body" numberOfLines={1}>
                {chapter.title ?? `Chapter ${chapter.number ?? ''}`.trim()}
              </Text>
              {chapter.scanlationGroup ? (
                <Text variant="meta" tone="faint" numberOfLines={1}>
                  {chapter.scanlationGroup}
                </Text>
              ) : null}
            </View>

            {external ? (
              <Text variant="meta" tone="faint">
                Off-site
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const STATUS_LABEL: Record<string, string> = {
  ongoing: 'Ongoing',
  completed: 'Completed',
  hiatus: 'On hiatus',
  cancelled: 'Cancelled',
  unknown: 'Unknown',
};

const RATING_LABEL: Record<string, string> = {
  safe: 'All ages',
  suggestive: 'Suggestive',
  erotica: 'Erotica',
  pornographic: 'Adult',
};

function summaryLine(manga: { year?: number; status: string; lastChapter?: string }): string {
  return [
    manga.year ? String(manga.year) : undefined,
    manga.lastChapter ? `${manga.lastChapter} chapters` : undefined,
    STATUS_LABEL[manga.status],
  ]
    .filter(Boolean)
    .join(' · ');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  actions: { paddingHorizontal: gutter, gap: space.sm },
  read: { marginBottom: space.xs },
  block: { marginTop: sectionGap },
  description: { paddingHorizontal: gutter },
  emptyChapters: { paddingHorizontal: gutter },
  chapter: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget,
    paddingHorizontal: gutter,
    paddingVertical: space.md,
    borderTopWidth: hairline,
    borderTopColor: color.line,
  },
  chapterCurrent: { backgroundColor: color.surface },
  chapterPressed: { backgroundColor: color.surfaceRaised },
  chapterNumber: { width: 44 },
  chapterText: { flex: 1, marginRight: space.md },
  loadMore: { marginTop: space.lg, alignSelf: 'center' },
});
