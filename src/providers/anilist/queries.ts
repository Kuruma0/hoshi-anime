/**
 * AniList GraphQL documents.
 *
 * Kept as one shared media fragment so every query returns an identically
 * shaped `Media`, which means normalize.ts has exactly one code path.
 *
 * Field selection is deliberately tight: AniList allows 30 requests/minute, so
 * the cost of an over-broad query is paid in latency on a metered budget.
 */

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  synonyms
  description(asHtml: false)
  coverImage { extraLarge large color }
  bannerImage
  genres
  status
  format
  episodes
  duration
  season
  seasonYear
  averageScore
  isAdult
  studios(isMain: true) { nodes { name } }
  nextAiringEpisode { airingAt episode }
`;

/**
 * Detail view additionally needs links, per-episode metadata and the trailer.
 *
 * Folded into the detail query rather than fetched separately: AniList allows
 * 30 requests a minute, so an extra round trip per detail page is a real cost.
 */
const MEDIA_DETAIL_FIELDS = `
  ${MEDIA_FIELDS}
  externalLinks { site url type color language }
  streamingEpisodes { title thumbnail url site }
  trailer { id site thumbnail }
`;

export const SEARCH_QUERY = `
  query Search($query: String, $page: Int, $perPage: Int, $isAdult: Boolean) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage total }
      media(search: $query, type: ANIME, sort: SEARCH_MATCH, isAdult: $isAdult) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

export const SECTION_QUERY = `
  query Section(
    $page: Int
    $perPage: Int
    $sort: [MediaSort]
    $status: MediaStatus
    $genre: String
    $isAdult: Boolean
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage total }
      media(type: ANIME, sort: $sort, status: $status, genre: $genre, isAdult: $isAdult) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

export const DETAIL_QUERY = `
  query Detail($id: Int) {
    Media(id: $id, type: ANIME) {
      ${MEDIA_DETAIL_FIELDS}
    }
  }
`;

export const EPISODES_QUERY = `
  query Episodes($id: Int) {
    Media(id: $id, type: ANIME) {
      episodes
      duration
      status
      nextAiringEpisode { airingAt episode }
      streamingEpisodes { title thumbnail url site }
    }
  }
`;

/**
 * Weekly schedule.
 *
 * `airingAt` bounds are Unix seconds in UTC. The caller derives them from the
 * device's local week, and day bucketing happens at render time; AniList is
 * never asked to reason about the user's timezone.
 */
export const SCHEDULE_QUERY = `
  query Schedule($start: Int, $end: Int, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
        airingAt
        episode
        media { ${MEDIA_FIELDS} }
      }
    }
  }
`;

export const GENRES_QUERY = `
  query Genres {
    GenreCollection
  }
`;

/**
 * Relationship graph for a title.
 *
 * Backs both season navigation and anime↔manga cross-linking. `type` and
 * `format` are selected so a sequel that is actually a film or an OVA can be
 * told apart from the next TV season.
 */
export const RELATIONS_QUERY = `
  query Relations($id: Int, $type: MediaType) {
    Media(id: $id, type: $type) {
      id
      relations {
        edges {
          relationType
          node {
            id
            type
            format
            title { romaji english native }
            synonyms
            coverImage { extraLarge large }
            startDate { year }
            seasonYear
          }
        }
      }
    }
  }
`;

export const RECOMMENDATIONS_QUERY = `
  query Recommendations($id: Int) {
    Media(id: $id, type: ANIME) {
      recommendations(sort: RATING_DESC, perPage: 12) {
        nodes {
          mediaRecommendation {
            ${MEDIA_FIELDS}
          }
        }
      }
    }
  }
`;
