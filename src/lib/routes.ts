import type { Href } from 'expo-router';
import type { ContentId, MediaKind } from '@/domain/common';

/**
 * Every route path in one place.
 *
 * Previously each screen built its own `/anime/${encodeURIComponent(id)}`
 * string. That is the kind of duplication that lets one call site quietly
 * forget to encode an id — and ids contain a colon.
 *
 * Typed routes are on, so `router.push` wants a `Href` rather than a string.
 * Paths built from runtime values cannot be checked against the generated route
 * union, so they are asserted here — once, in the module whose job is to get
 * them right — instead of at every call site.
 */
const href = (path: string): Href => path as Href;

export const routes = {
  home: () => href('/'),
  animeHome: () => href('/anime'),
  mangaHome: () => href('/manga'),
  schedule: () => href('/schedule'),
  settings: () => href('/settings'),

  anime: (id: ContentId) => href(`/anime/${encodeURIComponent(id)}`),
  manga: (id: ContentId) => href(`/manga/${encodeURIComponent(id)}`),

  detail: (kind: MediaKind, id: ContentId) =>
    kind === 'anime' ? routes.anime(id) : routes.manga(id),

  watch: (animeId: ContentId, episodeNumber: number) =>
    href(`/anime/${encodeURIComponent(animeId)}/watch/${episodeNumber}`),

  read: (mangaId: ContentId, chapterId: string) =>
    href(`/manga/${encodeURIComponent(mangaId)}/read/${encodeURIComponent(chapterId)}`),

  genre: (kind: MediaKind, genre: string) =>
    href(`/browse/${kind}/genre/${encodeURIComponent(genre)}`),

  section: (kind: MediaKind, section: string) =>
    href(`/browse/${kind}/section/${encodeURIComponent(section)}`),
} as const;
