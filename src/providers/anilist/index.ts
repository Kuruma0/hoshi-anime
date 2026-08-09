import { parseId } from '@/domain/common';
import type { Paged, PageRequest } from '@/domain/common';
import type { Anime, Episode, ScheduleEntry } from '@/domain/anime';
import { ProviderError } from '@/lib/errors';
import { HttpClient } from '@/lib/http';
import { RateLimiter } from '@/lib/rateLimiter';
import { rankByTitle } from '@/lib/titleMatch';
import type { AnimeProvider, AnimeSection } from '../types';
import type { RelatedMedia } from '@/domain/relations';
import { buildEpisodes, normalizeAnime, normalizeRelations, PROVIDER_ID } from './normalize';
import {
  DETAIL_QUERY,
  EPISODES_QUERY,
  GENRES_QUERY,
  RECOMMENDATIONS_QUERY,
  RELATIONS_QUERY,
  SCHEDULE_QUERY,
  SEARCH_QUERY,
  SECTION_QUERY,
} from './queries';
import type {
  AlDetailData,
  AlEpisodesData,
  AlGenresData,
  AlGraphQLResponse,
  AlRecommendationsData,
  AlRelationsData,
  AlScheduleData,
  AlSearchData,
} from './types';

const BASE_URL = 'https://graphql.anilist.co';
const PAGE_SIZE = 24;

/** Sort/filter variables per discovery section. */
const SECTION_VARIABLES: Record<AnimeSection, { sort: string[]; status?: string }> = {
  trending: { sort: ['TRENDING_DESC'] },
  popular: { sort: ['POPULARITY_DESC'] },
  airing: { sort: ['TRENDING_DESC'], status: 'RELEASING' },
  recentlyAdded: { sort: ['ID_DESC'] },
  topRated: { sort: ['SCORE_DESC'] },
  upcoming: { sort: ['POPULARITY_DESC'], status: 'NOT_YET_RELEASED' },
};

export interface AniListOptions {
  /** When false, `isAdult` titles are excluded from every query. */
  getAllowAdult: () => boolean;
  userAgent: string;
}

export class AniListProvider implements AnimeProvider {
  readonly id = PROVIDER_ID;
  readonly name = 'AniList';
  readonly attribution = 'Anime data from AniList';

  readonly supportedSections = [
    'trending',
    'popular',
    'airing',
    'topRated',
    'recentlyAdded',
    'upcoming',
  ] as const satisfies readonly AnimeSection[];

  readonly supportsSchedule = true;
  readonly supportsRecommendations = true;
  readonly supportsRelations = true;

  private readonly http: HttpClient;
  private genreCache?: string[];

  constructor(private readonly options: AniListOptions) {
    this.http = new HttpClient({
      baseUrl: BASE_URL,
      provider: PROVIDER_ID,
      // Verified live: X-RateLimit-Limit is 30/minute. A burst of 8 covers a
      // home screen's rails; refill is exactly 30/min.
      limiter: new RateLimiter(8, 0.5),
      headers: { 'User-Agent': options.userAgent },
    });
  }

  /* ---------------------------------------------------------------- */
  /* Discovery                                                         */
  /* ---------------------------------------------------------------- */

  async search(query: string, page: PageRequest = {}): Promise<Paged<Anime>> {
    const trimmed = query.trim();
    if (!trimmed) return { items: [] };

    const data = await this.graphql<AlSearchData>(
      SEARCH_QUERY,
      {
        query: trimmed,
        page: toPage(page.cursor),
        perPage: page.limit ?? PAGE_SIZE,
        ...this.adultFilter(),
      },
      page.signal
    );

    const items = (data.Page?.media ?? [])
      .filter((media) => media !== null)
      .map(normalizeAnime);

    return {
      // SEARCH_MATCH is good but can rank a sequel above the entry the user
      // typed; local re-ranking only reorders, never drops.
      items: rankByTitle(trimmed, items),
      nextCursor: nextPage(page.cursor, data.Page?.pageInfo?.hasNextPage),
      total: data.Page?.pageInfo?.total ?? undefined,
    };
  }

  async getSection(section: AnimeSection, page: PageRequest = {}): Promise<Paged<Anime>> {
    const variables = SECTION_VARIABLES[section];
    if (!variables) {
      throw new ProviderError(
        'providerFailure',
        PROVIDER_ID,
        `AniList does not support the "${section}" section.`
      );
    }

    const data = await this.graphql<AlSearchData>(
      SECTION_QUERY,
      {
        page: toPage(page.cursor),
        perPage: page.limit ?? PAGE_SIZE,
        sort: variables.sort,
        status: variables.status,
        ...this.adultFilter(),
      },
      page.signal
    );

    return {
      items: (data.Page?.media ?? []).filter((media) => media !== null).map(normalizeAnime),
      nextCursor: nextPage(page.cursor, data.Page?.pageInfo?.hasNextPage),
      total: data.Page?.pageInfo?.total ?? undefined,
    };
  }

  async getAnime(id: string, signal?: AbortSignal): Promise<Anime> {
    const data = await this.graphql<AlDetailData>(
      DETAIL_QUERY,
      { id: toNumericId(id) },
      signal
    );

    if (!data.Media) {
      throw new ProviderError('notFound', PROVIDER_ID, 'Anime not found.');
    }
    return normalizeAnime(data.Media);
  }

