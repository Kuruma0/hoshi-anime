import { FlashList } from '@shopify/flash-list';
import { Pressable, StyleSheet, View } from 'react-native';
import { Artwork } from './Artwork';
import { SectionHeader } from './SectionHeader';
import { Text } from '@/design/Text';
import { aspect, color, gutter, posterWidth, sectionGap, space } from '@/design/tokens';
import type { Image as DomainImage } from '@/domain/common';

export interface ContinueItem {
  id: string;
  title: string;
  image?: DomainImage;
  /** e.g. "Episode 4" or "Chapter 12". */
  position: string;
  /** 0..1. Rendered as a thin bar under the artwork. */
  fraction: number;
}

export interface ContinueRowProps {
  title: string;
  items: ContinueItem[];
  onSelect: (id: string) => void;
}

const ITEM_WIDTH = 148;

/**
 * Continue Watching / Continue Reading.
 *
 * Wider and shorter than a poster rail, a 16:9 crop reads as "resume" rather
 * than "browse", which keeps it visually distinct from the discovery rails
 * directly beneath it. Progress is a 2px bar, the least decoration that still
 * communicates how far in you are.
 */
export function ContinueRow({ title, items, onSelect }: ContinueRowProps) {
  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <FlashList
        horizontal
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Resume ${item.title}, ${item.position}`}
            style={({ pressed }) => [{ width: ITEM_WIDTH }, pressed && styles.pressed]}
          >
            <Artwork
              image={item.image}
              width={ITEM_WIDTH}
              ratio={aspect.thumb}
              thumbnail
              recyclingKey={item.id}
            />
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${Math.min(100, Math.max(2, item.fraction * 100))}%` },
                ]}
              />
            </View>
            <Text variant="meta" numberOfLines={1} style={styles.title}>
              {item.title}
            </Text>
            <Text variant="meta" tone="faint" numberOfLines={1}>
              {item.position}
            </Text>
          </Pressable>
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: sectionGap },
  list: { paddingHorizontal: gutter },
  separator: { width: space.md },
  pressed: { opacity: 0.65 },
  track: { height: 2, backgroundColor: color.line },
  fill: { height: 2, backgroundColor: color.accentBright },
  title: { marginTop: space.sm },
});
