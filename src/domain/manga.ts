import type { ContentId, Image } from './common';

export type MangaStatus = 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';

/**
 * MangaDex classifies every title and defaults its search to include suggestive
 * and erotica. Modelling this is not optional — omitting it would mean shipping
 * an app that puts adult covers on the trending row by default.
 */
export type ContentRating = 'safe' | 'suggestive' | 'erotica' | 'pornographic';

export interface Manga {
  id: ContentId;
  title: string;
  /** Native (usually Japanese) title. */
  originalTitle?: string;
  /** Romanised and translated titles across all languages the provider has. */
  alternativeTitles: string[];
  description?: string;
  /** 2:3 cover. */
  cover?: Image;
  authors: string[];
  artists: string[];
  /** Genre and theme tags, already filtered to the ones worth showing. */
  genres: string[];
  status: MangaStatus;
  year?: number;
  contentRating: ContentRating;
  /** Last chapter number as a string — chapters are not reliably integers. */
  lastChapter?: string;
  /** Original language, e.g. "ja", "ko", "zh". */
  originalLanguage?: string;
  /** Translated languages available, for the chapter-language picker. */
  availableLanguages: string[];
  /**
   * Ids for the same work in other databases, when the provider publishes them.
   *
   * This is what turns "find the anime for this manga" from a title guess into
   * an exact lookup — MangaDex records the AniList id directly.
   */
  externalIds?: { anilist?: string; myAnimeList?: string };
  providerMeta?: Record<string, unknown>;
}

export interface Chapter {
  id: string;
  /** Chapter number as published: "1", "10.5", "Extra". May be absent (oneshots). */
  number?: string;
  volume?: string;
  title?: string;
  /** ISO 639-1 translated language code. */
  language: string;
  pageCount: number;
  /** Unix seconds, UTC. */
  publishedAt: number;
  scanlationGroup?: string;
  /** Set when the chapter is hosted off-site and cannot be read in-app. */
  externalUrl?: string;
}

/**
 * Resolved page images for one chapter.
 *
 * MangaDex serves these from ephemeral per-chapter hosts that can expire or
 * 404 mid-read, so the reader re-resolves rather than treating a page failure
 * as a chapter failure.
 */
export interface ChapterPages {
  /** Full-quality page URLs, in reading order. */
  pages: string[];
  /** Smaller re-encoded variants, used when data saver is on. */
  dataSaverPages: string[];
  /** When this resolution should be considered stale, in ms since epoch. */
  expiresAt: number;
}
