import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';
import { aspect, gutter, posterWidth, sectionGap, space } from '@/design/tokens';
import { PosterCard } from './PosterCard';
import { SectionHeader } from './SectionHeader';
import { InlineState } from './StateViews';
import type { Image as DomainImage } from '@/domain/common';

export interface RowItem {
  id: string;
  title: string;
  image?: DomainImage;
  caption?: string;
}

export interface ContentRowProps {
  title: string;
  items: RowItem[];
  onSelect: (id: string) => void;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onSeeAll?: () => void;
  /** Fetch the next page when the rail is scrolled near its end. */
  onEndReached?: () => void;
}

const ITEM_WIDTH = posterWidth.row;
/** Artwork + two lines of text. Fixed so state placeholders match exactly. */
const ROW_HEIGHT = Math.round(ITEM_WIDTH / aspect.poster) + 46;

/**
 * A horizontal discovery rail.
 *
 * Virtualized because an anime home screen holds six of these and rendering
 * every off-screen poster is what makes a media app stutter on mid-range
 * hardware. Loading, empty and error all render at the rail's exact height so
 * the page below never jumps as sections resolve independently.
 */
export function ContentRow({
  title,
  items,
  onSelect,
  isLoading,
  error,
  onRetry,
  onSeeAll,
  onEndReached,
}: ContentRowProps) {
  const showState = isLoading || error || items.length === 0;

  return (
    <View style={styles.section}>
      <SectionHeader
        title={title}
        // Only offered when the provider actually reported more to show.
        actionLabel={onSeeAll && !showState ? 'See more' : undefined}
        onAction={onSeeAll}
      />

      {showState ? (
        <InlineState
          height={ROW_HEIGHT}
          state={isLoading ? 'loading' : error ? 'error' : 'empty'}
          error={error}
          onRetry={onRetry}
        />
      ) : (
        <FlashList
          horizontal
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <PosterCard
              title={item.title}
              image={item.image}
              caption={item.caption}
              width={ITEM_WIDTH}
              recyclingKey={item.id}
              // Only the first screenful competes for bandwidth at high priority.
              priority={index < 4 ? 'normal' : 'low'}
              onPress={() => onSelect(item.id)}
            />
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={Separator}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
        />
      )}
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  section: { marginBottom: sectionGap },
  list: { paddingHorizontal: gutter },
  separator: { width: space.md },
});
