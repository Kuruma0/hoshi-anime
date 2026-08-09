import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { color, hairline, space, touchTarget } from '@/design/tokens';

export interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

/**
 * Two-to-four way switch, used for Anime/Manga and library tabs.
 *
 * Selection is marked by a purple underline rather than a filled pill — it
 * reads as navigation instead of a control, and keeps purple as punctuation.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedProps<T>) {
  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={({ pressed }) => [
              styles.item,
              selected && styles.itemSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text variant="meta" tone={selected ? 'default' : 'muted'} caps>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderBottomWidth: hairline,
    borderBottomColor: color.line,
  },
  item: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    // Reserve the selected underline's space so switching does not shift text.
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -hairline,
  },
  itemSelected: { borderBottomColor: color.accentBright },
  pressed: { opacity: 0.6 },
});
