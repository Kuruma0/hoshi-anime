import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { color, hairline, radius, space, touchTarget } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Fills the available width. Used for the single dominant action. */
  block?: boolean;
  /** Small leading glyph. Reserved for play/back — not decoration. */
  glyph?: string;
  style?: ViewStyle;
  accessibilityHint?: string;
}

/**
 * Buttons are rectangles.
 *
 * No border radius, no shadow, no gradient — the visual weight comes from fill
 * and contrast alone. `primary` is the one purple fill on a screen; anything
 * else uses `secondary` (hairline outline) or `ghost` (text only).
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  block,
  glyph,
  style,
  accessibilityHint,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        block && styles.block,
        pressed && !disabled && PRESSED[variant],
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {glyph ? (
          <Text
            variant="button"
            tone={variant === 'primary' ? 'onAccent' : 'default'}
            style={styles.glyph}
          >
            {glyph}
          </Text>
        ) : null}
        <Text variant="button" tone={variant === 'primary' ? 'onAccent' : 'default'}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const PRESSED: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: color.accentPressed },
  secondary: { backgroundColor: color.surfaceRaised },
  ghost: { opacity: 0.6 },
};

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.none,
  },
  content: { flexDirection: 'row', alignItems: 'center' },
  glyph: { marginRight: space.sm },
  primary: { backgroundColor: color.accent },
  secondary: { borderWidth: hairline, borderColor: color.lineStrong },
  ghost: { paddingHorizontal: space.sm },
  block: { alignSelf: 'stretch' },
  disabled: { opacity: 0.4 },
});
