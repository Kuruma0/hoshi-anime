import { parseId } from '@/domain/common';
import type { Paged, PageRequest } from '@/domain/common';
import type { Chapter, ChapterPages, ContentRating, Manga } from '@/domain/manga';
import { ProviderError } from '@/lib/errors';
import { HttpClient } from '@/lib/http';
import { RateLimiter } from '@/lib/rateLimiter';
import { rankByTitle } from '@/lib/titleMatch';
import type { MangaProvider, MangaSection } from '../types';
import {
  compareChapters,
  normalizeChapter,
  normalizeManga,
  normalizePages,
  pickLocalized,
  PROVIDER_ID,
} from './normalize';
import type { MdAtHome, MdChapter, MdCollection, MdEntity, MdManga, MdTag } from './types';

const BASE_URL = 'https://api.mangadex.org';

/** MangaDex caps `offset + limit` at 10,000 across all collection endpoints. */
const MAX_OFFSET = 10_000;
const PAGE_SIZE = 24;

/**
 * Sort orders MangaDex actually exposes.
 *
 * Note what is absent: there is no `trending`. MangaDex publishes no trending
 * metric, and inventing one from followedCount would be exactly the fabricated
 * functionality §5 forbids; so `trending` is left out of `supportedSections`
 * and the UI simply never renders that rail for this provider.
 */
const SECTION_ORDER: Record<MangaSection, { key: string; direction: 'asc' | 'desc' } | undefined> =
  {
    trending: undefined,
    popular: { key: 'followedCount', direction: 'desc' },
    recentlyUpdated: { key: 'latestUploadedChapter', direction: 'desc' },
    recentlyAdded: { key: 'createdAt', direction: 'desc' },
    topRated: { key: 'rating', direction: 'desc' },
  };

export interface MangaDexOptions {
  /**
   * Read at call time rather than injected once, so a Settings change takes
   * effect on the next request without rebuilding the provider.
   */
  getContentRatings: () => ContentRating[];
  /** MangaDex requires a descriptive User-Agent on every request. */
  userAgent: string;
}

export class MangaDexProvider implements MangaProvider {
  readonly id = PROVIDER_ID;
  readonly name = 'MangaDex';
  readonly attribution = 'Manga data and images from MangaDex';

  readonly supportedSections = [
    'popular',
    'recentlyUpdated',
    'recentlyAdded',
    'topRated',
  ] as const satisfies readonly MangaSection[];

  readonly supportedLanguages = [
    'en', 'ja', 'ko', 'zh', 'es', 'es-la', 'fr', 'de', 'pt-br', 'ru', 'it', 'id', 'pl', 'vi',
  ] as const;

  private readonly http: HttpClient;
  /** Tag names are stable; resolved once and reused for genre filtering. */
  private tagCache?: Map<string, string>;

  constructor(private readonly options: MangaDexOptions) {
    this.http = new HttpClient({
      baseUrl: BASE_URL,
      provider: PROVIDER_ID,
      // ~5 req/s per IP, enforced with a 403 IP ban for persistent abuse. The
      // bucket sits just under it.
      limiter: new RateLimiter(5, 4),
      headers: { 'User-Agent': options.userAgent },
    });
  }

  /* ---------------------------------------------------------------- */
  /* Discovery                                                         */
  /* ---------------------------------------------------------------- */

  async search(query: string, page: PageRequest = {}): Promise<Paged<Manga>> {
    const trimmed = query.trim();
    if (!trimmed) return { items: [] };

    const result = await this.queryManga(
      { title: trimmed, 'order[relevance]': 'desc' },
      page
    );

    // MangaDex ranks by its own relevance, which can put a spin-off above the
    // exact title when the query matched an alt title. Re-rank locally; never
    // filter, since dropping a correct result is worse than showing it second.
    return { ...result, items: rankByTitle(trimmed, result.items) };
  }

  async getSection(section: MangaSection, page: PageRequest = {}): Promise<Paged<Manga>> {
    const order = SECTION_ORDER[section];
    if (!order) {
      throw new ProviderError(
        'providerFailure',
        PROVIDER_ID,
        `MangaDex does not support the "${section}" section.`
      );
    }

    const params: Record<string, string> = { [`order[${order.key}]`]: order.direction };
    // "Recently updated" is meaningless without requiring an actual chapter.
    if (section === 'recentlyUpdated') params['hasAvailableChapters'] = 'true';

    return this.queryManga(params, page);
  }

  async getManga(id: string, signal?: AbortSignal): Promise<Manga> {
    const { nativeId } = parseId(id);
    const response = await this.http.request<MdEntity<MdManga>>(`/manga/${nativeId}`, {
      query: { 'includes[]': ['cover_art', 'author', 'artist'] },
      signal,
    });
    return normalizeManga(response.data);
  }

