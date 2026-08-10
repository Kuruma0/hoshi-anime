import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import type { ContentId } from '@/domain/common';
import type { Chapter, Manga } from '@/domain/manga';
import type { OfflineChapter } from './types';

/**
 * Manga chapter downloads.
 *
 * MangaDex serves pages as ordinary images over a documented endpoint, so this
 * is a plain sequence of GETs to app storage. No stream extraction, no
 * protection to work around, nothing clever.
 *
 * The index lives under its own AsyncStorage key and the files under their own
 * directory, both separate from the query cache, so clearing temporary API data
 * can never delete a viewer's downloads.
 *
 * There is no separate download service or background worker. Chapters are
 * fetched one page at a time by the screen that asked for them, which keeps the
 * whole feature to this file plus a hook.
 */

const INDEX_KEY = 'hoshi.offline.manga.v1';
const ROOT = 'hoshi-offline';

/** Page URLs expire, so the bytes are copied rather than the address stored. */
let cache: Map<string, OfflineChapter> | undefined;

function root(): Directory {
  return new Directory(Paths.document, ROOT);
}

function chapterDirectory(chapterId: string): Directory {
  return new Directory(root(), safe(chapterId));
}

/** Ids contain characters that are not safe in a path. */
function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function load(): Promise<Map<string, OfflineChapter>> {
  if (cache) return cache;

  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const map = new Map<string, OfflineChapter>();

    if (Array.isArray(parsed)) {
      for (const entry of parsed as OfflineChapter[]) {
        if (entry && typeof entry.chapterId === 'string') map.set(entry.chapterId, entry);
      }
    }

    cache = map;
    return map;
  } catch {
    // A corrupt index should cost the list, not stop the app opening.
    cache = new Map();
    return cache;
  }
}

async function persist(map: Map<string, OfflineChapter>): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify([...map.values()]));
}

export async function listOffline(): Promise<OfflineChapter[]> {
  return [...(await load()).values()];
}

export async function getOfflineChapter(
  chapterId: string
): Promise<OfflineChapter | undefined> {
  return (await load()).get(chapterId);
}

/** Whether a chapter can be read without a network. */
export async function isDownloaded(chapterId: string): Promise<boolean> {
  const entry = (await load()).get(chapterId);
  return entry?.status === 'downloaded' && entry.pages.length > 0;
}

export interface DownloadRequest {
  manga: Manga;
  chapter: Chapter;
  /** Page URLs already resolved by the provider. */
  pageUrls: string[];
  /** Reports 0..1 as pages land, so a screen can show a bar. */
  onProgress?: (progress: number) => void;
}

/**
 * Download one chapter.
 *
 * Pages are fetched sequentially rather than in parallel: MangaDex asks
 * clients not to hammer its image hosts, and a chapter is thirty odd files, so
 * there is nothing to gain from flooding.
 *
 * A failure leaves the entry marked failed with its partial files removed, so a
 * retry starts clean rather than resuming into a half written directory.
 */
export async function downloadChapter(request: DownloadRequest): Promise<OfflineChapter> {
  const { manga, chapter, pageUrls, onProgress } = request;
  const map = await load();

  const entry: OfflineChapter = {
    chapterId: chapter.id,
    mangaId: manga.id,
    mangaTitle: manga.title,
    cover: manga.cover,
    chapterNumber: chapter.number,
    chapterTitle: chapter.title,
    language: chapter.language,
    pages: [],
    pageCount: pageUrls.length,
    status: 'downloading',
    progress: 0,
    bytes: 0,
    updatedAt: Date.now(),
  };

  map.set(chapter.id, entry);
  await persist(map);

  try {
    const directory = chapterDirectory(chapter.id);
    if (!directory.exists) directory.create({ intermediates: true });

    const pages: string[] = [];
    let bytes = 0;

    for (const [index, url] of pageUrls.entries()) {
      const name = `${String(index).padStart(4, '0')}${extensionOf(url)}`;
      const file = await File.downloadFileAsync(url, new File(directory, name));

      pages.push(file.uri);
      bytes += file.size ?? 0;

      const progress = (index + 1) / pageUrls.length;
      entry.progress = progress;
      onProgress?.(progress);
    }

    const done: OfflineChapter = {
      ...entry,
      pages,
      bytes,
      progress: 1,
      status: 'downloaded',
      updatedAt: Date.now(),
    };

    map.set(chapter.id, done);
    await persist(map);
    return done;
  } catch (error) {
    // Remove the partial directory so a retry is not resuming into rubble.
    await removeFiles(chapter.id);

    const failed: OfflineChapter = {
      ...entry,
      pages: [],
      progress: 0,
      status: 'failed',
      updatedAt: Date.now(),
      error: 'Download failed',
    };

    map.set(chapter.id, failed);
    await persist(map);
    throw error;
  }
}

/** Delete one chapter's files and index entry. */
export async function deleteChapter(chapterId: string): Promise<void> {
  const map = await load();
  await removeFiles(chapterId);
  map.delete(chapterId);
  await persist(map);
}

/** Delete every downloaded chapter for one manga. */
export async function deleteManga(mangaId: ContentId): Promise<void> {
  const map = await load();

  for (const entry of [...map.values()]) {
    if (entry.mangaId !== mangaId) continue;
    await removeFiles(entry.chapterId);
    map.delete(entry.chapterId);
  }

  await persist(map);
}

/** Delete every download. Used by the Settings storage control. */
export async function deleteAllDownloads(): Promise<void> {
  const map = await load();

  for (const chapterId of [...map.keys()]) {
    await removeFiles(chapterId);
  }

  map.clear();
  await persist(map);
}

async function removeFiles(chapterId: string): Promise<void> {
  try {
    const directory = chapterDirectory(chapterId);
    if (directory.exists) directory.delete();
  } catch {
    // A missing directory is the desired end state anyway.
  }
}

/**
 * Free space on the device, in bytes.
 *
 * Used to refuse a download that cannot possibly fit rather than failing part
 * way through and leaving the viewer to work out why.
 */
export function availableBytes(): number {
  try {
    return Paths.availableDiskSpace ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Rough size for a chapter before downloading it.
 *
 * MangaDex pages run around 1 MB, so this is an estimate and is presented as
 * one. It exists to catch "you have 40 MB free and this is 30 pages", not to
 * be precise.
 */
export function estimateBytes(pageCount: number): number {
  return pageCount * 1024 * 1024;
}

function extensionOf(url: string): string {
  const match = /\.(jpg|jpeg|png|webp|gif)(?:\?|$)/i.exec(url);
  return match ? `.${match[1]!.toLowerCase()}` : '.jpg';
}

/** Test hook: drops the in memory index so the next read hits storage. */
export function resetOfflineCache(): void {
  cache = undefined;
}
