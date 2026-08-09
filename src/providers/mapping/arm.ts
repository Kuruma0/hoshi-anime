import { ProviderError } from '@/lib/errors';
import { HttpClient } from '@/lib/http';
import { RateLimiter } from '@/lib/rateLimiter';

/**
 * AniList → TheMovieDB id mapping.
 *
 * VidKing addresses content by TMDB id and season, but the catalogue provider
 * (AniList) knows nothing about TMDB. This service bridges the two.
 *
 * It is a public, documented, unauthenticated mapping API, no scraping and no
 * key. Keeping it in its own module means swapping the metadata or playback
 * provider does not drag the mapping along with it.
 *
 * https://arm.haglund.dev
 */

const BASE_URL = 'https://arm.haglund.dev/api/v2';
const PROVIDER_ID = 'arm';

/** Fields we use. The service returns more; these are the relevant ones. */
export interface IdMapping {
  anilist?: number | null;
  myanimelist?: number | null;
  themoviedb?: number | null;
  /** Which TMDB season this AniList entry corresponds to. Often null. */
  'themoviedb-season'?: number | null;
  thetvdb?: number | null;
  imdb?: string | null;
  /** "TV" | "MOVIE" | ... */
  media?: string | null;
}

export interface TmdbTarget {
  tmdbId: number;
  season: number;
  /** Movies address a different VidKing endpoint than series. */
  isMovie: boolean;
}

export class ArmMappingClient {
  private readonly http: HttpClient;
  /** Mappings are effectively immutable, so one lookup per title per session. */
  private readonly cache = new Map<number, IdMapping | null>();

  constructor(userAgent: string) {
    this.http = new HttpClient({
      baseUrl: BASE_URL,
      provider: PROVIDER_ID,
      // No published limit; this is deliberately conservative since the service
      // is free and we only need one call per title.
      limiter: new RateLimiter(5, 3),
      headers: { 'User-Agent': userAgent },
      maxRetries: 1,
    });
  }

  async lookup(anilistId: number, signal?: AbortSignal): Promise<IdMapping | null> {
    const cached = this.cache.get(anilistId);
    if (cached !== undefined) return cached;

    let mapping: IdMapping | null;
    try {
      mapping = await this.http.request<IdMapping | null>('/ids', {
        query: { source: 'anilist', id: anilistId },
        signal,
      });
    } catch (error) {
      // "No mapping exists" is a real answer, not an outage, the player should
      // say the episode is unavailable rather than offer a retry.
      //
      // Verified against the live service: an unmapped or out-of-range id
      // returns 400, not 404. Treating only 404 as absent would surface a
      // routine miss as a provider failure.
      const absent =
        error instanceof ProviderError &&
        (error.kind === 'notFound' || error.status === 400);

      if (absent) mapping = null;
      else throw error;
    }

    this.cache.set(anilistId, mapping);
    return mapping;
  }

  /**
   * Resolve to something VidKing can address.
   *
   * Returns undefined when no TMDB id exists; the player then reports that the
   * episode is unavailable rather than requesting a guessed id, which would
   * silently play the wrong show.
   */
  async resolveTmdb(anilistId: number, signal?: AbortSignal): Promise<TmdbTarget | undefined> {
    const mapping = await this.lookup(anilistId, signal);
    const tmdbId = mapping?.themoviedb;
    if (!tmdbId) return undefined;

    return {
      tmdbId,
      // AniList lists each anime season as its own entry while TMDB keeps them
      // under one show. When the mapping omits the season the entry maps to the
      // show as a whole, which is season 1 as far as the player is concerned.
      season: mapping?.['themoviedb-season'] ?? 1,
      isMovie: mapping?.media === 'MOVIE',
    };
  }
}