  async getGenres(signal?: AbortSignal): Promise<string[]> {
    const tags = await this.loadTags(signal);
    return [...tags.values()].sort((a, b) => a.localeCompare(b));
  }

  async getByGenre(genre: string, page: PageRequest = {}): Promise<Paged<Manga>> {
    const tags = await this.loadTags(page.signal);
    const tagId = [...tags.entries()].find(
      ([, name]) => name.toLowerCase() === genre.toLowerCase()
    )?.[0];

    if (!tagId) {
      throw new ProviderError('notFound', PROVIDER_ID, `Unknown genre "${genre}".`);
    }

    return this.queryManga(
      { 'includedTags[]': tagId, 'order[followedCount]': 'desc' },
      page
    );
  }

  /* ---------------------------------------------------------------- */
  /* Chapters                                                          */
  /* ---------------------------------------------------------------- */

  async getChapters(
    id: string,
    options: { language: string } & PageRequest
  ): Promise<Paged<Chapter>> {
    const { nativeId } = parseId(id);
    const limit = options.limit ?? 100;
    const offset = toOffset(options.cursor);

    const response = await this.http.request<MdCollection<MdChapter>>(
      `/manga/${nativeId}/feed`,
      {
        query: {
          limit,
          offset,
          'translatedLanguage[]': options.language,
          'includes[]': ['scanlation_group'],
          'contentRating[]': this.options.getContentRatings(),
          'order[volume]': 'asc',
          'order[chapter]': 'asc',
          // Chapters scheduled but not yet published would render as dead rows.
          'includeFuturePublishAt': 0,
          // `includeEmptyPages` / `includeExternalUrl` are deliberately NOT
          // sent. Verified against the live API: passing them narrows the feed
          // rather than widening it, and excluding empty pages hides officially
          // licensed chapters entirely; every English Chainsaw Man chapter is
          // Viz-licensed with pages: 0, so the feed would come back empty.
          // Instead the full feed is returned and `isReadable` marks the ones
          // that open off-site.
        },
        signal: options.signal,
      }
    );

    const items = response.data.map(normalizeChapter).sort(compareChapters);

    return {
      items,
      nextCursor: nextOffset(offset, limit, response.total),
      total: response.total,
    };
  }

  async getChapterPages(chapterId: string, signal?: AbortSignal): Promise<ChapterPages> {
    const response = await this.http.request<MdAtHome>(`/at-home/server/${chapterId}`, {
      signal,
    });

    const normalized = normalizePages(response);
    if (normalized.pages.length === 0) {
      // Happens for officially-licensed chapters hosted off-site; the reader
      // shows the external-link state rather than an empty page view.
      throw new ProviderError('notFound', PROVIDER_ID, 'This chapter has no readable pages.');
    }
    return normalized;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private async queryManga(
    params: Record<string, string | string[]>,
    page: PageRequest
  ): Promise<Paged<Manga>> {
    const limit = page.limit ?? PAGE_SIZE;
    const offset = toOffset(page.cursor);

    const response = await this.http.request<MdCollection<MdManga>>('/manga', {
      query: {
        ...params,
        limit,
        offset,
        'includes[]': ['cover_art', 'author', 'artist'],
        'contentRating[]': this.options.getContentRatings(),
      },
      signal: page.signal,
    });

    return {
      items: response.data.map(normalizeManga),
      nextCursor: nextOffset(offset, limit, response.total),
      total: response.total,
    };
  }

  private async loadTags(signal?: AbortSignal): Promise<Map<string, string>> {
    if (this.tagCache) return this.tagCache;

    const response = await this.http.request<MdCollection<MdTag>>('/manga/tag', { signal });
    const tags = new Map<string, string>();

    for (const tag of response.data) {
      const group = tag.attributes.group;
      if (group !== 'genre' && group !== 'theme') continue;
      const name = pickLocalized(tag.attributes.name);
      if (name) tags.set(tag.id, name);
    }

    this.tagCache = tags;
    return tags;
  }
}

function toOffset(cursor: string | undefined): number {
  const parsed = cursor ? Number.parseInt(cursor, 10) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Next cursor, or undefined at the end of the collection.
 *
 * The 10,000-item ceiling is treated as the end of the list rather than left to
 * produce a 400 on the next page request.
 */
function nextOffset(offset: number, limit: number, total: number): string | undefined {
  const next = offset + limit;
  if (next >= total || next >= MAX_OFFSET) return undefined;
  return String(next);
}
