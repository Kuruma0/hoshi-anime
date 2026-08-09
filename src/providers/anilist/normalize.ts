import { makeId } from '@/domain/common';
import type { ExternalLink, Image } from '@/domain/common';
import type { Anime, AnimeStatus, Episode, Season } from '@/domain/anime';
import type { RelatedMedia, RelationKind } from '@/domain/relations';
import type { AlExternalLink, AlMedia, AlRelationEdge, AlStreamingEpisode } from './types';

export const PROVIDER_ID = 'anilist';

/**
 * AniList descriptions contain HTML even with `asHtml: false`, `<br>`, `<i>`,
 * and occasional spoiler markup all appear. React Native renders no HTML, so
 * tags become visible text unless stripped here.
 */
export function stripHtml(input: string | null | undefined): string | undefined {
  if (!input) return undefined;

  const text = input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text || undefined;
}

const STATUS_MAP: Record<string, AnimeStatus> = {
  RELEASING: 'airing',
  FINISHED: 'finished',
  NOT_YET_RELEASED: 'upcoming',
  CANCELLED: 'cancelled',
  HIATUS: 'airing',
};

export function normalizeStatus(status: string | null | undefined): AnimeStatus {
  return (status && STATUS_MAP[status]) || 'unknown';
}

const SEASON_MAP: Record<string, Season> = {
  WINTER: 'winter',
  SPRING: 'spring',
  SUMMER: 'summer',
  FALL: 'fall',
};

export function normalizeSeason(season: string | null | undefined): Season | undefined {
  return season ? SEASON_MAP[season] : undefined;
}

function normalizeLinkType(type: string | null | undefined): ExternalLink['type'] {
  switch (type) {
    case 'STREAMING':
      return 'streaming';
    case 'SOCIAL':
      return 'social';
    case 'INFO':
      return 'info';
    default:
      return undefined;
  }
}

export function normalizeExternalLinks(
  links: (AlExternalLink | null)[] | null | undefined
): ExternalLink[] {
  if (!links) return [];
  return links
    .filter((link): link is AlExternalLink => Boolean(link?.url && link.site))
    .map((link) => ({
      site: link.site,
      url: link.url,
      type: normalizeLinkType(link.type),
      color: link.color ?? undefined,
      language: link.language ?? undefined,
    }));
}

function coverImage(media: AlMedia): Image | undefined {
  const cover = media.coverImage;
  const url = cover?.extraLarge ?? cover?.large;
  if (!url) return undefined;
  return {
    url,
    thumbnailUrl: cover?.large ?? undefined,
    // AniList computes a dominant colour per cover; it drives the contrast of
    // controls that float over the artwork.
    color: cover?.color ?? undefined,
  };
}

/**
 * Display title.
 *
 * English first, then romaji. AniList returns `english: null` for a large share
 * of titles (including currently-airing ones) so falling back is the normal
 * path, not an edge case.
 */
export function displayTitle(media: AlMedia): string {
  return media.title?.english ?? media.title?.romaji ?? media.title?.native ?? 'Untitled';
}

/**
 * Every non-display title variant, de-duplicated.
 *
 * This is what makes searching "Shingeki no Kyojin" match "Attack on Titan":
 * romaji and all synonyms end up here and are scored by lib/titleMatch.
 */
export function alternativeTitles(media: AlMedia): string[] {
  const primary = displayTitle(media);
  const seen = new Set<string>([primary.toLowerCase()]);
  const result: string[] = [];

  const add = (value: string | null | undefined) => {
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(value);
  };

  add(media.title?.romaji);
  add(media.title?.english);
  for (const synonym of media.synonyms ?? []) add(synonym);

  return result;
}

/**
 * Trailer, restricted to YouTube.
 *
 * AniList also lists Dailymotion trailers, which the player component cannot
 * embed; returning one anyway would render a broken frame.
 *
 * The id needs trimming: real responses come back with trailing whitespace
 * (e.g. `"LHtdKWJdif4\t"`), which produces a dead embed URL if passed through.
 */
export function normalizeTrailer(
  trailer: AlMedia['trailer']
): { youtubeId: string; thumbnail?: string } | undefined {
  if (!trailer?.id || trailer.site !== 'youtube') return undefined;

  const youtubeId = trailer.id.trim();
  if (!youtubeId) return undefined;

  return { youtubeId, thumbnail: trailer.thumbnail?.trim() || undefined };
}

export function normalizeAnime(media: AlMedia): Anime {
  return {
    id: makeId(PROVIDER_ID, media.id),
    title: displayTitle(media),
    originalTitle: media.title?.native ?? undefined,
    alternativeTitles: alternativeTitles(media),
    synopsis: stripHtml(media.description),
    artwork: coverImage(media),
    // The banner has no colour of its own; the cover's is the closest available
    // signal for what floats on top of it.
    banner: media.bannerImage
      ? { url: media.bannerImage, color: media.coverImage?.color ?? undefined }
      : undefined,
    genres: (media.genres ?? []).filter((genre): genre is string => Boolean(genre)),
    status: normalizeStatus(media.status),
    year: media.seasonYear ?? undefined,
    season: normalizeSeason(media.season),
    episodeCount: media.episodes ?? undefined,
    nextEpisode: media.nextAiringEpisode
      ? { number: media.nextAiringEpisode.episode, airingAt: media.nextAiringEpisode.airingAt }
      : undefined,
    score: media.averageScore ?? undefined,
    durationMinutes: media.duration ?? undefined,
    studios: (media.studios?.nodes ?? [])
      .map((node) => node?.name)
      .filter((name): name is string => Boolean(name)),
    trailer: normalizeTrailer(media.trailer),
    externalLinks: normalizeExternalLinks(media.externalLinks),
    adult: media.isAdult ?? undefined,
    // MyAnimeList id is carried through because most third-party stream sources
    // key their catalogues on MAL rather than AniList. Read only by stream
    // providers resolving a URL template, never by UI.
    providerMeta: media.idMal ? { malId: media.idMal } : undefined,
  };
}

