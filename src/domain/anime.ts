import type { ContentId, ExternalLink, Image } from './common';

export type AnimeStatus = 'airing' | 'finished' | 'upcoming' | 'cancelled' | 'unknown';
export type Season = 'winter' | 'spring' | 'summer' | 'fall';

export interface Anime {
  id: ContentId;
  /** English title, falling back to romaji when no English title exists. */
  title: string;
  /** Native (usually Japanese) title. */
  originalTitle?: string;
  /**
   * Romaji plus every synonym the provider knows. This is what makes searching
   * "Shingeki no Kyojin" find "Attack on Titan" — see lib/titleMatch.
   */
  alternativeTitles: string[];
  synopsis?: string;
  /** 2:3 poster. */
  artwork?: Image;
  /** 16:9 banner, when the provider has one. */
  banner?: Image;
  genres: string[];
  status: AnimeStatus;
  year?: number;
  season?: Season;
  /** Total episodes when known. Absent for many currently-airing shows. */
  episodeCount?: number;
  /** Next episode to air. `airingAt` is a Unix timestamp in seconds, UTC. */
  nextEpisode?: { number: number; airingAt: number };
  /** 0–100. Normalised regardless of the provider's native scale. */
  score?: number;
  /** Average episode runtime in minutes. */
  durationMinutes?: number;
  studios: string[];
  /** Promotional trailer, when the provider has one. YouTube only. */
  trailer?: { youtubeId: string; thumbnail?: string };
  externalLinks: ExternalLink[];
  /** Content advisory flag, when the provider reports one. */
  adult?: boolean;
  /**
   * Raw provider payload, kept so a provider can round-trip its own data.
   * Nothing under `app/` may read this — that rule is what keeps the UI
   * provider-agnostic.
   */
  providerMeta?: Record<string, unknown>;
}

export interface Episode {
  id: string;
  number: number;
  title?: string;
  thumbnail?: Image;
  /** Unix seconds, UTC. */
  airedAt?: number;
  durationMinutes?: number;
  /** True when the metadata provider knows of it but it has not aired yet. */
  upcoming?: boolean;
}

/** One entry in the weekly release schedule. */
export interface ScheduleEntry {
  anime: Anime;
  episodeNumber: number;
  /** Unix seconds, UTC. Converted to the device's local day at render time. */
  airingAt: number;
}
