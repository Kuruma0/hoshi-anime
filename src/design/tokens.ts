/**
 * Hoshi.Anime design tokens.
 *
 * The visual rules live here as values, not as prose in a README, so that
 * drifting away from them requires editing this file on purpose.
 *
 * Three rules this file encodes and the rest of the app must respect:
 *   1. No shadows. Elevation is background value + a 1px hairline. Nothing else.
 *   2. Radius is 2 on artwork and 0 everywhere else. There are no pills.
 *   3. Purple is punctuation. `accent` marks actions, `accentBright` marks the
 *      single focused/selected thing on screen. Neither is a surface colour.
 */

export const color = {
  /** Near-black with the faintest purple cast. The default background. */
  bg: '#0B0910',
  /** Secondary surfaces: sheets, input fields, inactive segments. */
  surface: '#131019',
  /** Raised surfaces: pressed states, reader chrome. */
  surfaceRaised: '#1A1622',
  /** Hairline dividers. Always 1px, never a border on all four sides. */
  line: '#241E30',
  /** Slightly stronger hairline for active/selected edges. */
  lineStrong: '#332A45',

  /** Muted purple. Primary actions: WATCH, READ, active tab label. */
  accent: '#6D4AA8',
  /** Brighter purple. Selection, focus, active-day marker. Used sparingly. */
  accentBright: '#A47BF0',
  /** Pressed state for accent surfaces. */
  accentPressed: '#5A3D8C',

  /** Primary text. Near-white, never pure white. */
  text: '#F2EFF7',
  /** Secondary text. 4.6:1 against `bg`. */
  textMuted: '#8B849B',
  /** Tertiary text: timestamps, page counters. 3.1:1, large/bold use only. */
  textFaint: '#5E5870',
  /** Text on top of an accent fill. */
  textOnAccent: '#FFFFFF',

  /** Error / destructive. Desaturated so it does not fight the purple. */
  danger: '#C05A6E',

  /** Placeholder fill shown behind artwork while it decodes. */
  imagePlaceholder: '#181320',

  /** Scrim over hero artwork. Functional (legibility), not decorative. */
  scrimTop: 'rgba(11, 9, 16, 0)',
  scrimBottom: 'rgba(11, 9, 16, 1)',

  /** Full-bleed reader/player background. Pure black for OLED and contrast. */
  immersive: '#000000',
} as const;

/** 4pt base scale. Anything not on this scale is a mistake. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Horizontal screen gutter. Content aligns to this on every screen. */
export const gutter = 20;

/** Vertical rhythm between major sections. */
export const sectionGap = 32;

export const radius = {
  /** Artwork only. */
  artwork: 2,
  /** Everything else. Buttons are rectangles. */
  none: 0,
} as const;

export const hairline = 1;

/**
 * Type scale. Hierarchy comes from size and weight, never from colour alone
 * and never from a decorative font.
 */
export const type = {
  display: { fontSize: 30, lineHeight: 34, fontWeight: '700' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  subtitle: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  /** Section headers. Rendered uppercase with tracking by <SectionHeader>. */
  section: { fontSize: 13, lineHeight: 16, fontWeight: '600', letterSpacing: 1.04 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: 0.6 },
} as const;

/** Artwork aspect ratios. Posters and covers are both 2:3. */
export const aspect = {
  poster: 2 / 3,
  banner: 16 / 9,
  thumb: 16 / 9,
} as const;

/** Poster widths per context. Heights derive from `aspect.poster`. */
export const posterWidth = {
  /** Horizontal discovery rows. */
  row: 118,
  /** Browse/search grids; computed per screen, this is the floor. */
  gridMin: 104,
  /** Detail page hero poster. */
  detail: 132,
  /** Compact list rows (library, continue watching). */
  list: 56,
} as const;

/**
 * Motion. Short, few, and never blocking navigation.
 * `reduced` is substituted wholesale when the OS reports reduce-motion.
 */
export const motion = {
  /** Image fade-in once decoded. */
  imageFade: 180,
  /** Screen and shared-element transitions. */
  transition: 220,
  /** Tab crossfade, segment slide. */
  swap: 200,
  /** Press feedback. */
  press: 90,
  reduced: 0,
} as const;

/** Minimum touch target. Enforced on every interactive element. */
export const touchTarget = 44;

export type Color = keyof typeof color;
export type Space = keyof typeof space;
