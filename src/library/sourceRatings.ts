import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local ratings for manga sources.
 *
 * These rate the *source* — reliability, image quality, how complete its
 * chapter list is — not the manga.
 *
 * There is no account system, so these are this device's ratings and are
 * presented that way. Showing a fabricated community average with an invented
 * number of ratings would be inventing data the app does not have.
 */

const KEY = 'hoshi.sourceRatings.v1';

export interface SourceRating {
  sourceId: string;
  /** 1–5. */
  stars: number;
  updatedAt: number;
}

let cache: Map<string, SourceRating> | undefined;

async function load(): Promise<Map<string, SourceRating>> {
  if (cache) return cache;

  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const map = new Map<string, SourceRating>();

    if (Array.isArray(parsed)) {
      for (const entry of parsed as SourceRating[]) {
        if (entry && typeof entry.sourceId === 'string' && Number.isFinite(entry.stars)) {
          map.set(entry.sourceId, entry);
        }
      }
    }

    cache = map;
    return map;
  } catch {
    // A corrupt file should cost the ratings, not prevent reading manga.
    cache = new Map();
    return cache;
  }
}

export async function getSourceRatings(): Promise<Record<string, number>> {
  const map = await load();
  const result: Record<string, number> = {};
  for (const [sourceId, rating] of map) result[sourceId] = rating.stars;
  return result;
}

export async function rateSource(sourceId: string, stars: number): Promise<void> {
  const map = await load();
  const clamped = Math.max(1, Math.min(5, Math.round(stars)));

  map.set(sourceId, { sourceId, stars: clamped, updatedAt: Date.now() });
  await AsyncStorage.setItem(KEY, JSON.stringify([...map.values()]));
}

export async function clearSourceRating(sourceId: string): Promise<void> {
  const map = await load();
  if (!map.delete(sourceId)) return;
  await AsyncStorage.setItem(KEY, JSON.stringify([...map.values()]));
}