/**
 * AniList relation types mapped to the domain vocabulary.
 *
 * `SOURCE` and `ADAPTATION` both collapse to `adaptation`: from an anime the
 * manga is its SOURCE, and from the manga the anime is its ADAPTATION. The UI
 * asks the same question in both directions ("is there a counterpart") so the
 * distinction is noise here.
 */
const RELATION_MAP: Record<string, RelationKind> = {
  SEQUEL: 'sequel',
  PREQUEL: 'prequel',
  ADAPTATION: 'adaptation',
  SOURCE: 'adaptation',
  SIDE_STORY: 'sideStory',
  SPIN_OFF: 'sideStory',
  ALTERNATIVE: 'alternative',
  PARENT: 'sideStory',
};

export function normalizeRelation(edge: AlRelationEdge): RelatedMedia | undefined {
  const node = edge.node;
  if (!node?.id) return undefined;

  const relation = RELATION_MAP[edge.relationType ?? ''] ?? 'other';
  const kind = node.type === 'MANGA' ? 'manga' : 'anime';

  const cover = node.coverImage?.extraLarge ?? node.coverImage?.large;

  return {
    relation,
    kind,
    id: makeId(PROVIDER_ID, node.id),
    title: displayTitle(node),
    originalTitle: node.title?.native ?? undefined,
    alternativeTitles: alternativeTitles(node),
    artwork: cover ? { url: cover } : undefined,
    year: node.seasonYear ?? node.startDate?.year ?? undefined,
    format: node.format ?? undefined,
  };
}

export function normalizeRelations(
  edges: (AlRelationEdge | null)[] | null | undefined
): RelatedMedia[] {
  if (!edges) return [];
  return edges
    .filter((edge): edge is AlRelationEdge => edge !== null)
    .map(normalizeRelation)
    .filter((relation): relation is RelatedMedia => relation !== undefined);
}

/**
 * Pull the episode number out of a streaming episode title.
 *
 * AniList surfaces these from streaming partners in the form
 * "Episode 12 - The Title", but the format is not guaranteed; some entries are
 * bare titles. Returning undefined for those is correct; they simply do not
 * enrich a numbered episode.
 */
export function parseStreamingEpisodeNumber(title: string | null | undefined): number | undefined {
  if (!title) return undefined;
  const match = /^\s*Episode\s+(\d+)/i.exec(title);
  if (!match?.[1]) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Strip the "Episode N - " prefix, leaving just the episode's own title. */
export function stripEpisodePrefix(title: string | null | undefined): string | undefined {
  if (!title) return undefined;
  const stripped = title.replace(/^\s*Episode\s+\d+\s*[-–, :]\s*/i, '').trim();
  return stripped && stripped !== title.trim() ? stripped : undefined;
}

/**
 * Build the episode list.
 *
 * AniList has no canonical per-episode endpoint; it exposes a total count plus
 * a partial `streamingEpisodes` array contributed by streaming partners. So the
 * list is generated from the count and enriched where a streaming entry can be
 * matched by number.
 *
 * `airedCount` deliberately excludes unaired episodes: for a releasing show,
 * `episodes` is the *planned* total, and listing 24 episodes when 7 have aired
 * would be fabricating availability.
 */
export function buildEpisodes(input: {
  episodes?: number | null;
  duration?: number | null;
  status?: string | null;
  nextAiringEpisode?: { airingAt: number; episode: number } | null;
  streamingEpisodes?: (AlStreamingEpisode | null)[] | null;
}): Episode[] {
  const total = input.episodes ?? undefined;
  const nextNumber = input.nextAiringEpisode?.episode;

  // While airing, the next episode number minus one is how many have aired.
  const airedCount =
    nextNumber !== undefined ? Math.max(0, nextNumber - 1) : (total ?? 0);

  const count = total ?? airedCount;
  if (count <= 0) return [];

  const enrichment = new Map<number, AlStreamingEpisode>();
  for (const episode of input.streamingEpisodes ?? []) {
    if (!episode) continue;
    const number = parseStreamingEpisodeNumber(episode.title);
    if (number !== undefined && !enrichment.has(number)) enrichment.set(number, episode);
  }

  const episodes: Episode[] = [];
  for (let number = 1; number <= count; number++) {
    const extra = enrichment.get(number);
    episodes.push({
      id: String(number),
      number,
      title: stripEpisodePrefix(extra?.title),
      thumbnail: extra?.thumbnail ? { url: extra.thumbnail } : undefined,
      durationMinutes: input.duration ?? undefined,
      upcoming: number > airedCount,
      airedAt:
        number === nextNumber ? input.nextAiringEpisode?.airingAt : undefined,
    });
  }

  return episodes;
}
