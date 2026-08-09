/**
 * Auto-advance rules for the trending carousel.
 *
 * Kept out of the component so the behaviour is unit tested. The scroll itself
 * is a native side effect, and on web the underlying smooth scroll is disabled
 * in automated browsers, so this logic is not otherwise observable in a test.
 */

/** The slide to show next, wrapping at the end. */
export function nextSlideIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  return (current + 1) % count;
}

export interface AdvanceConditions {
  /** A finger is down, or was recently. */
  interacting: boolean;
  /** The OS has asked for reduced motion. */
  reduceMotion: boolean;
  slideCount: number;
}

/** Whether the carousel should move on this tick. */
export function shouldAdvance({
  interacting,
  reduceMotion,
  slideCount,
}: AdvanceConditions): boolean {
  // Reduced motion outranks everything else.
  if (reduceMotion) return false;
  // Moving a slide out from under a finger is what makes auto carousels feel
  // hostile, so an interaction always wins over the timer.
  if (interacting) return false;
  return slideCount > 1;
}
