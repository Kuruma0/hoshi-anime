import { makeId } from '@/domain/common';
import type { Image } from '@/domain/common';
import type { Chapter, ContentRating, Manga, MangaStatus } from '@/domain/manga';
import type {
  LocalizedString,
  MdAtHome,
  MdChapter,
  MdManga,
  MdRelationship,
  MdTag,
} from './types';

export const PROVIDER_ID = 'mangadex';
const UPLOADS_BASE = 'https://uploads.mangadex.org';

/**
 * Pick the most useful string from a MangaDex localised map.
 *
 * Preference order matters: English first for display, then romanised Japanese
 * (`ja-ro`), then anything. Chainsaw Man, for instance, has its primary title
 * under `ja-ro` and only carries `en` in altTitles, so blindly reading `.en`
 * would leave popular titles blank.
 */
export function pickLocalized(
  map: LocalizedString | undefined,
  preferred: readonly string[] = ['en', 'ja-ro', 'ja']
): string | undefined {
  if (!map) return undefined;
  for (const key of preferred) {
    const value = map[key];
    if (value) return value;
  }
  const first = Object.values(map).find(Boolean);
  return first ?? undefined;
}

/** Every title variant, flattened and de-duplicated, for §14 search. */
export function collectAltTitles(attributes: MdManga['attributes']): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (value: string | undefined) => {
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(value);
  };

  for (const value of Object.values(attributes.title)) add(value);
  for (const entry of attributes.altTitles) {
    for (const value of Object.values(entry)) add(value);
  }

  return result;
}

function findRelationship(
  relationships: MdRelationship[],
  type: string
): MdRelationship | undefined {
  return relationships.find((relationship) => relationship.type === type);
}

function findAllRelationships(relationships: MdRelationship[], type: string): MdRelationship[] {
  return relationships.filter((relationship) => relationship.type === type);
}

export function coverImage(manga: MdManga): Image | undefined {
  const cover = findRelationship(manga.relationships, 'cover_art');
  const fileName = cover?.attributes?.['fileName'];
  if (typeof fileName !== 'string' || !fileName) return undefined;

  return {
    url: `${UPLOADS_BASE}/covers/${manga.id}/${fileName}.512.jpg`,
    thumbnailUrl: `${UPLOADS_BASE}/covers/${manga.id}/${fileName}.256.jpg`,
  };
}

const STATUS_MAP: Record<string, MangaStatus> = {
  ongoing: 'ongoing',
  completed: 'completed',
  hiatus: 'hiatus',
  cancelled: 'cancelled',
};

export function normalizeStatus(status: string | undefined): MangaStatus {
  return (status && STATUS_MAP[status]) || 'unknown';
}

const RATINGS: readonly ContentRating[] = ['safe', 'suggestive', 'erotica', 'pornographic'];

export function normalizeContentRating(rating: string | undefined): ContentRating {
  const match = RATINGS.find((candidate) => candidate === rating);
  // Unrated content is treated as the most restrictive value rather than the
  // most permissive, an unknown rating should not slip past a "safe" filter.
  return match ?? 'pornographic';
}

/**
 * Tags worth showing as genres.
 *
 * MangaDex has 77 tags across four groups: content, format, genre, theme.
 * `content` holds advisory warnings and `format` holds publication shape
 * (Oneshot, Web Comic); neither is a genre, so both are dropped.
 */
export function normalizeTags(tags: MdTag[]): string[] {
  return tags
    .filter((tag) => tag.attributes.group === 'genre' || tag.attributes.group === 'theme')
    .map((tag) => pickLocalized(tag.attributes.name))
    .filter((name): name is string => Boolean(name));
}

