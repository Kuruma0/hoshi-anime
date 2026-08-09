import type { Anime, Episode } from '@/domain/anime';
import { ProviderError } from '@/lib/errors';
import type { AnimeStreamProvider, PlaybackTarget, StreamOption } from '../types';
import type { EmbedRuntime, PlaybackProgress } from './types';

/**
 * VidLink playback.
 *
 * Documented embed player. It offers three addressing schemes and, unusually,
 * one of them is built for anime:
 *
 *   https://vidlink.pro/anime/{malId}/{episode}/{sub|dub}
 *   https://vidlink.pro/tv/{tmdbId}/{season}/{episode}
 *   https://vidlink.pro/movie/{tmdbId}
 *
 * The anime route is why this provider is preferred. It takes a MyAnimeList id
 * and an absolute episode number, both of which AniList already gives us, so
 * playback needs no cross-database lookup at all. That removes a network round
 * trip from the path between pressing Watch and the first frame, and it removes
 * the season-mapping guesswork that TMDB addressing forces on anime, where one
 * AniList entry per season has to be reconciled with one TMDB show.
 *
 * Verified parameters (from the provider's own documentation): primaryColor,
 * secondaryColor, iconColor, icons, title, poster, autoplay, nextbutton,
 * player, startAt, sub_file, sub_label, fallback_url.
 */

const BASE_URL = 'https://vidlink.pro';
const ORIGIN = 'https://vidlink.pro';

/** Player accent, matched to the app's own. Hex without the leading '#'. */
const PRIMARY_COLOR = '6D4AA8';
const SECONDARY_COLOR = '241E30';

export type AudioTrack = 'sub' | 'dub';

export class VidLinkProvider implements AnimeStreamProvider {
  readonly id = 'vidlink';
  readonly name = 'VidLink';
  readonly attribution = 'Playback by VidLink';
  readonly kind = 'embed' as const;

  isAvailable(): boolean {
    return true;
  }

  async listOptions(anime: Anime): Promise<StreamOption[]> {
    if (malId(anime) === undefined) return [];
    // Sub and dub are the only axis this player exposes to an embedder.
    return [
      { id: 'sub', label: 'Subtitled', audio: 'sub' },
      { id: 'dub', label: 'Dubbed', audio: 'dub' },
    ];
  }

  async resolve(
    anime: Anime,
    episode: Episode,
    optionId?: string
  ): Promise<PlaybackTarget> {
    const id = malId(anime);

    if (id === undefined) {
      // No MyAnimeList id means the anime route cannot be addressed. Rather
      // than guess at a TMDB mapping here, report it and let the playback
      // service fall through to a provider that is keyed differently.
      throw new ProviderError(
        'notFound',
        this.id,
        'No MyAnimeList id is available for this title.'
      );
    }

    const audio: AudioTrack = optionId === 'dub' ? 'dub' : 'sub';
    const url = `${BASE_URL}/anime/${id}/${episode.number}/${audio}?${params()}`;

    return { kind: 'embed', provider: this.id, url, referer: ORIGIN };
  }
}

/**
 * Sentinel the player is told to navigate to when a stream will not load.
 *
 * The embed always answers HTTP 200 and renders "episode not found" inside the
 * page, so availability cannot be determined before the WebView runs. The
 * provider documents `fallback_url` for precisely this, and navigating to an
 * address that resolves nowhere is an unambiguous signal the app can watch for
 * without inspecting the provider's markup.
 */
export const PLAYBACK_FAILED_SENTINEL = 'https://playback.invalid/failed';

export function isPlaybackFailureSentinel(url: string | undefined): boolean {
  return typeof url === 'string' && url.startsWith(PLAYBACK_FAILED_SENTINEL);
}

function params(): string {
  return new URLSearchParams({
    primaryColor: PRIMARY_COLOR,
    secondaryColor: SECONDARY_COLOR,
    iconColor: 'F2EFF7',
    icons: 'default',
    // Documented failure signal: the player navigates here when a stream will
    // not load, which is how the app learns to fall back.
    fallback_url: PLAYBACK_FAILED_SENTINEL,
    // The app already shows the title above the player.
    title: 'false',
    poster: 'true',
    // Mobile WebViews block unattended autoplay; a player that silently fails
    // to start reads as broken, so the user taps play.
    autoplay: 'false',
    // The app's own episode list is the way to change episode.
    nextbutton: 'false',
    // If the requested audio track is missing, serve the other one rather than
    // failing outright.
    fallback: 'true',
  }).toString();
}

