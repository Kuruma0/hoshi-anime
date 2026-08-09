/**
 * Playback providers.
 *
 * Playback is deliberately a separate concern from the anime catalogue: the
 * metadata provider (AniList) and the player (VidKing) have different
 * availability and different identifier spaces, and coupling them is what makes
 * either hard to replace.
 *
 * Adding an alternative player means another class implementing
 * `AnimeStreamProvider` and one line in registry.ts.
 */
export {
  parseVidKingEvent,
  VIDKING_EVENT_BRIDGE,
  VidKingProvider,
  type VidKingEvent,
  type VidKingEventName,
} from './vidking';

/**
 * Playback interruption control. Isolated here rather than spread through the
 * anime screens, so the player surface asks one question, "may I navigate
 * there?"; and nothing else in the app knows about it.
 */
export {
  allowNavigation,
  createNavigationPolicy,
  type NavigationPolicy,
  type NavigationRequest,
} from './playbackPolicy';