export function normalizeManga(raw: MdManga): Manga {
  const { attributes } = raw;

  const title =
    pickLocalized(attributes.title) ??
    pickLocalized(Object.assign({}, ...attributes.altTitles)) ??
    'Untitled';

  const authors = findAllRelationships(raw.relationships, 'author')
    .map((relationship) => relationship.attributes?.['name'])
    .filter((name): name is string => typeof name === 'string');

  const artists = findAllRelationships(raw.relationships, 'artist')
    .map((relationship) => relationship.attributes?.['name'])
    .filter((name): name is string => typeof name === 'string');

  // The native title, only when it is genuinely different from what we display.
  const originalLanguage = attributes.originalLanguage ?? 'ja';
  const nativeTitle =
    attributes.title[originalLanguage] ??
    attributes.altTitles.find((entry) => entry[originalLanguage])?.[originalLanguage];

  return {
    id: makeId(PROVIDER_ID, raw.id),
    title,
    originalTitle: nativeTitle && nativeTitle !== title ? nativeTitle : undefined,
    alternativeTitles: collectAltTitles(attributes).filter((value) => value !== title),
    description: pickLocalized(attributes.description),
    cover: coverImage(raw),
    authors,
    artists,
    genres: normalizeTags(attributes.tags),
    status: normalizeStatus(attributes.status),
    year: attributes.year ?? undefined,
    contentRating: normalizeContentRating(attributes.contentRating),
    lastChapter: attributes.lastChapter ?? undefined,
    originalLanguage,
    availableLanguages: (attributes.availableTranslatedLanguages ?? []).filter(
      (language): language is string => typeof language === 'string'
    ),
    externalIds: normalizeExternalIds(attributes.links),
  };
}

/**
 * Cross-database ids from MangaDex's `links` map.
 *
 * MangaDex keys these by short code; `al` is AniList, `mal` is MyAnimeList.
 * Only those two are extracted; the rest point at storefronts and reading sites
 * that this app has no use for.
 */
export function normalizeExternalIds(
  links: Record<string, string> | null | undefined
): { anilist?: string; myAnimeList?: string } | undefined {
  const anilist = links?.['al']?.trim();
  const myAnimeList = links?.['mal']?.trim();

  if (!anilist && !myAnimeList) return undefined;
  return {
    anilist: anilist || undefined,
    myAnimeList: myAnimeList || undefined,
  };
}

export function normalizeChapter(raw: MdChapter): Chapter {
  const { attributes } = raw;
  const group = findRelationship(raw.relationships, 'scanlation_group');
  const groupName = group?.attributes?.['name'];

  return {
    id: raw.id,
    number: attributes.chapter ?? undefined,
    volume: attributes.volume ?? undefined,
    title: attributes.title ?? undefined,
    language: attributes.translatedLanguage,
    pageCount: attributes.pages,
    publishedAt: Math.floor(new Date(attributes.publishAt).getTime() / 1000),
    scanlationGroup: typeof groupName === 'string' ? groupName : undefined,
    externalUrl: attributes.externalUrl ?? undefined,
  };
}

/**
 * Build page URLs from an @Home response.
 *
 * The host is ephemeral, so `expiresAt` gives the reader a point after which it
 * re-resolves rather than serving URLs that will 404 mid-chapter.
 */
export function normalizePages(raw: MdAtHome): {
  pages: string[];
  dataSaverPages: string[];
  expiresAt: number;
} {
  const { baseUrl, chapter } = raw;
  return {
    pages: chapter.data.map((file) => `${baseUrl}/data/${chapter.hash}/${file}`),
    dataSaverPages: chapter.dataSaver.map(
      (file) => `${baseUrl}/data-saver/${chapter.hash}/${file}`
    ),
    // MangaDex advises treating an @Home host as good for ~15 minutes.
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
}

/**
 * Chapter ordering.
 *
 * Chapter "numbers" are not numbers, "10.5", "Extra" and null all occur. Parse
 * what we can, and sort the unparseable to the end by publish date so a oneshot
 * never lands between chapters 1 and 2.
 */
export function compareChapters(a: Chapter, b: Chapter): number {
  const numberA = a.number === undefined ? NaN : Number.parseFloat(a.number);
  const numberB = b.number === undefined ? NaN : Number.parseFloat(b.number);

  const aValid = Number.isFinite(numberA);
  const bValid = Number.isFinite(numberB);

  if (aValid && bValid) {
    if (numberA !== numberB) return numberA - numberB;
    return a.publishedAt - b.publishedAt;
  }
  if (aValid) return -1;
  if (bValid) return 1;
  return a.publishedAt - b.publishedAt;
}

/** Whether a chapter can actually be opened in the in-app reader. */
export function isReadable(chapter: Chapter): boolean {
  return !chapter.externalUrl && chapter.pageCount > 0;
}
