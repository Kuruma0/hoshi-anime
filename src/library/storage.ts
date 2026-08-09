import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ContentId, MediaKind } from '@/domain/common';
import type {
  LibraryEntry,
  LibraryRepository,
  ReadProgress,
  WatchProgress,
} from './types';

const KEYS = {
  entries: 'hoshi.library.entries.v1',
  watch: 'hoshi.progress.watch.v1',
  read: 'hoshi.progress.read.v1',
} as const;

/**
 * AsyncStorage-backed library.
 *
 * Each collection is one JSON blob rather than a key per item: these lists are
 * small (hundreds of entries at most) and are always read whole, so a single
 * round trip beats N reads. If they ever grow past that, this class is the only
 * thing that changes.
 *
 * Reads are cached in memory after the first load so the Library tab and every
 * "is this saved?" check do not each hit storage.
 */
export class AsyncStorageLibrary implements LibraryRepository {
  private entries?: Map<ContentId, LibraryEntry>;
  private watch?: Map<ContentId, WatchProgress>;
  private read?: Map<ContentId, ReadProgress>;

  /* ---------------------------------------------------------------- */
  /* Saved titles                                                      */
  /* ---------------------------------------------------------------- */

  async getEntries(kind: MediaKind): Promise<LibraryEntry[]> {
    const entries = await this.loadEntries();
    return [...entries.values()]
      .filter((entry) => entry.kind === kind)
      .sort((a, b) => b.addedAt - a.addedAt);
  }

  async isSaved(id: ContentId): Promise<boolean> {
    return (await this.loadEntries()).has(id);
  }

  async addEntry(entry: Omit<LibraryEntry, 'addedAt'>): Promise<void> {
    const entries = await this.loadEntries();
    // Preserve the original addedAt so re-saving does not reorder the library.
    const addedAt = entries.get(entry.id)?.addedAt ?? Date.now();
    entries.set(entry.id, { ...entry, addedAt });
    await this.persist(KEYS.entries, entries);
  }

  async removeEntry(id: ContentId): Promise<void> {
    const entries = await this.loadEntries();
    if (!entries.delete(id)) return;
    await this.persist(KEYS.entries, entries);
  }

  /* ---------------------------------------------------------------- */
  /* Progress                                                          */
  /* ---------------------------------------------------------------- */

  async getWatchProgress(animeId: ContentId): Promise<WatchProgress | undefined> {
    return (await this.loadWatch()).get(animeId);
  }

  async setWatchProgress(progress: Omit<WatchProgress, 'updatedAt'>): Promise<void> {
    const watch = await this.loadWatch();
    watch.set(progress.animeId, { ...progress, updatedAt: Date.now() });
    await this.persist(KEYS.watch, watch);
  }

  async listWatchProgress(limit = 20): Promise<WatchProgress[]> {
    const watch = await this.loadWatch();
    return [...watch.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  }

  async getReadProgress(mangaId: ContentId): Promise<ReadProgress | undefined> {
    return (await this.loadRead()).get(mangaId);
  }

  async setReadProgress(progress: Omit<ReadProgress, 'updatedAt'>): Promise<void> {
    const read = await this.loadRead();
    read.set(progress.mangaId, { ...progress, updatedAt: Date.now() });
    await this.persist(KEYS.read, read);
  }

  async listReadProgress(limit = 20): Promise<ReadProgress[]> {
    const read = await this.loadRead();
    return [...read.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  }

  async clear(): Promise<void> {
    await AsyncStorage.multiRemove([KEYS.entries, KEYS.watch, KEYS.read]);
    this.entries = undefined;
    this.watch = undefined;
    this.read = undefined;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private async loadEntries(): Promise<Map<ContentId, LibraryEntry>> {
    this.entries ??= await load<LibraryEntry>(KEYS.entries, (entry) => entry.id);
    return this.entries;
  }

  private async loadWatch(): Promise<Map<ContentId, WatchProgress>> {
    this.watch ??= await load<WatchProgress>(KEYS.watch, (entry) => entry.animeId);
    return this.watch;
  }

  private async loadRead(): Promise<Map<ContentId, ReadProgress>> {
    this.read ??= await load<ReadProgress>(KEYS.read, (entry) => entry.mangaId);
    return this.read;
  }

  private async persist(key: string, map: Map<string, unknown>): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify([...map.values()]));
  }
}

/**
 * Read a collection from storage.
 *
 * Corrupt or half-written JSON resolves to an empty collection rather than
 * throwing: a user's library failing to parse should cost them their list, not
 * prevent the app from opening.
 */
async function load<T>(key: string, getId: (item: T) => string): Promise<Map<string, T>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return new Map();

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Map();

    const map = new Map<string, T>();
    for (const item of parsed as T[]) {
      const id = getId(item);
      if (typeof id === 'string' && id) map.set(id, item);
    }
    return map;
  } catch {
    return new Map();
  }
}

export const library: LibraryRepository = new AsyncStorageLibrary();
