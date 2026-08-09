import { describe, expect, it } from 'vitest';
import { nextSlideIndex, shouldAdvance } from './carousel';

describe('nextSlideIndex', () => {
  it('advances one slide at a time', () => {
    expect(nextSlideIndex(0, 8)).toBe(1);
    expect(nextSlideIndex(3, 8)).toBe(4);
  });

  it('wraps at the end rather than stopping', () => {
    expect(nextSlideIndex(7, 8)).toBe(0);
  });

  it('stays put with a single slide', () => {
    expect(nextSlideIndex(0, 1)).toBe(0);
  });

  it('handles an empty carousel', () => {
    expect(nextSlideIndex(0, 0)).toBe(0);
  });
});

describe('shouldAdvance', () => {
  const base = { interacting: false, reduceMotion: false, slideCount: 8 };

  it('advances when idle', () => {
    expect(shouldAdvance(base)).toBe(true);
  });

  it('holds while the viewer is handling the carousel', () => {
    // Moving a slide out from under a finger is what makes auto carousels
    // feel hostile.
    expect(shouldAdvance({ ...base, interacting: true })).toBe(false);
  });

  it('never advances when the OS asks for reduced motion', () => {
    expect(shouldAdvance({ ...base, reduceMotion: true })).toBe(false);
    // Reduced motion outranks everything else.
    expect(shouldAdvance({ ...base, reduceMotion: true, interacting: false })).toBe(false);
  });

  it('does not animate a carousel of one', () => {
    expect(shouldAdvance({ ...base, slideCount: 1 })).toBe(false);
    expect(shouldAdvance({ ...base, slideCount: 0 })).toBe(false);
  });
});

