import type { ContentId, Image, MediaKind } from '@/domain/common';

/** A saved title. Stores just enough to render a library row offline. */
export interface LibraryEntry {
  id: ContentId;
  kind: MediaKind;
  title: string;
  image?: Image;
  /** Unix ms. */
  addedAt: number;
}

export interface WatchProgress {
  animeId: ContentId;
  episodeNumber: number;
  /** Seconds into the episode. 0 when the source reports no position. */
  positionSeconds: number;
  /** Total runtime in seconds, when the player knows it. */
  durationSeconds?: number;
  /** Unix ms. */
  updatedAt: number;
  title: string;
  image?: Image;
}

export interface ReadProgress {
  mangaId: ContentId;
  chapterId: string;
  /** As published; "10.5" and "Extra" are both valid. */
  chapterNumber?: string;
  /** 0-based index of the last page seen. */
  page: number;
  pageCount: number;
  /** Unix ms. */
  updatedAt: number;
  title: string;
  image?: Image;
}

/**
 * Persistence boundary.
 *
 * Local-first by design: no account, no network, works offline from first
 * launch. The interface exists so a synced implementation can be added later
 * without touching a screen; §16 asks for exactly that room.
 */
export interface LibraryRepository {
  getEntries(kind: MediaKind): Promise<LibraryEntry[]>;
  isSaved(id: ContentId): Promise<boolean>;
  addEntry(entry: Omit<LibraryEntry, 'addedAt'>): Promise<void>;
  removeEntry(id: ContentId): Promise<void>;

  getWatchProgress(animeId: ContentId): Promise<WatchProgress | undefined>;
  setWatchProgress(progress: Omit<WatchProgress, 'updatedAt'>): Promise<void>;
  /** Most recently watched first. */
  listWatchProgress(limit?: number): Promise<WatchProgress[]>;

  getReadProgress(mangaId: ContentId): Promise<ReadProgress | undefined>;
  setReadProgress(progress: Omit<ReadProgress, 'updatedAt'>): Promise<void>;
  /** Most recently read first. */
  listReadProgress(limit?: number): Promise<ReadProgress[]>;

  clear(): Promise<void>;
}

/** A title is finished when the viewer is within this fraction of the end. */
export const COMPLETION_THRESHOLD = 0.92;

/** Whether an episode counts as watched, so it drops off Continue Watching. */
export function isEpisodeComplete(progress: WatchProgress): boolean {
  if (!progress.durationSeconds) return false;
  return progress.positionSeconds / progress.durationSeconds >= COMPLETION_THRESHOLD;
}

/** Whether a chapter counts as read. */
export function isChapterComplete(progress: ReadProgress): boolean {
  if (progress.pageCount <= 0) return false;
  return (progress.page + 1) / progress.pageCount >= COMPLETION_THRESHOLD;
}
