/**
 * Playback providers.
 *
 * Playback is deliberately a separate concern from the anime catalogue: the
 * metadata provider (AniList) and the players have different availability and
 * different identifier spaces, and coupling them is what makes either hard to
 * replace.
 *
 * The service tries VidLink first and falls back to VidKing. Adding a third
 * player means another class implementing `AnimeStreamProvider`, its runtime,
 * and one entry in registry.ts.
 */
export { PlaybackService, isPlayable } from './playbackService';
export type { EmbedRuntime, PlaybackProgress } from './types';

export {
  parseVidLinkProgress,
  VIDLINK_EVENT_BRIDGE,
  VIDLINK_RUNTIME,
  VidLinkProvider,
  type AudioTrack,
} from './vidlink';

export {
  parseVidKingEvent,
  parseVidKingProgress,
  VIDKING_EVENT_BRIDGE,
  VIDKING_RUNTIME,
  VidKingProvider,
  type VidKingEvent,
  type VidKingEventName,
} from './vidking';
