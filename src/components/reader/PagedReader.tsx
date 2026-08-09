import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { ReaderPage } from '../ReaderPage';
import { color } from '@/design/tokens';
import type { ReadingDirection } from '@/lib/settings';

export interface PagedReaderProps {
  pages: string[];
  width: number;
  height: number;
  /** Page to open on. Applied once, on mount. */
  initialPage: number;
  direction: ReadingDirection;
  onPageChange: (page: number) => void;
  onRefreshSource: () => void;
  /** Reached the end and swiped past it. */
  onReachEnd?: () => void;
}

/** Pages kept warm either side of the current one. */
const PRELOAD_RADIUS = 2;

/**
 * Discrete page-turn reader.
 *
 * Right-to-left mirrors the scroll axis with a horizontal flip on the list and
 * a matching flip on each page, rather than reversing the data. FlashList v2
 * removed `inverted`, and reversing the array would mean every index, resume
 * position, progress, preloading, needed translating between reading order and
 * storage order. Mirroring keeps indices in reading order throughout.
 *
 * `horizontal` cannot be toggled on a mounted list, so the parent remounts this
 * component on a mode change. That remount is the fix for the mode-switch
 * crash, not a workaround for it.
 */
export function PagedReader({
  pages,
  width,
  height,
  initialPage,
  direction,
  onPageChange,
  onRefreshSource,
  onReachEnd,
}: PagedReaderProps) {
  const currentPage = useRef(initialPage);

  // Warm the neighbours of wherever we open, so the first swipe is instant.
  useEffect(() => {
    prefetchAround(pages, initialPage);
  }, [pages, initialPage]);

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      if (width <= 0) return;

      const page = Math.max(0, Math.min(pages.length - 1, Math.round(contentOffset.x / width)));

      if (page !== currentPage.current) {
        currentPage.current = page;
        onPageChange(page);
        prefetchAround(pages, page);
      }

      // Past the last page: hand off to the next chapter.
      const atEnd = contentOffset.x + layoutMeasurement.width >= contentSize.width - 1;
      if (atEnd && page === pages.length - 1) onReachEnd?.();
    },
    [pages, width, onPageChange, onReachEnd]
  );

  const mirrored = direction === 'rtl';

  return (
    <View style={styles.container}>
      <FlashList
        data={pages}
        horizontal
        pagingEnabled
        style={mirrored ? styles.mirror : undefined}
        keyExtractor={(uri, index) => `${index}-${uri}`}
        renderItem={({ item, index }) => (
          // The page is flipped back so artwork reads correctly inside a
          // mirrored list.
          <View style={mirrored ? styles.mirror : undefined}>
            <ReaderPage
              uri={item}
              width={width}
              height={height}
              pageNumber={index + 1}
              pageCount={pages.length}
              onRefreshSource={onRefreshSource}
            />
          </View>
        )}
        initialScrollIndex={clampIndex(initialPage, pages.length)}
        onMomentumScrollEnd={handleScrollEnd}
        showsHorizontalScrollIndicator={false}
        // Paging snaps whole screens, so a decelerating scroll should not drift.
        decelerationRate="fast"
        drawDistance={width * 2}
      />
    </View>
  );
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

/**
 * Prime the image cache around a page.
 *
 * expo-image's disk cache does the actual work; this only decides *when* to ask
 * for a page. A radius of two keeps a swipe in either direction instant without
 * pulling a whole chapter of full-resolution images into memory.
 */
function prefetchAround(pages: string[], page: number): void {
  const targets: string[] = [];
  for (let offset = -PRELOAD_RADIUS; offset <= PRELOAD_RADIUS; offset++) {
    if (offset === 0) continue;
    const uri = pages[page + offset];
    if (uri) targets.push(uri);
  }
  if (targets.length > 0) void Image.prefetch(targets, { cachePolicy: 'disk' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.immersive },
  // Mirrors the scroll axis for right-to-left reading. The underlying scroll
  // offset stays left-to-right, so index maths is unaffected.
  mirror: { transform: [{ scaleX: -1 }] },
});
