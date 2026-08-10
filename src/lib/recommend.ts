import type { Anime } from '@/domain/anime';

/**
 * Local recommendation scoring.
 *
 * Deliberately built from metadata the app already holds rather than a new
 * service. AniList gives genres, studios, format, score and popularity on every
 * title we fetch, and the library gives what the viewer actually watched, which
 * together answer "more like this" without another dependency or another
 * network round trip.
 *
 * Reko (reko.moe) was investigated as the external option. It works well but
 * matches similar MyAnimeList users and therefore needs a MyAnimeList username,
 * which a local first app with no accounts does not have. It would only ever be
 * an opt in extra, never the base layer, so the base layer is this.
 *
 * Everything here is pure so the weighting is testable and tunable without
 * running the app.
 */

/** Relative influence of each signal. They sum to 1 before adjustment. */
export const WEIGHTS = {
  genre: 0.45,
  studio: 0.2,
  format: 0.1,
  era: 0.1,
  score: 0.15,
} as const;

/**
 * Overlap between two sets of tags, 0..1.
 *
 * Jaccard rather than raw count, so a title carrying twelve genres does not
 * outrank a focused match simply by having more chances to intersect.
 */
export function tagSimilarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  const left = new Set(a.map((tag) => tag.toLowerCase()));
  const right = new Set(b.map((tag) => tag.toLowerCase()));

  let shared = 0;
  for (const tag of left) if (right.has(tag)) shared += 1;

  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Closeness in release year, decaying to zero over roughly a decade. */
export function eraSimilarity(a: number | undefined, b: number | undefined): number {
  if (a === undefined || b === undefined) return 0;
  const distance = Math.abs(a - b);
  return Math.max(0, 1 - distance / 10);
}

/**
 * How well `candidate` matches `seed`, 0..1.
 *
 * Popularity is deliberately not a signal here. It is applied afterwards as a
 * small tie breaker, because letting it into the similarity score turns every
 * recommendation list into the same handful of famous shows.
 */
export function similarityScore(seed: Anime, candidate: Anime): number {
  const genre = tagSimilarity(seed.genres, candidate.genres);
  const studio = tagSimilarity(seed.studios, candidate.studios);
  const format = seed.season !== undefined && seed.season === candidate.season ? 1 : 0;
  const era = eraSimilarity(seed.year, candidate.year);

  // A high scoring candidate is more likely to be worth the viewer's time, but
  // only mildly: this is quality, not similarity.
  const score = candidate.score !== undefined ? candidate.score / 100 : 0.5;

  return (
    genre * WEIGHTS.genre +
    studio * WEIGHTS.studio +
    format * WEIGHTS.format +
    era * WEIGHTS.era +
    score * WEIGHTS.score
  );
}

export interface RankOptions {
  /** Ids already in the library or already watched; never recommended back. */
  exclude?: ReadonlySet<string>;
  limit?: number;
  /** Below this, a candidate is not similar enough to be worth showing. */
  threshold?: number;
}

/**
 * Rank candidates against one seed title.
 *
 * Candidates below the threshold are dropped rather than padded out. A short
 * honest list beats a long one whose tail is unrelated.
 */
export function rankBySimilarity(
  seed: Anime,
  candidates: readonly Anime[],
  options: RankOptions = {}
): Anime[] {
  const { exclude, limit = 20, threshold = 0.15 } = options;

  return candidates
    .filter((candidate) => candidate.id !== seed.id && !exclude?.has(candidate.id))
    .map((candidate) => ({ candidate, score: similarityScore(seed, candidate) }))
    .filter((entry) => entry.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

/**
 * Build a taste profile from what the viewer has actually engaged with.
 *
 * Only genres and studios, and only from titles already on the device. No
 * behavioural data leaves the app and nothing extra is collected to make this
 * work.
 */
export function buildTasteProfile(history: readonly Anime[]): {
  genres: string[];
  studios: string[];
} {
  const genres = new Map<string, number>();
  const studios = new Map<string, number>();

  for (const anime of history) {
    for (const genre of anime.genres) {
      genres.set(genre, (genres.get(genre) ?? 0) + 1);
    }
    for (const studio of anime.studios) {
      studios.set(studio, (studios.get(studio) ?? 0) + 1);
    }
  }

  return {
    genres: topKeys(genres, 6),
    studios: topKeys(studios, 4),
  };
}

/**
 * Rank candidates against a taste profile rather than a single title.
 *
 * Used for "recommended for you". With an empty profile this returns nothing,
 * which is the caller's signal to fall back to trending rather than show an
 * empty section.
 */
export function rankByTaste(
  profile: { genres: readonly string[]; studios: readonly string[] },
  candidates: readonly Anime[],
  options: RankOptions = {}
): Anime[] {
  if (profile.genres.length === 0) return [];

  const { exclude, limit = 20, threshold = 0.1 } = options;

  return candidates
    .filter((candidate) => !exclude?.has(candidate.id))
    .map((candidate) => {
      const genre = tagSimilarity(profile.genres, candidate.genres);
      const studio = tagSimilarity(profile.studios, candidate.studios);
      const score = candidate.score !== undefined ? candidate.score / 100 : 0.5;

      return {
        candidate,
        score: genre * 0.6 + studio * 0.2 + score * 0.2,
      };
    })
    .filter((entry) => entry.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

function topKeys(counts: Map<string, number>, limit: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}
