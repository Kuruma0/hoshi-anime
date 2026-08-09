import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { color, type } from './tokens';

type Variant = keyof typeof type;
type Tone = 'default' | 'muted' | 'faint' | 'accent' | 'onAccent' | 'danger';

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  /** Renders uppercase. Used by section headers; avoid elsewhere. */
  caps?: boolean;
}

const TONE_COLOR: Record<Tone, string> = {
  default: color.text,
  muted: color.textMuted,
  faint: color.textFaint,
  accent: color.accentBright,
  onAccent: color.textOnAccent,
  danger: color.danger,
};

/**
 * The only text primitive.
 *
 * Every string in the app goes through here, so the type scale in tokens.ts is
 * the actual type scale rather than an aspiration. `allowFontScaling` stays on
 * (RN's default) so OS text-size settings work.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  caps,
  style,
  children,
  ...rest
}: TextProps) {
  return (
    <RNText
      {...rest}
      style={[
        styles[variant],
        { color: TONE_COLOR[tone] },
        caps && styles.caps,
        style,
      ]}
    >
      {caps && typeof children === 'string' ? children.toUpperCase() : children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  display: type.display,
  title: type.title,
  subtitle: type.subtitle,
  section: type.section,
  body: type.body,
  bodyStrong: type.bodyStrong,
  meta: type.meta,
  button: type.button,
  caps: { textTransform: 'uppercase' },
});
