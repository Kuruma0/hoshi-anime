import type { AnimeSection, MangaSection } from '@/providers/types';

/**
 * Query keys, in one place.
 *
 * Centralised so invalidation is a single call; saving a title has to refresh
 * the library list, the detail page's saved flag, and Continue Watching, and
 * those three would otherwise drift apart.
 */
export const keys = {
  anime: {
    all: ['anime'] as const,
    section: (section: AnimeSection) => ['anime', 'section', section] as const,
    detail: (id: string) => ['anime', 'detail', id] as const,
    episodes: (id: string) => ['anime', 'episodes', id] as const,
    genres: () => ['anime', 'genres'] as const,
    byGenre: (genre: string) => ['anime', 'genre', genre] as const,
    search: (query: string) => ['anime', 'search', query] as const,
    schedule: (start: number, end: number) => ['anime', 'schedule', start, end] as const,
    recommendations: (id: string) => ['anime', 'recommendations', id] as const,
    playback: (animeId: string, episode: number) =>
      ['anime', 'playback', animeId, episode] as const,
  },
  manga: {
    all: ['manga'] as const,
    section: (section: MangaSection) => ['manga', 'section', section] as const,
    detail: (id: string) => ['manga', 'detail', id] as const,
    chapters: (id: string, language: string) => ['manga', 'chapters', id, language] as const,
    pages: (chapterId: string) => ['manga', 'pages', chapterId] as const,
    genres: () => ['manga', 'genres'] as const,
    byGenre: (genre: string) => ['manga', 'genre', genre] as const,
    search: (query: string) => ['manga', 'search', query] as const,
  },
  library: {
    all: ['library'] as const,
    entries: (kind: 'anime' | 'manga') => ['library', 'entries', kind] as const,
    saved: (id: string) => ['library', 'saved', id] as const,
    watchProgress: (id: string) => ['library', 'watch', id] as const,
    readProgress: (id: string) => ['library', 'read', id] as const,
    continueWatching: () => ['library', 'continue', 'watching'] as const,
    continueReading: () => ['library', 'continue', 'reading'] as const,
  },
} as const;
