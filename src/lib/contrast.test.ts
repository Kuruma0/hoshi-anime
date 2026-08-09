import { describe, expect, it } from 'vitest';
import { parseHexColor, prefersDarkForeground, relativeLuminance } from './contrast';

describe('parseHexColor', () => {
  it('parses six-digit hex with and without a hash', () => {
    expect(parseHexColor('#d6e4a1')).toEqual({ r: 214, g: 228, b: 161 });
    expect(parseHexColor('d6e4a1')).toEqual({ r: 214, g: 228, b: 161 });
  });

  it('expands shorthand hex', () => {
    expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('returns undefined for anything unparseable', () => {
    expect(parseHexColor(undefined)).toBeUndefined();
    expect(parseHexColor(null)).toBeUndefined();
    expect(parseHexColor('')).toBeUndefined();
    expect(parseHexColor('rgb(1,2,3)')).toBeUndefined();
    expect(parseHexColor('#12345')).toBeUndefined();
  });
});

describe('relativeLuminance', () => {
  it('places black and white at the extremes', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });

  it('weights green above red above blue', () => {
    const green = relativeLuminance({ r: 0, g: 255, b: 0 });
    const red = relativeLuminance({ r: 255, g: 0, b: 0 });
    const blue = relativeLuminance({ r: 0, g: 0, b: 255 });

    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });
});

describe('prefersDarkForeground', () => {
  it('asks for a dark control over pale artwork', () => {
    expect(prefersDarkForeground('#ffffff')).toBe(true);
    // A real AniList cover colour — pale yellow-green.
    expect(prefersDarkForeground('#d6e4a1')).toBe(true);
  });

  it('asks for a light control over dark artwork', () => {
    expect(prefersDarkForeground('#000000')).toBe(false);
    expect(prefersDarkForeground('#1a1622')).toBe(false);
  });

  it('does not call a saturated blue light', () => {
    // Averaging channels would report ~0.33 and wrongly flip the glyph dark.
    expect(prefersDarkForeground('#0000ff')).toBe(false);
  });

  it('defaults to a light control when no colour is known', () => {
    // The app is dark, so light-on-dark is the safe default.
    expect(prefersDarkForeground(undefined)).toBe(false);
    expect(prefersDarkForeground('not-a-colour')).toBe(false);
  });
});
