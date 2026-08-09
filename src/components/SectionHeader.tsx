import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { gutter, space, touchTarget } from '@/design/tokens';

export interface SectionHeaderProps {
  title: string;
  /** Optional trailing affordance. Omit unless there is genuinely more to see. */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Small uppercase label above a content rail.
 *
 * The tracked, muted treatment is what lets sections read as structure without
 * needing a card or a divider around each one.
 */
export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant="section" tone="muted" caps accessibilityRole="header">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}, ${title}`}
          hitSlop={space.md}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text variant="meta" tone="accent">
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    marginBottom: space.md,
  },
  action: { minHeight: touchTarget / 2, justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
