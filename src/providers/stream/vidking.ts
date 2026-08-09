import type { Anime, Episode } from '@/domain/anime';
import { parseId } from '@/domain/common';
import { ProviderError } from '@/lib/errors';
import { ArmMappingClient } from '../mapping/arm';
import type { AnimeStreamProvider, PlaybackTarget, StreamOption } from '../types';

/**
 * VidKing playback.
 *
 * Documented embed player, addressed by TheMovieDB id:
 *   https://www.vidking.net/embed/tv/{tmdbId}/{season}/{episode}
 *   https://www.vidking.net/embed/movie/{tmdbId}
 *
 * Verified parameters: `color` (hex, no #), `autoPlay`, `nextEpisode`,
 * `episodeSelector`, `progress` (resume position in seconds).
 *
 * The player reports playback over `postMessage`; see `VIDKING_EVENT_BRIDGE`
 * below, which is what makes real watch-progress tracking possible rather than
 * inferring progress from the user having tapped an episode.
 *
 * ── On advertisements ──
 *
 * The published embed surface exposes exactly the five parameters above. There
 * is no ad-related parameter, no documented ad-free mode, and no player
 * configuration covering advertising — the parameter list was checked against
 * the provider's own documentation, not assumed.
 *
 * Suppressing ads would therefore mean injecting scripts into, or filtering
 * requests made by, a third-party player in order to alter what it serves. That
 * is tampering with someone else's content delivery, it is not something the
 * provider offers a supported route for, and any such rule set breaks the first
 * time the player's markup changes — taking playback down with it.
 *
 * So it is deliberately not attempted. The parameters that *are* supported are
 * used to keep playback as uninterrupted as the embed allows: `autoPlay` is off
 * (mobile WebViews block unattended autoplay, and a player that silently fails
 * to start reads as broken) and `episodeSelector` is off so the player does not
 * present navigation competing with the app's own episode list.
 */

const EMBED_BASE = 'https://www.vidking.net/embed';

/** Player accent, matched to the app's own. Hex without the leading '#'. */
const PLAYER_COLOR = '6D4AA8';

export class VidKingProvider implements AnimeStreamProvider {
  readonly id = 'vidking';
  readonly name = 'VidKing';
  readonly attribution = 'Playback by VidKing';
  readonly kind = 'embed' as const;

  constructor(private readonly mapping: ArmMappingClient) {}

  isAvailable(): boolean {
    return true;
  }

  async listOptions(): Promise<StreamOption[]> {
    // One player, one stream per episode. VidKing exposes no quality or
    // audio-track selection to the embedder, so advertising choices here would
    // be inventing them.
    return [{ id: 'default', label: this.name }];
  }

  async resolve(
    anime: Anime,
    episode: Episode,
    _optionId?: string,
    signal?: AbortSignal
  ): Promise<PlaybackTarget> {
    const anilistId = numericId(anime.id);
    const target = await this.mapping.resolveTmdb(anilistId, signal);

    if (!target) {
      throw new ProviderError(
        'notFound',
        this.id,
        'No player mapping exists for this title yet.'
      );
    }

    const url = target.isMovie
      ? `${EMBED_BASE}/movie/${target.tmdbId}?${movieParams()}`
      : `${EMBED_BASE}/tv/${target.tmdbId}/${target.season}/${episode.number}?${seriesParams()}`;

    return { kind: 'embed', url, referer: 'https://www.vidking.net' };
  }

  /**
   * Same URL with a resume position applied.
   *
   * Kept separate from `resolve` so the PlaybackTarget stays cacheable — the
   * resume offset changes every few seconds and would otherwise bust the cache
   * on every progress tick.
   */
  withResume(url: string, positionSeconds: number): string {
    if (positionSeconds <= 5) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}progress=${Math.floor(positionSeconds)}`;
  }
}

function seriesParams(): string {
  return new URLSearchParams({
    color: PLAYER_COLOR,
    // Autoplay is blocked by mobile webviews without a user gesture, and a
    // player that silently fails to start reads as broken. The user taps play.
    autoPlay: 'false',
    nextEpisode: 'true',
    episodeSelector: 'false',
  }).toString();
}

function movieParams(): string {
  return new URLSearchParams({ color: PLAYER_COLOR, autoPlay: 'false' }).toString();
}

function numericId(id: string): number {
  const { nativeId } = parseId(id);
  const parsed = Number.parseInt(nativeId, 10);
  if (!Number.isFinite(parsed)) {
    throw new ProviderError('notFound', 'vidking', `Unsupported anime id "${id}".`);
  }
  return parsed;
}

/* ------------------------------------------------------------------ */
/* Player events                                                       */
/* ------------------------------------------------------------------ */

/** Playback events VidKing emits. */
export type VidKingEventName = 'timeupdate' | 'play' | 'pause' | 'ended' | 'seeked';

export interface VidKingEvent {
  event: VidKingEventName;
  currentTime: number;
  duration: number;
  /** Percentage watched, 0–100. */
  progress: number;
  id: string;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  timestamp: number;
}

/**
 * Injected into the player WebView to forward its `postMessage` events to
 * React Native.
 *
 * The player posts to `window.parent`, which inside a WebView is the page
 * itself, so the events never reach the app without this bridge. It only
 * listens and re-posts — it does not alter the player's behaviour.
 */
export const VIDKING_EVENT_BRIDGE = `
(function () {
  if (window.__hoshiBridge) return;
  window.__hoshiBridge = true;
  window.addEventListener('message', function (event) {
    try {
      var payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (payload && payload.type === 'PLAYER_EVENT' && payload.data) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload.data));
      }
    } catch (error) {
      /* Unrelated messages share this channel; ignoring them is correct. */
    }
  });
})();
true;
`;

/**
 * Parse a bridged message.
 *
 * Returns undefined for anything unrecognised. The WebView message channel
 * carries traffic from the embedded page too, so this must reject silently
 * rather than throw on every unrelated message.
 */
export function parseVidKingEvent(raw: string): VidKingEvent | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;

    const candidate = parsed as Partial<VidKingEvent>;
    if (typeof candidate.event !== 'string') return undefined;
    if (typeof candidate.currentTime !== 'number') return undefined;

    return {
      event: candidate.event as VidKingEventName,
      currentTime: candidate.currentTime,
      duration: typeof candidate.duration === 'number' ? candidate.duration : 0,
      progress: typeof candidate.progress === 'number' ? candidate.progress : 0,
      id: String(candidate.id ?? ''),
      mediaType: candidate.mediaType === 'movie' ? 'movie' : 'tv',
      season: candidate.season,
      episode: candidate.episode,
      timestamp: typeof candidate.timestamp === 'number' ? candidate.timestamp : Date.now(),
    };
  } catch {
    return undefined;
  }
}
