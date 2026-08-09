import type { Anime, Episode, ScheduleEntry } from '@/domain/anime';
import type { Chapter, ChapterPages, Manga } from '@/domain/manga';
import type { Paged, PageRequest } from '@/domain/common';
import type { RelatedMedia } from '@/domain/relations';

/**
 * Provider contracts.
 *
 * These are the seam the whole application is built around. Screens depend on
 * these shapes; they never depend on AniList or MangaDex. Replacing a provider
 * means adding a folder next to this file and changing one line in registry.ts.
 *
 * Two conventions every implementation must honour:
 *   - Throw `ProviderError` (lib/errors) and nothing else.
 *   - Return domain models. Provider-shaped objects must not escape the module.
 */

export interface ProviderInfo {
  /** Stable id used in ContentId namespacing. Never change it once shipped. */
  readonly id: string;
  /** Shown in Settings. */
  readonly name: string;
  /** Where the data comes from, shown as attribution. */
  readonly attribution: string;
}

/** Discovery rails a provider can back. See `supportedSections`. */
export type AnimeSection =
  | 'trending'
  | 'popular'
  | 'airing'
  | 'recentlyAdded'
  | 'topRated'
  | 'upcoming';

export type MangaSection =
  | 'trending'
  | 'popular'
  | 'recentlyUpdated'
  | 'recentlyAdded'
  | 'topRated';

/**
 * Metadata + discovery for anime. Deliberately separate from playback: the
 * catalogue and the video source are different concerns with different
 * availability, and coupling them is what makes providers hard to replace.
 */
export interface AnimeProvider extends ProviderInfo {
  /**
   * Sections this provider can actually serve. The UI renders only these, which
   * is how §5's "do not create fake functionality" is enforced structurally
   * rather than by convention.
   */
  readonly supportedSections: readonly AnimeSection[];
  readonly supportsSchedule: boolean;
  readonly supportsRecommendations: boolean;
  /** Whether the provider publishes a relationship graph (seasons, adaptations). */
  readonly supportsRelations: boolean;

  search(query: string, page?: PageRequest): Promise<Paged<Anime>>;
  getAnime(id: string, signal?: AbortSignal): Promise<Anime>;
  getEpisodes(id: string, signal?: AbortSignal): Promise<Episode[]>;
  getSection(section: AnimeSection, page?: PageRequest): Promise<Paged<Anime>>;
  getGenres(signal?: AbortSignal): Promise<string[]>;
  getByGenre(genre: string, page?: PageRequest): Promise<Paged<Anime>>;

  /**
   * Airings between two Unix-second timestamps. Callers pass a UTC range
   * derived from the device's local week; day bucketing happens at render time.
   * Only defined when `supportsSchedule`.
   */
  getSchedule?(fromUnix: number, toUnix: number, signal?: AbortSignal): Promise<ScheduleEntry[]>;

  /** Only defined when `supportsRecommendations`. */
  getRecommendations?(id: string, signal?: AbortSignal): Promise<Anime[]>;

  /**
   * Related titles — sequels, prequels, adaptations.
   *
   * `kind` selects which side of the graph to read, since an id is only unique
   * within a media type. Only defined when `supportsRelations`.
   */
  getRelations?(
    id: string,
    kind?: 'anime' | 'manga',
    signal?: AbortSignal
  ): Promise<RelatedMedia[]>;
}

export interface MangaProvider extends ProviderInfo {
  readonly supportedSections: readonly MangaSection[];
  /** Translated languages this provider can filter chapters by. */
  readonly supportedLanguages: readonly string[];

  search(query: string, page?: PageRequest): Promise<Paged<Manga>>;
  getManga(id: string, signal?: AbortSignal): Promise<Manga>;
  getSection(section: MangaSection, page?: PageRequest): Promise<Paged<Manga>>;
  getGenres(signal?: AbortSignal): Promise<string[]>;
  getByGenre(genre: string, page?: PageRequest): Promise<Paged<Manga>>;

  /** Chapter list for one manga, ascending by chapter number. */
  getChapters(
    id: string,
    options: { language: string } & PageRequest
  ): Promise<Paged<Chapter>>;

  /** Resolve page image URLs. May be re-called if a host expires mid-read. */
  getChapterPages(chapterId: string, signal?: AbortSignal): Promise<ChapterPages>;
}

/* ------------------------------------------------------------------ */
/* Playback                                                            */
/* ------------------------------------------------------------------ */

/**
 * What a stream provider hands back, and the reason this is a union rather than
 * a bare URL string.
 *
 * Each variant maps onto a player surface the app implements, and the player
 * screen switches on `kind`. Adding a source type that behaves differently
 * means a variant here and a branch in the player — not rewriting the anime
 * section.
 *
 * There is deliberately no "external" variant: sending the user out to another
 * site to watch is the flow this app replaced with in-app playback.
 */
export type PlaybackTarget =
  /** A direct manifest playable natively with expo-video. */
  | { kind: 'direct'; url: string; mimeType?: string; subtitles?: SubtitleTrack[]; headers?: Record<string, string> }
  /** A player page rendered in a contained WebView. */
  | { kind: 'embed'; url: string; referer?: string };

export interface SubtitleTrack {
  url: string;
  /** ISO 639-1, e.g. "en". */
  language: string;
  label: string;
  format?: 'vtt' | 'srt';
  default?: boolean;
}

/** One selectable source for an episode (quality / sub vs dub / mirror). */
export interface StreamOption {
  id: string;
  label: string;
  /** e.g. "1080p". Absent when the provider does not report quality. */
  quality?: string;
  /** Sub/dub, when known. */
  audio?: 'sub' | 'dub';
}

/**
 * Playback source. Intentionally the narrowest interface in the codebase —
 * the less a stream provider has to know, the easier it is to write one.
 */
export interface AnimeStreamProvider extends ProviderInfo {
  readonly kind: PlaybackTarget['kind'];

  /**
   * Whether this provider is usable right now. The configurable embed provider
   * returns false until a host has been set in Settings, which is what produces
   * an honest "no source configured" state instead of a broken player.
   */
  isAvailable(): boolean;

  /** Sources for an episode. Return `[]` when the provider has none for it. */
  listOptions(anime: Anime, episode: Episode, signal?: AbortSignal): Promise<StreamOption[]>;

  /** Resolve a chosen option (or the provider's default) into something playable. */
  resolve(
    anime: Anime,
    episode: Episode,
    optionId?: string,
    signal?: AbortSignal
  ): Promise<PlaybackTarget>;
}
