import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { color, gutter, hairline, space, touchTarget } from '@/design/tokens';

export interface ProviderOption {
  id: string;
  name: string;
}

export interface ProviderPickerProps {
  providers: ProviderOption[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
}

/**
 * Which player to use, as one row under the episode title.
 *
 * Deliberately not a settings screen and not a modal: switching player is
 * something a viewer does when the current one fails, so it has to be reachable
 * without leaving playback. The selected name carries the purple underline used
 * for selection everywhere else.
 *
 * Renders nothing when there is only one player, since a choice of one is not a
 * choice.
 */
export function ProviderPicker({ providers, activeId, onSelect }: ProviderPickerProps) {
  if (providers.length < 2) return null;

  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel="Player">
      <Text variant="meta" tone="faint" style={styles.label}>
        Player
      </Text>

      {providers.map((provider) => {
        const selected = provider.id === activeId;

        return (
          <Pressable
            key={provider.id}
            onPress={() => onSelect(provider.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={provider.name}
            style={({ pressed }) => [
              styles.item,
              selected && styles.itemSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text variant="meta" tone={selected ? 'default' : 'muted'}>
              {provider.name}
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
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingBottom: space.sm,
    backgroundColor: color.bg,
    borderBottomWidth: hairline,
    borderBottomColor: color.line,
  },
  label: { marginRight: space.md },
  item: {
    minHeight: touchTarget - 14,
    justifyContent: 'center',
    marginRight: space.lg,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  itemSelected: { borderBottomColor: color.accentBright },
  pressed: { opacity: 0.6 },
});
