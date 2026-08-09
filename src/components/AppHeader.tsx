import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/design/Text';
import { color, gutter, hairline, space, touchTarget } from '@/design/tokens';
import { routes } from '@/lib/routes';

export interface AppHeaderProps {
  /** Optional single trailing action. A second one starts to feel like a toolbar. */
  actionLabel?: string;
  onAction?: () => void;
  /** Screen name shown beside the wordmark. Omitted on the gateway. */
  context?: string;
}

/**
 * The persistent Hoshi.anime header.
 *
 * Rendered as a sibling of the page's scroll view rather than inside it, which
 * is what actually pins it — a header scrolled as list content cannot stay put
 * no matter how it is styled.
 *
 * Kept to one text row plus the safe-area inset: it is a wordmark, not a
 * navigation bar, and it should cost as little vertical space as possible on a
 * phone.
 */
export function AppHeader({ actionLabel, onAction, context }: AppHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <Pressable
        onPress={() => router.push(routes.home())}
        accessibilityRole="button"
        accessibilityLabel="Hoshi.anime, go to home"
        hitSlop={space.sm}
        style={({ pressed }) => [styles.brand, pressed && styles.pressed]}
      >
        <Text variant="bodyStrong" style={styles.wordmark}>
          hoshi
          <Text variant="bodyStrong" tone="accent">
            .
          </Text>
          anime
        </Text>
      </Pressable>

      {context ? (
        <>
          <View style={styles.separator} />
          <Text variant="meta" tone="faint" numberOfLines={1} style={styles.context}>
            {context}
          </Text>
        </>
      ) : (
        <View style={styles.spacer} />
      )}

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={space.md}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text variant="meta" tone="accent" caps>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingBottom: space.sm,
    backgroundColor: color.bg,
    borderBottomWidth: hairline,
    borderBottomColor: color.line,
  },
  brand: { justifyContent: 'center', minHeight: touchTarget - 12 },
  wordmark: { letterSpacing: 0.2 },
  separator: {
    width: hairline,
    height: 12,
    backgroundColor: color.lineStrong,
    marginHorizontal: space.md,
  },
  context: { flex: 1 },
  spacer: { flex: 1 },
  action: { justifyContent: 'center', paddingLeft: space.md },
  pressed: { opacity: 0.6 },
});
