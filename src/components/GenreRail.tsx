import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/design/Text';
import { gutter, sectionGap, space, touchTarget } from '@/design/tokens';
import { SectionHeader } from './SectionHeader';

export interface GenreRailProps {
  genres: string[];
  onSelect: (genre: string) => void;
  title?: string;
}

/**
 * Genres as typography, not as pills.
 *
 * §21 calls out excessive pill-shaped elements specifically. A row of bordered
 * capsules would also add nineteen rounded rectangles to a screen that is
 * otherwise flat, so these are plain words separated by space.
 */
export function GenreRail({ genres, onSelect, title = 'Genres' }: GenreRailProps) {
  if (genres.length === 0) return null;

  return (
    <>
      <SectionHeader title={title} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        style={styles.rail}
      >
        {genres.map((genre) => (
          <Pressable
            key={genre}
            onPress={() => onSelect(genre)}
            accessibilityRole="button"
            accessibilityLabel={`Browse ${genre}`}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <Text variant="body">{genre}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  rail: { marginBottom: sectionGap },
  content: { paddingHorizontal: gutter, alignItems: 'center' },
  item: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingRight: space.xl,
  },
  pressed: { opacity: 0.55 },
});
