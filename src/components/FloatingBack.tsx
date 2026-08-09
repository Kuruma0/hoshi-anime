import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text as RNText } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, gutter, space, touchTarget } from '@/design/tokens';
import { prefersDarkForeground } from '@/lib/contrast';

export interface FloatingBackProps {
  /** Dominant colour of the artwork behind the control, as `#rrggbb`. */
  backdropColor?: string;
}

/**
 * Back control that floats over artwork.
 *
 * Replaces an opaque navigation bar so the hero image runs to the top of the
 * screen uninterrupted. The glyph flips between light and dark based on the
 * artwork's own dominant colour, and sits on a small scrim so it stays legible
 * over a busy image regardless.
 *
 * Deliberately not a full-width bar and not a circle with a shadow; it is one
 * glyph on the smallest scrim that keeps it readable.
 */
export function FloatingBack({ backdropColor }: FloatingBackProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const dark = prefersDarkForeground(backdropColor);

  return (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={space.md}
      style={({ pressed }) => [
        styles.button,
        { top: insets.top + space.sm },
        dark ? styles.onLight : styles.onDark,
        pressed && styles.pressed,
      ]}
    >
      <RNText style={[styles.glyph, { color: dark ? color.bg : color.text }]}>‹</RNText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    left: gutter,
    zIndex: 10,
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Scrims, not fills: enough to separate the glyph from the artwork without
  // reading as a button chrome.
  onDark: { backgroundColor: 'rgba(11,9,16,0.55)' },
  onLight: { backgroundColor: 'rgba(242,239,247,0.65)' },
  glyph: { fontSize: 30, lineHeight: 34, fontWeight: '400', marginTop: -4 },
  pressed: { opacity: 0.7 },
});
