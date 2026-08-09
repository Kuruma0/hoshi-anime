import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { gutter, space, touchTarget } from '@/design/tokens';

export interface ScreenHeaderProps {
  title: string;
  /** At most one. A second control here starts to feel like a toolbar. */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Large screen title, rendered in the scroll content rather than in a nav bar
 * so it scrolls away and gives the artwork the full screen.
 */
export function ScreenHeader({ title, actionLabel, onAction }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant="display" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  title: { letterSpacing: -0.5, flexShrink: 1 },
  action: { minHeight: touchTarget / 2, justifyContent: 'center', paddingLeft: space.md },
  pressed: { opacity: 0.6 },
});
