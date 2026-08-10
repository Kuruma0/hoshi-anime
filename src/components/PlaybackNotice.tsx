import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { color, gutter, hairline, space, touchTarget } from '@/design/tokens';

/**
 * What to do when an advertisement appears before the episode.
 *
 * The player shows its own pre-roll and offers no supported way for an
 * embedder to skip or close it, so this explains the behaviour rather than
 * pretending to control it. A button that only hid our own chrome while the
 * advertisement kept running would be a lie.
 *
 * Dismissible, and it stays dismissed for the session, because a warning shown
 * on every episode stops being information and becomes noise.
 */
export function PlaybackNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <View style={styles.notice}>
      <Text variant="meta" tone="muted" style={styles.text}>
        If an advert plays first, close or skip it and re-open the player to
        start the episode. If it still will not load, try another source.
      </Text>

      <Pressable
        onPress={() => setDismissed(true)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss playback notice"
        hitSlop={space.sm}
        style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
      >
        <Text variant="meta" tone="faint">
          Got it
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: gutter,
    paddingVertical: space.sm,
    backgroundColor: color.bg,
    borderBottomWidth: hairline,
    borderBottomColor: color.line,
  },
  text: { flex: 1, marginRight: space.md },
  dismiss: { minHeight: touchTarget / 2, justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
