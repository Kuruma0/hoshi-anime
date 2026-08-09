/**
 * Contrast helpers.
 *
 * Used to decide whether a control floating over artwork should be drawn light
 * or dark. The metadata provider publishes a dominant colour per cover, so this
 * is a real decision based on the image rather than a fixed guess that fails on
 * half the catalogue.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse `#rrggbb` or `#rgb`. Returns undefined for anything else. */
export function parseHexColor(hex: string | undefined | null): Rgb | undefined {
  if (!hex) return undefined;

  const value = hex.trim().replace(/^#/, '');
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return undefined;

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

/**
 * Relative luminance, per WCAG.
 *
 * Not a simple channel average: the eye is far more sensitive to green than to
 * blue, so averaging would call a saturated blue "light" and put a dark glyph
 * on it.
 */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Whether a control over this colour should be drawn dark.
 *
 * The threshold sits above the midpoint because these controls also carry a
 * scrim, which darkens the backdrop — assuming a bare background would flip the
 * glyph to dark too eagerly on mid-tone artwork.
 */
export function prefersDarkForeground(hex: string | undefined | null): boolean {
  const rgb = parseHexColor(hex);
  if (!rgb) return false;
  return relativeLuminance(rgb) > 0.6;
}
