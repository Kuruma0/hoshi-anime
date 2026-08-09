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
