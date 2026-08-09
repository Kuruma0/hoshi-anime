import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/design/Text';
import { color, gutter, hairline, radius, space, touchTarget, type } from '@/design/tokens';

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Search input.
 *
 * A rectangle on a slightly lighter surface with a hairline underline — no
 * rounded capsule, no magnifier icon. The placeholder says what it is.
 */
export function SearchBar({ value, onChange, placeholder = 'Search', autoFocus }: SearchBarProps) {
  return (
    <View style={styles.wrapper}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={color.textFaint}
        style={styles.input}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        selectionColor={color.accentBright}
        accessibilityLabel={placeholder}
        // Titles are searched in Japanese and romaji as often as English.
        keyboardType="default"
        clearButtonMode="never"
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={space.md}
          style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
        >
          <Text variant="meta" tone="muted">
            Clear
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: gutter,
    backgroundColor: color.surface,
    borderBottomWidth: hairline,
    borderBottomColor: color.lineStrong,
    borderRadius: radius.none,
    paddingHorizontal: space.md,
  },
  input: {
    flex: 1,
    minHeight: touchTarget,
    color: color.text,
    fontSize: type.body.fontSize,
    padding: 0,
  },
  clear: { paddingLeft: space.md },
  pressed: { opacity: 0.6 },
});
