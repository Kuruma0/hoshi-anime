import type { ContentId, Image } from '@/domain/common';

/**
 * Offline downloads.
 *
 * Deliberately separate from the query cache. Clearing temporary API data must
 * never take a viewer's downloads with it, so the two live in different storage
 * keys and different directories.
 */

export type DownloadStatus = 'queued' | 'downloading' | 'downloaded' | 'failed';

/** One chapter saved to the device. */
export interface OfflineChapter {
  /** Provider chapter id, unique across sources. */
  chapterId: string;
  mangaId: ContentId;
  mangaTitle: string;
  cover?: Image;

  chapterNumber?: string;
  chapterTitle?: string;
  language: string;

  /** Local file URIs in reading order. Empty until the download completes. */
  pages: string[];
  pageCount: number;

  status: DownloadStatus;
  /** 0..1, meaningful while downloading. */
  progress: number;
  /** Bytes on disk once complete. */
  bytes: number;
  /** Unix ms. */
  updatedAt: number;
  /** Why a failed download failed, for the retry affordance. Never a raw error. */
  error?: string;
}

/** A manga with at least one downloaded chapter, for the offline list. */
export interface OfflineManga {
  mangaId: ContentId;
  title: string;
  cover?: Image;
  chapters: OfflineChapter[];
  bytes: number;
}

/** Groups chapters under their manga, newest activity first. */
export function groupByManga(chapters: readonly OfflineChapter[]): OfflineManga[] {
  const groups = new Map<ContentId, OfflineManga>();

  for (const chapter of chapters) {
    const existing = groups.get(chapter.mangaId);
    if (existing) {
      existing.chapters.push(chapter);
      existing.bytes += chapter.bytes;
      continue;
    }

    groups.set(chapter.mangaId, {
      mangaId: chapter.mangaId,
      title: chapter.mangaTitle,
      cover: chapter.cover,
      chapters: [chapter],
      bytes: chapter.bytes,
    });
  }

  for (const group of groups.values()) {
    group.chapters.sort((a, b) => compareChapterNumbers(a.chapterNumber, b.chapterNumber));
  }

  return [...groups.values()].sort((a, b) => latest(b.chapters) - latest(a.chapters));
}

function latest(chapters: readonly OfflineChapter[]): number {
  return chapters.reduce((max, chapter) => Math.max(max, chapter.updatedAt), 0);
}

/** Chapter numbers are not numbers: "10.5" and "Extra" both occur. */
function compareChapterNumbers(a: string | undefined, b: string | undefined): number {
  const left = a === undefined ? NaN : Number.parseFloat(a);
  const right = b === undefined ? NaN : Number.parseFloat(b);

  const leftValid = Number.isFinite(left);
  const rightValid = Number.isFinite(right);

  if (leftValid && rightValid) return left - right;
  if (leftValid) return -1;
  if (rightValid) return 1;
  return (a ?? '').localeCompare(b ?? '');
}

/** Human readable size, e.g. "1.2 GB". */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';

  const megabytes = bytes / (1024 * 1024);
  if (megabytes < 1) return '<1 MB';
  if (megabytes < 1024) return `${Math.round(megabytes)} MB`;
  return `${(megabytes / 1024).toFixed(1)} GB`;
}

/** Total bytes across everything downloaded. */
export function totalBytes(chapters: readonly OfflineChapter[]): number {
  return chapters.reduce((sum, chapter) => sum + chapter.bytes, 0);
}
