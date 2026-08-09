/**
 * Types shared by the anime and manga domains.
 *
 * Nothing in here references a provider. If a field only makes sense for one
 * specific API, it belongs in that provider's `providerMeta`, not here.
 */

/**
 * A namespaced content id: `"<provider>:<native id>"`, e.g. `"anilist:21"` or
 * `"mangadex:a77742b1-..."`.
 *
 * Raw provider ids are deliberately not used. A saved library entry has to stay
 * unambiguous once a second provider exists, and an int `21` from two different
 * APIs means two different shows.
 */
export type ContentId = string;

export function makeId(provider: string, nativeId: string | number): ContentId {
  return `${provider}:${nativeId}`;
}

export function parseId(id: ContentId): { provider: string; nativeId: string } {
  const separator = id.indexOf(':');
  if (separator === -1) {
    // Tolerated rather than thrown: a malformed id from old persisted state
    // should degrade to "unknown provider", not crash the library screen.
    return { provider: 'unknown', nativeId: id };
  }
  return { provider: id.slice(0, separator), nativeId: id.slice(separator + 1) };
}

export interface Image {
  url: string;
  /** Smaller variant for lists/grids, when the provider offers one. */
  thumbnailUrl?: string;
  /** Cheap placeholder while the full image decodes, if available. */
  blurhash?: string;
  /**
   * Dominant colour as `#rrggbb`, when the provider computes one.
   *
   * Used to decide whether controls floating over the image should be drawn
   * light or dark — see lib/contrast.
   */
  color?: string;
  width?: number;
  height?: number;
}

export interface ExternalLink {
  /** e.g. "Crunchyroll", "Official Site". */
  site: string;
  url: string;
  /** Present when the provider distinguishes streaming links from info links. */
  type?: 'streaming' | 'info' | 'social';
  /** Site brand colour, when the provider supplies one. */
  color?: string;
  language?: string;
}

/** A page of results plus the cursor needed to ask for the next one. */
export interface Paged<T> {
  items: T[];
  /** Opaque cursor. `undefined` means this is the last page. */
  nextCursor?: string;
  /** Total matches when the provider reports it; used for result counts only. */
  total?: number;
}

export interface PageRequest {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

export type MediaKind = 'anime' | 'manga';
