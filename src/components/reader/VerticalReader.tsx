import { FlashList, type ViewToken } from '@shopify/flash-list';
import { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { ReaderPage } from '../ReaderPage';
import { color } from '@/design/tokens';

export interface VerticalReaderProps {
  pages: string[];
  width: number;
  height: number;
  initialPage: number;
  onPageChange: (page: number) => void;
  onRefreshSource: () => void;
  footer?: React.ReactElement | null;
}

/**
 * Continuous vertical reader.
 *
 * Page tracking uses viewability, not scroll offset. Manga pages have wildly
 * different heights — spreads, tall webtoon panels — so deriving a page number
 * from a scroll fraction is guesswork that drifts badly over a long chapter.
 * Viewability reports the page actually on screen.
 */
export function VerticalReader({
  pages,
  width,
  height,
  initialPage,
  onPageChange,
  onRefreshSource,
  footer,
}: VerticalReaderProps) {
  const currentPage = useRef(initialPage);

  // Stable across renders: FlashList treats a changing callback identity as a
  // config change and warns.
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 40,
    minimumViewTime: 100,
  }).current;

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<string>[] }) => {
      // The topmost visible page is the one being read.
      let topIndex: number | undefined;
      for (const token of viewableItems) {
        if (token.index === null || token.index === undefined) continue;
        if (topIndex === undefined || token.index < topIndex) topIndex = token.index;
      }

      if (topIndex === undefined || topIndex === currentPage.current) return;
      currentPage.current = topIndex;
      onPageChange(topIndex);
    },
    [onPageChange]
  );

  const onViewableItemsChanged = useRef(handleViewableItemsChanged).current;

  return (
    <View style={styles.container}>
      <FlashList
        data={pages}
        keyExtractor={(uri, index) => `${index}-${uri}`}
        renderItem={({ item, index }) => (
          <ReaderPage
            uri={item}
            width={width}
            pageNumber={index + 1}
            pageCount={pages.length}
            onRefreshSource={onRefreshSource}
          />
        )}
        initialScrollIndex={clampIndex(initialPage, pages.length)}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        showsVerticalScrollIndicator={false}
        // One screen either side stays rendered. Larger windows pull whole
        // chapters of full-resolution images into memory on low-RAM devices.
        drawDistance={height}
        ListFooterComponent={footer}
      />
    </View>
  );
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.immersive },
});
