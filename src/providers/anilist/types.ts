/**
 * Raw AniList response shapes.
 *
 * Only the fields queries.ts actually requests are modelled. Anything not
 * listed here is not selected, so it cannot silently appear in normalize.ts.
 */

export interface AlTitle {
  romaji?: string | null;
  /** Frequently null — many titles have no official English name. */
  english?: string | null;
  native?: string | null;
}

export interface AlCoverImage {
  extraLarge?: string | null;
  large?: string | null;
  /** Dominant colour, used as an image placeholder tint. */
  color?: string | null;
}

export interface AlExternalLink {
  site: string;
  url: string;
  /** "STREAMING" | "INFO" | "SOCIAL" */
  type?: string | null;
  color?: string | null;
  language?: string | null;
}

export interface AlStreamingEpisode {
  /** Usually formatted "Episode 12 - The Title". */
  title?: string | null;
  thumbnail?: string | null;
  url?: string | null;
  site?: string | null;
}

export interface AlMedia {
  id: number;
  idMal?: number | null;
  title?: AlTitle | null;
  synonyms?: (string | null)[] | null;
  description?: string | null;
  coverImage?: AlCoverImage | null;
  bannerImage?: string | null;
  genres?: (string | null)[] | null;
  /** FINISHED | RELEASING | NOT_YET_RELEASED | CANCELLED | HIATUS */
  status?: string | null;
  format?: string | null;
  episodes?: number | null;
  duration?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  /** 0–100. */
  averageScore?: number | null;
  isAdult?: boolean | null;
  studios?: { nodes?: ({ name?: string | null } | null)[] | null } | null;
  nextAiringEpisode?: { airingAt: number; episode: number } | null;
  externalLinks?: (AlExternalLink | null)[] | null;
  streamingEpisodes?: (AlStreamingEpisode | null)[] | null;
  startDate?: { year?: number | null } | null;
  /** `site` is usually "youtube" but can be "dailymotion". */
  trailer?: { id?: string | null; site?: string | null; thumbnail?: string | null } | null;
  /** ANIME | MANGA — present on relation nodes. */
  type?: string | null;
}

export interface AlRelationEdge {
  /** SEQUEL | PREQUEL | ADAPTATION | SOURCE | SIDE_STORY | ALTERNATIVE | ... */
  relationType?: string | null;
  node?: AlMedia | null;
}

export interface AlRelationsData {
  Media?: {
    id: number;
    relations?: { edges?: (AlRelationEdge | null)[] | null } | null;
  } | null;
}

export interface AlPageInfo {
  hasNextPage?: boolean | null;
  total?: number | null;
}

export interface AlAiringSchedule {
  airingAt: number;
  episode: number;
  media?: AlMedia | null;
}

export interface AlGraphQLResponse<T> {
  data?: T | null;
  errors?: { message: string; status?: number }[] | null;
}

export interface AlSearchData {
  Page?: { pageInfo?: AlPageInfo | null; media?: (AlMedia | null)[] | null } | null;
}

export interface AlScheduleData {
  Page?: {
    pageInfo?: AlPageInfo | null;
    airingSchedules?: (AlAiringSchedule | null)[] | null;
  } | null;
}

export interface AlDetailData {
  Media?: AlMedia | null;
}

export interface AlEpisodesData {
  Media?: Pick<
    AlMedia,
    'episodes' | 'duration' | 'status' | 'nextAiringEpisode' | 'streamingEpisodes'
  > | null;
}

export interface AlGenresData {
  GenreCollection?: (string | null)[] | null;
}

export interface AlRecommendationsData {
  Media?: {
    recommendations?: {
      nodes?: ({ mediaRecommendation?: AlMedia | null } | null)[] | null;
    } | null;
  } | null;
}
