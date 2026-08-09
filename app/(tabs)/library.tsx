import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { ContinueRow } from '@/components/ContinueRow';
import { PosterGrid } from '@/components/PosterGrid';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Segmented } from '@/components/Segmented';
import { EmptyState } from '@/components/StateViews';
import {
  useContinueReading,
  useContinueWatching,
  useLibraryEntries,
} from '@/data/library';
import { color, space } from '@/design/tokens';
import { routes } from '@/lib/routes';

type Tab = 'anime' | 'manga';

const TABS = [
  { value: 'anime' as const, label: 'Anime' },
  { value: 'manga' as const, label: 'Manga' },
];

/**
 * Saved titles and in-progress content.
 *
 * Everything here is local storage, so it renders with no network at all, the
 * one screen that always works offline (§25).
 */
export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('anime');

  const entries = useLibraryEntries(tab);
  const continueWatching = useContinueWatching();
  const continueReading = useContinueReading();

  const items = (entries.data ?? []).map((entry) => ({
    id: entry.id,
    title: entry.title,
    image: entry.image,
  }));

  const resumeItems =
    tab === 'anime'
      ? (continueWatching.data ?? []).map((entry) => ({
          id: entry.animeId,
          title: entry.title,
          image: entry.image,
          position: `Episode ${entry.episodeNumber}`,
          fraction: entry.durationSeconds
            ? entry.positionSeconds / entry.durationSeconds
            : 0,
        }))
      : (continueReading.data ?? []).map((entry) => ({
          id: entry.mangaId,
          title: entry.title,
          image: entry.image,
          position: entry.chapterNumber ? `Chapter ${entry.chapterNumber}` : 'In progress',
          fraction: entry.pageCount > 0 ? (entry.page + 1) / entry.pageCount : 0,
        }));

  const isEmpty = items.length === 0 && resumeItems.length === 0;

  return (
    <View style={styles.screen}>
      <AppHeader
        context="Library"
        actionLabel="Settings"
        onAction={() => router.push(routes.settings())}
      />

      <ScreenHeader title="Library" />

      <View style={styles.tabs}>
        <Segmented options={TABS} value={tab} onChange={setTab} accessibilityLabel="Library" />
      </View>

      {isEmpty ? (
        <EmptyState
          title={`Your ${tab} list is empty.`}
          detail={`Titles you save will appear here, along with anything you've started.`}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
          showsVerticalScrollIndicator={false}
        >
          <ContinueRow
            title={tab === 'anime' ? 'Continue watching' : 'Continue reading'}
            items={resumeItems}
            onSelect={(id) => router.push(routes.detail(tab, id))}
          />

          {items.length > 0 ? (
            <View style={styles.grid}>
              <PosterGrid
                items={items}
                onSelect={(id) => router.push(routes.detail(tab, id))}
                emptyTitle="Nothing saved yet."
              />
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  tabs: { marginBottom: space.xl },
  // The grid is virtualized but nested in a ScrollView here; a bounded height
  // keeps FlashList's own recycling working instead of rendering every item.
  grid: { minHeight: 400 },
});
