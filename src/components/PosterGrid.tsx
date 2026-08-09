import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { PosterCard, type PosterCardProps } from './PosterCard';
import { EmptyState, ErrorState, LoadingState } from './StateViews';
import { gutter, posterWidth, space } from '@/design/tokens';
import type { Image as DomainImage } from '@/domain/common';

export interface GridItem {
  id: string;
  title: string;
  image?: DomainImage;
  caption?: string;
}

export interface PosterGridProps {
  items: GridItem[];
  onSelect: (id: string) => void;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onEndReached?: () => void;
  isFetchingMore?: boolean;
  emptyTitle?: string;
  emptyDetail?: string;
  ListHeaderComponent?: PosterCardProps extends never ? never : React.ReactElement | null;
}

/**
 * Paginated poster grid, used by browse and search.
 *
 * Column count is computed from the viewport rather than fixed, so the layout
 * adapts to phone widths and tablets without a second implementation — §19 asks
 * for the design language to survive a larger screen.
 */
export function PosterGrid({
  items,
  onSelect,
  isLoading,
  error,
  onRetry,
  onEndReached,
  isFetchingMore,
  emptyTitle = 'Nothing found.',
  emptyDetail,
  ListHeaderComponent,
}: PosterGridProps) {
  const { width } = useWindowDimensions();

  const columns = Math.max(3, Math.floor((width - gutter) / (posterWidth.gridMin + space.md)));
  const itemWidth = Math.floor((width - gutter * 2 - space.md * (columns - 1)) / columns);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (items.length === 0) return <EmptyState title={emptyTitle} detail={emptyDetail} />;

  return (
    <FlashList
      data={items}
      numColumns={columns}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => (
        <View style={{ width: itemWidth, marginRight: (index + 1) % columns === 0 ? 0 : space.md }}>
          <PosterCard
            title={item.title}
            image={item.image}
            caption={item.caption}
            width={itemWidth}
            recyclingKey={item.id}
            priority={index < columns * 2 ? 'normal' : 'low'}
            onPress={() => onSelect(item.id)}
          />
        </View>
      )}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={() => <View style={styles.rowGap} />}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={isFetchingMore ? <FooterSpinner /> : <View style={styles.footer} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );
}

function FooterSpinner() {
  return (
    <View style={styles.spinner}>
      <LoadingState />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter },
  rowGap: { height: space.xl },
  footer: { height: space.xxxl },
  spinner: { height: 80 },
});
