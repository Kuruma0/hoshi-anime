import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SectionHeader } from './SectionHeader';
import { Text } from '@/design/Text';
import { color, gutter, hairline, space, touchTarget } from '@/design/tokens';
import type { SeasonEntry } from '@/domain/relations';

export interface SeasonSelectorProps {
  seasons: SeasonEntry[];
  onSelect: (id: string) => void;
}

/**
 * Jump between seasons of the same series.
 *
 * The chain comes from the provider's prequel/sequel graph, so "Season 2" here
 * means the entry the provider links to — not a title that happens to end in a
 * 2. Renders nothing for a standalone show.
 */
export function SeasonSelector({ seasons, onSelect }: SeasonSelectorProps) {
  if (seasons.length < 2) return null;

  return (
    <>
      <SectionHeader title="Seasons" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {seasons.map((season) => (
          <Pressable
            key={season.id}
            onPress={() => !season.current && onSelect(season.id)}
            disabled={season.current}
            accessibilityRole="button"
            accessibilityState={{ selected: season.current }}
            accessibilityLabel={`Season ${season.number}${season.year ? `, ${season.year}` : ''}${season.current ? ', current' : ''}`}
            style={({ pressed }) => [
              styles.item,
              season.current && styles.itemCurrent,
              pressed && !season.current && styles.pressed,
            ]}
          >
            <Text variant="meta" tone={season.current ? 'accent' : 'muted'} caps>
              Season {season.number}
            </Text>
            <Text
              variant="meta"
              tone={season.current ? 'default' : 'faint'}
              numberOfLines={1}
              style={styles.title}
            >
              {season.year ? String(season.year) : season.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: gutter, paddingBottom: space.sm },
  item: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingRight: space.xl,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: space.md,
  },
  itemCurrent: { borderBottomColor: color.accentBright },
  title: { marginTop: 2 },
  pressed: { opacity: 0.55 },
});

export const seasonDivider = hairline;
