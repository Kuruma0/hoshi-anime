/**
 * Raw MangaDex API shapes.
 *
 * These types exist only so normalize.ts can be type-checked against reality.
 * Nothing outside src/providers/mangadex/ may import from this file, the
 * normalizers are the boundary.
 *
 * Shapes verified against live responses from api.mangadex.org.
 */

/** MangaDex localises almost every string as { "en": "...", "ja": "..." }. */
export type LocalizedString = Record<string, string | undefined>;

export interface MdRelationship {
  id: string;
  type: string;
  /** Present only when the type was requested via `includes[]`. */
  attributes?: Record<string, unknown>;
}

export interface MdCollection<T> {
  result: 'ok' | 'error';
  response: string;
  data: T[];
  limit: number;
  offset: number;
  total: number;
}

export interface MdEntity<T> {
  result: 'ok' | 'error';
  response: string;
  data: T;
}

export interface MdTag {
  id: string;
  type: 'tag';
  attributes: {
    name: LocalizedString;
    description: LocalizedString;
    /** One of: content | format | genre | theme. */
    group: string;
    version: number;
  };
}

export interface MdManga {
  id: string;
  type: 'manga';
  attributes: {
    title: LocalizedString;
    altTitles: LocalizedString[];
    description: LocalizedString;
    originalLanguage?: string;
    lastVolume?: string | null;
    lastChapter?: string | null;
    status?: string;
    year?: number | null;
    contentRating?: string;
    tags: MdTag[];
    availableTranslatedLanguages?: (string | null)[];
    links?: Record<string, string> | null;
  };
  relationships: MdRelationship[];
}

export interface MdChapter {
  id: string;
  type: 'chapter';
  attributes: {
    volume?: string | null;
    chapter?: string | null;
    title?: string | null;
    translatedLanguage: string;
    /**
     * Set when the chapter is officially licensed and hosted elsewhere
     * (e.g. Viz). Such chapters report `pages: 0` and cannot be read in-app.
     */
    externalUrl?: string | null;
    isUnavailable?: boolean;
    publishAt: string;
    readableAt: string;
    pages: number;
  };
  relationships: MdRelationship[];
}

/** Response from /at-home/server/{chapterId}. */
export interface MdAtHome {
  result: 'ok' | 'error';
  /** Ephemeral host. Can expire; re-request rather than caching indefinitely. */
  baseUrl: string;
  chapter: {
    hash: string;
    /** Full-quality filenames, in reading order. */
    data: string[];
    /** Re-encoded, smaller filenames. */
    dataSaver: string[];
  };
}

export interface MdCoverArt {
  fileName?: string;
  description?: string;
  volume?: string | null;
}

export interface MdAuthor {
  name?: string;
}

export interface MdScanlationGroup {
  name?: string;
}
