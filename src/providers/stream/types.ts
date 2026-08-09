/**
 * Shared playback types.
 *
 * Every embed provider reports progress in its own shape. These types are the
 * common ground: a provider supplies a bridge script and a parser, and the
 * player screen deals only in `PlaybackProgress`. That is what keeps the anime
 * UI from knowing which provider is playing (§7, §16).
 */

/** Progress as the application understands it, whoever produced it. */
export interface PlaybackProgress {
  /** Seconds into the episode. */
  positionSeconds: number;
  /** Total runtime, when the player reports it. */
  durationSeconds?: number;
  /** Episode the player believes it is on, when it says so. */
  episodeNumber?: number;
  /** True once the player reports the episode finished. */
  completed?: boolean;
  /**
   * Whether this update should be written immediately rather than throttled.
   * Pauses, seeks and completion are worth persisting at once; ticks are not.
   */
  checkpoint?: boolean;
}

/**
 * What the player screen needs in order to host one provider's embed.
 *
 * `bridge` is injected into the WebView and forwards the provider's own
 * postMessage traffic to React Native; `parseProgress` turns a forwarded
 * message into `PlaybackProgress`, returning undefined for anything it does not
 * recognise. The channel carries unrelated traffic, so silent rejection is the
 * correct behaviour rather than throwing.
 */
export interface EmbedRuntime {
  readonly providerId: string;
  readonly bridge: string;
  /**
   * Query parameter this player uses to start at a position, in seconds.
   * Providers disagree on the name, so the screen asks rather than assumes.
   */
  readonly resumeParam: string;
  parseProgress(raw: string): PlaybackProgress | undefined;
}

/**
 * Apply a resume position to an embed URL.
 *
 * Kept separate from resolution so the resolved target stays cacheable while
 * the position keeps moving; recomputing the URL mid-playback would reload the
 * WebView and restart the episode.
 */
export function withResume(
  url: string,
  runtime: EmbedRuntime | undefined,
  positionSeconds: number
): string {
  if (!runtime || positionSeconds <= 5) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${runtime.resumeParam}=${Math.floor(positionSeconds)}`;
}
