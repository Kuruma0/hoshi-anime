import type { ContentId, Image, MediaKind } from './common';

/**
 * How one title relates to another.
 *
 * Taken from the metadata provider's own relationship graph rather than
 * inferred from titles — "Jujutsu Kaisen 2" and "Jujutsu Kaisen 3" being
 * similarly named is not evidence that they are connected.
 */
export type RelationKind =
  /** A later season or continuation. */
  | 'sequel'
  /** An earlier season. */
  | 'prequel'
  /** The manga/novel this was adapted from, or the anime adapted from this. */
  | 'adaptation'
  /** Spin-offs, side stories, alternative versions. */
  | 'sideStory'
  | 'alternative'
  | 'other';

export interface RelatedMedia {
  relation: RelationKind;
  kind: MediaKind;
  /** Namespaced id in the *metadata* provider's space. */
  id: ContentId;
  title: string;
  originalTitle?: string;
  alternativeTitles: string[];
  artwork?: Image;
  year?: number;
  /** Provider format, e.g. "TV", "MOVIE", "OVA", "MANGA". */
  format?: string;
}

/**
 * One entry in a season chain.
 *
 * `number` is the position in the chain, not a number the provider published —
 * AniList has no season index, so it is derived by walking prequel/sequel links
 * and ordering by release date.
 */
export interface SeasonEntry {
  number: number;
  id: ContentId;
  title: string;
  year?: number;
  artwork?: Image;
  /** True for the season currently being viewed. */
  current: boolean;
}

/** Formats that represent a season of a series rather than a side release. */
const SERIES_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA']);

export function isSeriesFormat(format: string | undefined): boolean {
  return format !== undefined && SERIES_FORMATS.has(format);
}