  async getEpisodes(id: string, signal?: AbortSignal): Promise<Episode[]> {
    const data = await this.graphql<AlEpisodesData>(
      EPISODES_QUERY,
      { id: toNumericId(id) },
      signal
    );

    if (!data.Media) {
      throw new ProviderError('notFound', PROVIDER_ID, 'Anime not found.');
    }
    return buildEpisodes(data.Media);
  }

  async getGenres(signal?: AbortSignal): Promise<string[]> {
    if (this.genreCache) return this.genreCache;

    const data = await this.graphql<AlGenresData>(GENRES_QUERY, {}, signal);
    const genres = (data.GenreCollection ?? []).filter(
      (genre): genre is string => Boolean(genre) && genre !== 'Hentai'
    );

    this.genreCache = genres;
    return genres;
  }

  async getByGenre(genre: string, page: PageRequest = {}): Promise<Paged<Anime>> {
    const data = await this.graphql<AlSearchData>(
      SECTION_QUERY,
      {
        page: toPage(page.cursor),
        perPage: page.limit ?? PAGE_SIZE,
        sort: ['POPULARITY_DESC'],
        genre,
        ...this.adultFilter(),
      },
      page.signal
    );

    return {
      items: (data.Page?.media ?? []).filter((media) => media !== null).map(normalizeAnime),
      nextCursor: nextPage(page.cursor, data.Page?.pageInfo?.hasNextPage),
      total: data.Page?.pageInfo?.total ?? undefined,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Schedule                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Airings in a UTC window.
   *
   * Paged internally because a full week of airings exceeds one page — stopping
   * at page 1 would silently drop the back half of the week. Capped so a wide
   * range cannot spend the entire rate-limit budget.
   */
  async getSchedule(
    fromUnix: number,
    toUnix: number,
    signal?: AbortSignal
  ): Promise<ScheduleEntry[]> {
    const entries: ScheduleEntry[] = [];
    const MAX_PAGES = 5;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await this.graphql<AlScheduleData>(
        SCHEDULE_QUERY,
        { start: fromUnix, end: toUnix, page, perPage: 50 },
        signal
      );

      for (const schedule of data.Page?.airingSchedules ?? []) {
        if (!schedule?.media) continue;
        // Adult titles are excluded here rather than filtered in the UI, so the
        // schedule respects the same setting as every other surface.
        if (schedule.media.isAdult && !this.options.getAllowAdult()) continue;

        entries.push({
          anime: normalizeAnime(schedule.media),
          episodeNumber: schedule.episode,
          airingAt: schedule.airingAt,
        });
      }

      if (!data.Page?.pageInfo?.hasNextPage) break;
    }

    return entries;
  }

  /**
   * Relationship graph for a title.
   *
   * `kind` selects which side of the graph to read from — a manga id and an
   * anime id can collide numerically in AniList, so the media type has to be
   * passed rather than inferred.
   */
  async getRelations(
    id: string,
    kind: 'anime' | 'manga' = 'anime',
    signal?: AbortSignal
  ): Promise<RelatedMedia[]> {
    const data = await this.graphql<AlRelationsData>(
      RELATIONS_QUERY,
      { id: toNumericId(id), type: kind === 'manga' ? 'MANGA' : 'ANIME' },
      signal
    );

    return normalizeRelations(data.Media?.relations?.edges);
  }

  async getRecommendations(id: string, signal?: AbortSignal): Promise<Anime[]> {
    const data = await this.graphql<AlRecommendationsData>(
      RECOMMENDATIONS_QUERY,
      { id: toNumericId(id) },
      signal
    );

    return (data.Media?.recommendations?.nodes ?? [])
      .map((node) => node?.mediaRecommendation)
      .filter((media) => media != null)
      .map(normalizeAnime);
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private adultFilter(): { isAdult?: boolean } {
    return this.options.getAllowAdult() ? {} : { isAdult: false };
  }

  /**
   * Issue a GraphQL request.
   *
   * GraphQL returns HTTP 200 with an `errors` array for application-level
   * failures, so the HTTP layer alone cannot detect them — they are translated
   * into ProviderError here.
   */
  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<T> {
    const response = await this.http.request<AlGraphQLResponse<T>>('/', {
      method: 'POST',
      body: { query, variables },
      signal,
    });

    if (response.errors?.length) {
      const first = response.errors[0]!;
      const kind =
        first.status === 404 ? 'notFound' : first.status === 429 ? 'rateLimited' : 'providerFailure';
      throw new ProviderError(kind, PROVIDER_ID, first.message || 'AniList returned an error.', {
        status: first.status,
      });
    }

    if (!response.data) {
      throw new ProviderError('providerFailure', PROVIDER_ID, 'AniList returned no data.');
    }
    return response.data;
  }
}

/** AniList ids are numeric; the namespaced form is `anilist:<n>`. */
function toNumericId(id: string): number {
  const { nativeId } = parseId(id);
  const parsed = Number.parseInt(nativeId, 10);
  if (!Number.isFinite(parsed)) {
    throw new ProviderError('notFound', PROVIDER_ID, `Invalid AniList id "${id}".`);
  }
  return parsed;
}

/** AniList paginates by page number, so cursors carry a 1-based page. */
function toPage(cursor: string | undefined): number {
  const parsed = cursor ? Number.parseInt(cursor, 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function nextPage(cursor: string | undefined, hasNextPage: boolean | null | undefined): string | undefined {
  if (!hasNextPage) return undefined;
  return String(toPage(cursor) + 1);
}