/**
 * MyAnimeList id, carried through from AniList in `providerMeta`.
 *
 * Reading providerMeta is a provider-to-provider concern and is exactly what
 * that field exists for; no screen touches it.
 */
function malId(anime: Anime): number | undefined {
  const raw = anime.providerMeta?.['malId'];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number.parseInt(raw, 10);
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Player events                                                       */
/* ------------------------------------------------------------------ */

/**
 * Forwards VidLink's `MEDIA_DATA` messages to React Native.
 *
 * The origin check mirrors the provider's own documented example. The player
 * posts to the parent window, which inside a WebView is the page itself, so
 * without this bridge the events never reach the app.
 */
export const VIDLINK_EVENT_BRIDGE = `
(function () {
  if (window.__hoshiVidlinkBridge) return;
  window.__hoshiVidlinkBridge = true;
  window.addEventListener('message', function (event) {
    try {
      if (event.origin !== '${ORIGIN}') return;
      var payload = event.data;
      if (payload && payload.type === 'MEDIA_DATA') {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    } catch (error) {
      /* Unrelated messages share this channel; ignoring them is correct. */
    }
  });
})();
true;
`;

/**
 * Turn a `MEDIA_DATA` payload into the application's progress shape.
 *
 * VidLink reports a map of every title the viewer has watched, keyed by id,
 * rather than a single event about the current one. The entry carrying the
 * furthest `watched` value for this session is the one being played, so the
 * most recently updated entry is selected rather than assuming a position.
 */
export function parseVidLinkProgress(raw: string): PlaybackProgress | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;

    const envelope = parsed as { type?: string; data?: unknown };
    if (envelope.type !== 'MEDIA_DATA' || typeof envelope.data !== 'object' || !envelope.data) {
      return undefined;
    }

    const entries = Object.values(envelope.data as Record<string, VidLinkEntry>);
    if (entries.length === 0) return undefined;

    // One payload can describe several titles; the one with a live position is
    // the one on screen.
    let best: { progress: PlaybackProgress; watched: number } | undefined;

    for (const entry of entries) {
      const resolved = readEntry(entry);
      if (!resolved) continue;
      if (!best || resolved.positionSeconds > best.watched) {
        best = { progress: resolved, watched: resolved.positionSeconds };
      }
    }

    return best?.progress;
  } catch {
    return undefined;
  }
}

interface VidLinkProgressBlock {
  watched?: number;
  duration?: number;
}

interface VidLinkEntry {
  progress?: VidLinkProgressBlock;
  last_episode_watched?: string | number;
  show_progress?: Record<
    string,
    { episode?: string | number; progress?: VidLinkProgressBlock }
  >;
}

function readEntry(entry: VidLinkEntry | undefined): PlaybackProgress | undefined {
  if (!entry) return undefined;

  // Prefer the per-episode block when present; the top-level `progress` mirrors
  // whichever episode was touched last and is less specific.
  const episodeKey = entry.show_progress
    ? Object.keys(entry.show_progress).at(-1)
    : undefined;
  const episodeBlock = episodeKey ? entry.show_progress?.[episodeKey] : undefined;

  const block = episodeBlock?.progress ?? entry.progress;
  const watched = block?.watched;
  if (typeof watched !== 'number' || !Number.isFinite(watched)) return undefined;

  const duration =
    typeof block?.duration === 'number' && block.duration > 0 ? block.duration : undefined;

  const episodeNumber = toEpisodeNumber(
    episodeBlock?.episode ?? entry.last_episode_watched
  );

  return {
    positionSeconds: watched,
    durationSeconds: duration,
    episodeNumber,
    completed: duration !== undefined && watched / duration >= 0.92,
    // VidLink emits this as a rolling snapshot rather than discrete events, so
    // there is no pause or seek to treat as a checkpoint.
    checkpoint: false,
  };
}

function toEpisodeNumber(value: string | number | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number.parseInt(value, 10);
  return undefined;
}

export const VIDLINK_RUNTIME: EmbedRuntime = {
  providerId: 'vidlink',
  bridge: VIDLINK_EVENT_BRIDGE,
  resumeParam: 'startAt',
  parseProgress: parseVidLinkProgress,
};
