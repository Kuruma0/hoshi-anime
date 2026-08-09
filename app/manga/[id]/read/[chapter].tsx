import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PagedReader } from '@/components/reader/PagedReader';
import { ReaderControls } from '@/components/reader/ReaderControls';
import { VerticalReader } from '@/components/reader/VerticalReader';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useReadProgress, useSaveReadProgress } from '@/data/library';
import { useChapterPages, useChapters, useManga } from '@/data/manga';
import { Text } from '@/design/Text';
import { color, gutter, hairline, space, touchTarget } from '@/design/tokens';
import { compareChapters, isReadable } from '@/providers/mangadex/normalize';
import { routes } from '@/lib/routes';
import { useSettings } from '@/lib/settings';

/**
 * The manga reader.
 *
 * The two reading modes are separate components rather than one list that
 * reconfigures itself. `horizontal` and `inverted` cannot be changed on a
 * mounted list; doing so was the mode-switch crash. Swapping components makes
 * the switch a mount, and `resumePage` carries the position across it.
 */
export default function ReaderScreen() {
  const { id, chapter: chapterId } = useLocalSearchParams<{ id: string; chapter: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const readerMode = useSettings((state) => state.readerMode);
  const setReaderMode = useSettings((state) => state.setReaderMode);
  const readingDirection = useSettings((state) => state.readingDirection);
  const setReadingDirection = useSettings((state) => state.setReadingDirection);
  const dataSaver = useSettings((state) => state.dataSaver);
  const keepAwakeEnabled = useSettings((state) => state.keepAwakeWhileReading);

  const manga = useManga(id);
  const chapters = useChapters(id);
  const pages = useChapterPages(chapterId);
  const savedProgress = useReadProgress(id);
  const saveProgress = useSaveReadProgress();

  const [chromeVisible, setChromeVisible] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  /**
   * The page a freshly-mounted reader should open on.
   *
   * Held in a ref, not state, so updating the visible page counter on every
   * scroll does not remount the list under the reader's finger. It is only read
   * at mount, which happens on entry and on a mode switch.
   */
  const resumePage = useRef(0);
  const restoredFor = useRef<string | undefined>(undefined);
  const lastSavedPage = useRef(-1);

  const pageUrls = useMemo(() => {
    if (!pages.data) return [];
    return dataSaver && pages.data.dataSaverPages.length > 0
      ? pages.data.dataSaverPages
      : pages.data.pages;
  }, [pages.data, dataSaver]);

  const readableChapters = useMemo(
    () =>
      (chapters.data?.pages.flatMap((page) => page.items) ?? [])
        .filter(isReadable)
        .sort(compareChapters),
    [chapters.data]
  );

  const index = readableChapters.findIndex((entry) => entry.id === chapterId);
  const currentChapter = index >= 0 ? readableChapters[index] : undefined;
  const previousChapter = index > 0 ? readableChapters[index - 1] : undefined;
  const nextChapter =
    index >= 0 && index < readableChapters.length - 1 ? readableChapters[index + 1] : undefined;

  useKeepAwakeWhenReading(keepAwakeEnabled);

  /**
   * Restore the saved page, once per chapter.
   *
   * Guarded by chapter id so re-entering a chapter resumes, but scrolling
   * within it never yanks the reader back to where it started.
   */
  useEffect(() => {
    if (!chapterId || restoredFor.current === chapterId) return;
    if (savedProgress.isPending || pageUrls.length === 0) return;

    restoredFor.current = chapterId;
    const saved =
      savedProgress.data?.chapterId === chapterId ? (savedProgress.data?.page ?? 0) : 0;
    const page = Math.max(0, Math.min(pageUrls.length - 1, saved));

    resumePage.current = page;
    lastSavedPage.current = page;
    setCurrentPage(page);
  }, [chapterId, savedProgress.isPending, savedProgress.data, pageUrls.length]);

  /** Persist position. Called from whichever reader is mounted. */
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      resumePage.current = page;

      if (!manga.data || !chapterId || pageUrls.length === 0) return;
      if (page === lastSavedPage.current) return;

      lastSavedPage.current = page;
      saveProgress.mutate({
        mangaId: manga.data.id,
        chapterId,
        chapterNumber: currentChapter?.number,
        page,
        pageCount: pageUrls.length,
        title: manga.data.title,
        image: manga.data.cover,
      });
    },
    [manga.data, chapterId, currentChapter, pageUrls.length, saveProgress]
  );

  const goToChapter = useCallback(
    (targetId: string) => {
      // A new chapter starts at the top, so clear the carried position first.
      resumePage.current = 0;
      lastSavedPage.current = -1;
      restoredFor.current = targetId;
      setCurrentPage(0);
      // Replace, not push: reading ten chapters in a row should leave one entry
      // behind, so Back returns to the chapter list rather than walking back
      // through every chapter read.
      router.replace(routes.read(id, targetId));
    },
    [id, router]
  );

  const toggleChrome = useCallback(() => {
    setChromeVisible((visible) => {
      if (visible) setControlsVisible(false);
      return !visible;
    });
  }, []);

  if (pages.isPending) return <LoadingState label="Loading chapter" />;
  if (pages.error) {
    return <ErrorState error={pages.error} onRetry={() => void pages.refetch()} />;
  }

  /*
   * Remount key.
   *
   * Both `horizontal` and `inverted` are mount-time properties of the
   * underlying list, so the key changes whenever either would. The chapter id
   * is included so moving chapters starts a genuinely fresh list rather than
   * recycling scroll state from the previous one.
   */
  const readerKey = `${chapterId}-${readerMode}-${readingDirection}`;

  return (
    <View style={styles.screen}>
      {/*
        The native status bar stays visible so the OS keeps drawing the clock
        and battery over the page. Recreating those in-app would be both
        redundant and less accurate. Translucency is configured app-wide in
        app.json so pages render underneath it.
      */}
      <StatusBar style="light" hidden={false} />

      <Pressable onPress={toggleChrome} style={styles.surface}>
        {readerMode === 'paged' ? (
          <PagedReader
            key={readerKey}
            pages={pageUrls}
            width={width}
            height={height}
            initialPage={resumePage.current}
            direction={readingDirection}
            onPageChange={handlePageChange}
            onRefreshSource={() => void pages.refetch()}
            onReachEnd={nextChapter ? () => goToChapter(nextChapter.id) : undefined}
          />
        ) : (
          <VerticalReader
            key={readerKey}
            pages={pageUrls}
            width={width}
            height={height}
            initialPage={resumePage.current}
            onPageChange={handlePageChange}
            onRefreshSource={() => void pages.refetch()}
            footer={
              <ChapterFooter
                nextTitle={nextChapter?.number}
                onNext={nextChapter ? () => goToChapter(nextChapter.id) : undefined}
              />
            }
          />
        )}
      </Pressable>

      {/* Unobtrusive progress, always visible. */}
      {!chromeVisible && pageUrls.length > 0 ? (
        <View style={[styles.pageBadge, { bottom: insets.bottom + space.md }]} pointerEvents="none">
          <Text variant="meta" tone="muted">
            {currentPage + 1} / {pageUrls.length}
          </Text>
        </View>
      ) : null}

      {chromeVisible ? (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back to chapter list"
              hitSlop={space.md}
              style={styles.chromeButton}
            >
              <Text variant="body">Chapters</Text>
            </Pressable>

            <View style={styles.topText}>
              <Text variant="meta" numberOfLines={1}>
                {manga.data?.title ?? ''}
              </Text>
              <Text variant="meta" tone="faint" numberOfLines={1}>
                {currentChapter?.number ? `Chapter ${currentChapter.number}` : 'Chapter'}
              </Text>
            </View>

            <Pressable
              onPress={() => setControlsVisible((visible) => !visible)}
              accessibilityRole="button"
              accessibilityLabel="Reader settings"
              accessibilityState={{ expanded: controlsVisible }}
              hitSlop={space.md}
              style={styles.chromeButton}
            >
              <Text variant="meta" tone={controlsVisible ? 'accent' : 'default'} caps>
                Display
              </Text>
            </Pressable>
          </View>

          <View style={[styles.bottom, { paddingBottom: insets.bottom }]}>
            {controlsVisible ? (
              <ReaderControls
                mode={readerMode}
                direction={readingDirection}
                onModeChange={setReaderMode}
                onDirectionChange={setReadingDirection}
              />
            ) : null}

            <View style={styles.bottomBar}>
              <Pressable
                onPress={() => previousChapter && goToChapter(previousChapter.id)}
                disabled={!previousChapter}
                accessibilityRole="button"
                accessibilityLabel="Previous chapter"
                accessibilityState={{ disabled: !previousChapter }}
                style={styles.chromeButton}
              >
                <Text variant="meta" tone={previousChapter ? 'default' : 'faint'}>
                  Previous
                </Text>
              </Pressable>

              <Text variant="meta" tone="muted">
                {pageUrls.length > 0 ? `Page ${currentPage + 1} / ${pageUrls.length}` : ''}
              </Text>

              <Pressable
                onPress={() => nextChapter && goToChapter(nextChapter.id)}
                disabled={!nextChapter}
                accessibilityRole="button"
                accessibilityLabel="Next chapter"
                accessibilityState={{ disabled: !nextChapter }}
                style={styles.chromeButton}
              >
                <Text variant="meta" tone={nextChapter ? 'default' : 'faint'}>
                  Next
                </Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

/** End-of-chapter affordance, so finishing does not just stop at a dead end. */
function ChapterFooter({ nextTitle, onNext }: { nextTitle?: string; onNext?: () => void }) {
  return (
    <View style={styles.footer}>
      {onNext ? (
        <Pressable
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel={`Next chapter${nextTitle ? `, ${nextTitle}` : ''}`}
          style={({ pressed }) => [styles.footerButton, pressed && styles.pressed]}
        >
          <Text variant="meta" tone="faint">
            Next chapter
          </Text>
          <Text variant="subtitle" style={styles.footerTitle}>
            {nextTitle ? `Chapter ${nextTitle}` : 'Continue'}
          </Text>
        </Pressable>
      ) : (
        <Text variant="meta" tone="faint">
          That&apos;s the last chapter available.
        </Text>
      )}
    </View>
  );
}

/** Hooks cannot be called conditionally, so the toggle lives inside. */
function useKeepAwakeWhenReading(enabled: boolean) {
  useKeepAwake(enabled ? 'hoshi-reader' : undefined);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.immersive },
  surface: { flex: 1 },
  pageBadge: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: 'rgba(11,9,16,0.72)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingBottom: space.md,
    backgroundColor: color.bg,
    borderBottomWidth: hairline,
    borderBottomColor: color.line,
  },
  topText: { flex: 1, alignItems: 'center', paddingHorizontal: space.md },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: color.bg,
    borderTopWidth: hairline,
    borderTopColor: color.line,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingTop: space.md,
  },
  chromeButton: { minHeight: touchTarget, justifyContent: 'center' },
  footer: {
    paddingVertical: space.xxxl,
    paddingHorizontal: gutter,
    alignItems: 'center',
    backgroundColor: color.bg,
  },
  footerButton: { alignItems: 'center', minHeight: touchTarget, justifyContent: 'center' },
  footerTitle: { marginTop: space.xs },
  pressed: { opacity: 0.6 },
});
