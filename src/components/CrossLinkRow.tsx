import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { color, gutter, hairline, space, touchTarget } from '@/design/tokens';

export interface CrossLinkRowProps {
  /** e.g. "Read the manga" / "Watch the anime". */
  label: string;
  /** The matched title, so the user can tell it is the right work. */
  targetTitle: string;
  onPress: () => void;
  /**
   * When the link was resolved by title rather than by a published id, say so.
   * A confident-looking link to the wrong work is worse than a hedged one.
   */
  approximate?: boolean;
}

/**
 * The bridge between an anime and its manga.
 *
 * A single row rather than a card: it is a navigation affordance sitting in the
 * run of the page, and it only renders when a counterpart was actually
 * identified — no dead "not available" state.
 */
export function CrossLinkRow({
  label,
  targetTitle,
  onPress,
  approximate,
}: CrossLinkRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${targetTitle}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text variant="body">{label}</Text>
        <Text variant="meta" tone="faint" numberOfLines={1}>
          {targetTitle}
          {approximate ? ' · matched by title' : ''}
        </Text>
      </View>
      <Text variant="meta" tone="accent" caps>
        Open
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget + 8,
    paddingHorizontal: gutter,
    paddingVertical: space.md,
    borderTopWidth: hairline,
    borderTopColor: color.line,
    borderBottomWidth: hairline,
    borderBottomColor: color.line,
  },
  text: { flex: 1, marginRight: space.md },
  pressed: { backgroundColor: color.surface },
});
