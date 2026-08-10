import type { Anime } from '@/domain/anime';

/**
 * Local recommendation engine.
 *
 * Deterministic and rule based. There is no machine learning here, no model
 * weights learned from data and nothing sent anywhere: every number below was
 * chosen by hand and every output can be traced back through
 * `ScoreBreakdown` to the inputs that produced it. That is a deliberate choice,
 * not a limitation waiting to be fixed. A local first app with no accounts has
 * one viewer's history to work from, which is far too little to train anything,
 * and a transparent formula can be explained to the person it is ranking for.
 *
 * The pipeline, in order:
 *
 *   signals      what the viewer did, weighted by how much it reveals
 *      |
 *   profile      weighted genre and studio affinity, plus a quality baseline
 *      |
 *   candidates   supplied by the caller, pooled from several sections
 *      |
 *   score        five weighted components, summing to 1
 *      |
 *   filter       drop what they have already seen or saved
 *      |
 *   diversify    greedy re-rank so the row is not ten of the same thing
 *      |
 *   explain      a short reason derived from the winning component
 *
 * Everything is pure so the weighting is testable and tunable without running
 * the app. The data layer in `src/data/recommendations.ts` owns fetching and
 * caching; this module never touches the network.
 *
 * Reko (reko.moe) was investigated as an external source. It works, but it
 * matches similar MyAnimeList users and therefore needs a MyAnimeList
 * username, which this app has no way to obtain and no reason to ask for. It
 * could only ever be an opt in extra layered on top, never the base, so the
 * base is this.
 */

/* -------------------------------------------------------------------------- */
/* Signals                                                                     */
/* -------------------------------------------------------------------------- */

/** What the viewer did with a title. One title yields exactly one signal. */
export type SignalKind = 'completed' | 'watching' | 'saved' | 'abandoned';

export interface TasteSignal {
  anime: Anime;
  kind: SignalKind;
  /** When the viewer last touched it, Unix ms. Drives recency decay. */
  updatedAt: number;
}

/**
 * How much each action says about taste.
 *
 * Finishing a series is the strongest available statement, because it is the
 * only one that costs hours. Saving is explicit intent but cheap, so it sits
 * below finishing. Abandoning is negative but small: people drop shows for
 * reasons that have nothing to do with genre, so one abandoned title nudges
 * rather than vetoes, and it takes several in the same genre to matter.
 *
 * There is deliberately no rating weight. This app has no per title user
 * rating for anime, so a rating term would be documentation describing code
 * that does not exist.
 */
export const SIGNAL_WEIGHTS: Record<SignalKind, number> = {
  completed: 1.0,
  watching: 0.6,
  saved: 0.5,
  abandoned: -0.35,
};

/** Recency half life, in days. Older activity still counts, but less. */
export const RECENCY_HALF_LIFE_DAYS = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Recency multiplier, 1 at now, 0.5 one half life ago, approaching 0.
 *
 * Exponential rather than a cliff, so taste drifts smoothly instead of a whole
 * season of history vanishing on an arbitrary boundary.
 */
export function recencyWeight(updatedAt: number, now: number): number {
  const ageDays = Math.max(0, (now - updatedAt) / DAY_MS);
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

/* -------------------------------------------------------------------------- */
/* Preference profile                                                          */
/* -------------------------------------------------------------------------- */

export interface TasteProfile {
  /** Genre to affinity, normalised so the strongest genre is 1. */
  genres: Map<string, number>;
  /** Studio to affinity, same normalisation. */
  studios: Map<string, number>;
  /** Mean provider score of what they engaged with, 0..1. Undefined if none. */
  qualityBaseline?: number;
  /** Mean release year of positive signals. Undefined if none. */
  eraCentre?: number;
  /** Positive signals used. Below `MIN_PROFILE_SIGNALS` the profile is thin. */
  sampleSize: number;
}

/** Fewer positive signals than this and personalisation is not yet meaningful. */
export const MIN_PROFILE_SIGNALS = 2;

/**
 * Fold the viewer's activity into weighted genre and studio affinity.
 *
 * Each signal contributes `SIGNAL_WEIGHTS[kind] * recency` to every genre and
 * studio on that title. Negative signals subtract, which is how a repeatedly
 * abandoned genre falls away without ever being explicitly blocked. Affinities
 * are then clamped at zero and normalised, so the profile describes relative
 * preference rather than how much the viewer happens to have watched.
 */
export function buildTasteProfile(
  signals: readonly TasteSignal[],
  now: number = Date.now()
): TasteProfile {
  const genres = new Map<string, number>();
  const studios = new Map<string, number>();

  let scoreTotal = 0;
  let scoreWeight = 0;
  let yearTotal = 0;
  let yearWeight = 0;
  let sampleSize = 0;

  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.kind] * recencyWeight(signal.updatedAt, now);
    if (weight === 0) continue;

    for (const genre of signal.anime.genres) {
      const key = genre.toLowerCase();
      genres.set(key, (genres.get(key) ?? 0) + weight);
    }
    for (const studio of signal.anime.studios) {
      const key = studio.toLowerCase();
      studios.set(key, (studios.get(key) ?? 0) + weight);
    }

    // Quality and era describe what the viewer likes, so only positive
    // signals shape them. A dropped show should not pull the baseline.
    if (weight > 0) {
      sampleSize += 1;
      if (signal.anime.score !== undefined) {
        scoreTotal += (signal.anime.score / 100) * weight;
        scoreWeight += weight;
      }
      if (signal.anime.year !== undefined) {
        yearTotal += signal.anime.year * weight;
        yearWeight += weight;
      }
    }
  }

  return {
    genres: normalise(genres),
    studios: normalise(studios),
    qualityBaseline: scoreWeight > 0 ? scoreTotal / scoreWeight : undefined,
    eraCentre: yearWeight > 0 ? yearTotal / yearWeight : undefined,
    sampleSize,
  };
}

/** Clamp negatives to zero and scale so the strongest entry is 1. */
function normalise(counts: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const value of counts.values()) if (value > max) max = value;
  if (max <= 0) return new Map();

  const result = new Map<string, number>();
  for (const [key, value] of counts) {
    if (value > 0) result.set(key, value / max);
  }
  return result;
}

/** Whether the profile has enough behind it to personalise from. */
export function isProfileUsable(profile: TasteProfile): boolean {
  return profile.sampleSize >= MIN_PROFILE_SIGNALS && profile.genres.size > 0;
}

/* -------------------------------------------------------------------------- */
/* Similarity                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Overlap between two tag sets, 0..1.
 *
 * Jaccard rather than a raw count, so a title carrying twelve genres does not
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

/**
 * How well a candidate's tags match a weighted profile, 0..1.
 *
 * The profile's own weights are the numerator, so matching a genre the viewer
 * strongly prefers counts for more than matching one they touched once. The
 * denominator is the candidate's tag count, which keeps a title tagged with
 * everything from scoring highly by breadth alone.
 */
export function profileAffinity(
  profile: ReadonlyMap<string, number>,
  tags: readonly string[]
): number {
  if (profile.size === 0 || tags.length === 0) return 0;

  let matched = 0;
  for (const tag of tags) {
    matched += profile.get(tag.toLowerCase()) ?? 0;
  }

  return Math.min(1, matched / tags.length);
}

/** Closeness in release year, decaying to zero over roughly a decade. */
export function eraSimilarity(a: number | undefined, b: number | undefined): number {
  if (a === undefined || b === undefined) return 0;
  return Math.max(0, 1 - Math.abs(a - b) / 10);
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Component weights for the personalised score. They sum to exactly 1.
 *
 * Genre dominates because it is the signal AniList reports most consistently
 * and the one viewers describe their own taste in. Popularity is last and
 * small on purpose: give it real weight and every list collapses into the same
 * handful of famous shows regardless of who is looking at it.
 */
export const WEIGHTS = {
  genre: 0.5,
  studio: 0.2,
  quality: 0.15,
  era: 0.1,
  popularity: 0.05,
} as const;

/** Per component contribution, kept so a score can be explained and debugged. */
export interface ScoreBreakdown {
  genre: number;
  studio: number;
  quality: number;
  era: number;
  popularity: number;
  /** Weighted sum of the above, 0..1. */
  total: number;
}

export interface ScoredAnime {
  anime: Anime;
  score: number;
  breakdown: ScoreBreakdown;
  /** Short viewer-facing sentence. See `explain`. */
  reason: string;
}

/**
 * Score one candidate against a profile.
 *
 * `quality` rewards a candidate for sitting at or above the viewer's own
 * baseline rather than for being highly rated in absolute terms, so someone
 * who watches well-regarded shows gets well-regarded suggestions and someone
 * with broader taste is not restricted to the top hundred.
 */
export function scoreAgainstProfile(profile: TasteProfile, candidate: Anime): ScoreBreakdown {
  const genre = profileAffinity(profile.genres, candidate.genres);
  const studio = profileAffinity(profile.studios, candidate.studios);

  const candidateScore = candidate.score !== undefined ? candidate.score / 100 : 0.5;
  const quality =
    profile.qualityBaseline === undefined
      ? candidateScore
      : Math.max(0, Math.min(1, 1 - (profile.qualityBaseline - candidateScore)));

  const era = eraSimilarity(profile.eraCentre, candidate.year);

  // Provider score doubles as the popularity prior: it is the only broad
  // quality figure every candidate carries, and it is already normalised.
  const popularity = candidateScore;

  const total =
    genre * WEIGHTS.genre +
    studio * WEIGHTS.studio +
    quality * WEIGHTS.quality +
    era * WEIGHTS.era +
    popularity * WEIGHTS.popularity;

  return { genre, studio, quality, era, popularity, total };
}

/**
 * Score one candidate against a single seed title, for "more like this".
 *
 * Same shape as the profile path so both feed the same ranking and diversity
 * code, but similarity is measured against one title rather than a profile.
 */
export function scoreAgainstSeed(seed: Anime, candidate: Anime): ScoreBreakdown {
  const genre = tagSimilarity(seed.genres, candidate.genres);
  const studio = tagSimilarity(seed.studios, candidate.studios);
  const candidateScore = candidate.score !== undefined ? candidate.score / 100 : 0.5;
  const era = eraSimilarity(seed.year, candidate.year);

  const total =
    genre * WEIGHTS.genre +
    studio * WEIGHTS.studio +
    candidateScore * WEIGHTS.quality +
    era * WEIGHTS.era +
    candidateScore * WEIGHTS.popularity;

  return { genre, studio, quality: candidateScore, era, popularity: candidateScore, total };
}

/* -------------------------------------------------------------------------- */
/* Explanation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Why this title was picked, in the viewer's terms.
 *
 * Derived from whichever component contributed most after weighting, so the
 * sentence always corresponds to the arithmetic that actually chose it. Genre
 * names come from the candidate itself, intersected with the profile, so the
 * reason names something the viewer can recognise.
 */
export function explain(
  profile: TasteProfile,
  candidate: Anime,
  breakdown: ScoreBreakdown
): string {
  const contributions: [keyof typeof WEIGHTS, number][] = [
    ['genre', breakdown.genre * WEIGHTS.genre],
    ['studio', breakdown.studio * WEIGHTS.studio],
    ['quality', breakdown.quality * WEIGHTS.quality],
    ['era', breakdown.era * WEIGHTS.era],
  ];

  const [leader] = contributions.sort((a, b) => b[1] - a[1]);
  if (!leader || leader[1] <= 0) return 'Popular with viewers';

  switch (leader[0]) {
    case 'genre': {
      const shared = topShared(profile.genres, candidate.genres, 2);
      return shared.length > 0
        ? `Matches your interest in ${humanList(shared)}`
        : 'Similar to what you watch';
    }
    case 'studio': {
      const shared = topShared(profile.studios, candidate.studios, 1);
      return shared.length > 0 ? `From ${humanList(shared)}` : 'From a studio you watch';
    }
    case 'quality':
      return 'Rated as highly as your favourites';
    default:
      return 'From around the years you watch';
  }
}

/** The candidate's own tags that the profile also holds, strongest first. */
function topShared(
  profile: ReadonlyMap<string, number>,
  tags: readonly string[],
  limit: number
): string[] {
  return tags
    .map((tag) => ({ tag, weight: profile.get(tag.toLowerCase()) ?? 0 }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((entry) => entry.tag);
}

function humanList(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

/* -------------------------------------------------------------------------- */
/* Diversity                                                                   */
/* -------------------------------------------------------------------------- */

/** How much a repeated genre costs, as a fraction of the candidate's score. */
export const DIVERSITY_PENALTY = 0.35;

/** No more than this many titles from any one studio in a single row. */
export const MAX_PER_STUDIO = 2;

/**
 * Greedy re-rank so the row is not ten variations of one thing.
 *
 * Take the best remaining candidate, then penalise everything that overlaps
 * what has already been taken and repeat. This is a maximal marginal relevance
 * re-rank: relevance still leads, but a title that adds something new can
 * overtake a marginally better near-duplicate. A hard studio cap sits on top,
 * because genre overlap alone does not stop a row filling with one studio's
 * back catalogue.
 *
 * Order matters and ties are broken by the incoming order, so the result is
 * deterministic for a given input.
 */
export function diversify(scored: readonly ScoredAnime[], limit: number): ScoredAnime[] {
  const remaining = [...scored];
  const picked: ScoredAnime[] = [];
  const seenGenres = new Map<string, number>();
  const studioCounts = new Map<string, number>();

  while (picked.length < limit && remaining.length > 0) {
    let bestIndex = -1;
    let bestAdjusted = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const entry = remaining[index]!;

      if (entry.anime.studios.some((studio) => {
        return (studioCounts.get(studio.toLowerCase()) ?? 0) >= MAX_PER_STUDIO;
      })) {
        continue;
      }

      // Penalty grows with how many already-picked titles share each genre,
      // so the third space opera costs more than the second.
      let overlap = 0;
      for (const genre of entry.anime.genres) {
        overlap += seenGenres.get(genre.toLowerCase()) ?? 0;
      }
      const saturation = entry.anime.genres.length > 0 ? overlap / entry.anime.genres.length : 0;
      const adjusted = entry.score * (1 - DIVERSITY_PENALTY * Math.min(1, saturation));

      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIndex = index;
      }
    }

    // Everything left is blocked by the studio cap. Stop rather than pad.
    if (bestIndex === -1) break;

    const [chosen] = remaining.splice(bestIndex, 1);
    if (!chosen) break;

    picked.push(chosen);
    for (const genre of chosen.anime.genres) {
      const key = genre.toLowerCase();
      seenGenres.set(key, (seenGenres.get(key) ?? 0) + 1);
    }
    for (const studio of chosen.anime.studios) {
      const key = studio.toLowerCase();
      studioCounts.set(key, (studioCounts.get(key) ?? 0) + 1);
    }
  }

  return picked;
}

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                    */
/* -------------------------------------------------------------------------- */

export interface RankOptions {
  /** Ids the viewer already has or has finished. Never recommended back. */
  exclude?: ReadonlySet<string>;
  limit?: number;
  /** Below this a candidate is not a good enough match to be worth showing. */
  threshold?: number;
}

/** Default cut-off for the personalised row. */
export const PERSONAL_THRESHOLD = 0.18;
/** Default cut-off for "more like this", which has a stronger seed to match. */
export const SIMILAR_THRESHOLD = 0.15;

/**
 * Score, filter, rank and diversify candidates against a profile.
 *
 * Returns an empty list when the profile is not usable. That is the caller's
 * signal to fall back rather than something to paper over here: a computed row
 * built from nothing would be trending wearing a personal heading.
 */
export function rankByTaste(
  profile: TasteProfile,
  candidates: readonly Anime[],
  options: RankOptions = {}
): ScoredAnime[] {
  if (!isProfileUsable(profile)) return [];

  const { exclude, limit = 20, threshold = PERSONAL_THRESHOLD } = options;

  const scored = candidates
    .filter((candidate) => !exclude?.has(candidate.id))
    .map((candidate) => {
      const breakdown = scoreAgainstProfile(profile, candidate);
      return {
        anime: candidate,
        score: breakdown.total,
        breakdown,
        reason: explain(profile, candidate, breakdown),
      };
    })
    .filter((entry) => entry.score >= threshold)
    .sort((a, b) => b.score - a.score);

  return diversify(scored, limit);
}

/**
 * Rank candidates against one seed title, for "more like this".
 *
 * Candidates below the threshold are dropped rather than padded out. A short
 * honest list beats a long one whose tail is unrelated.
 */
export function rankBySimilarity(
  seed: Anime,
  candidates: readonly Anime[],
  options: RankOptions = {}
): ScoredAnime[] {
  const { exclude, limit = 20, threshold = SIMILAR_THRESHOLD } = options;

  const scored = candidates
    .filter((candidate) => candidate.id !== seed.id && !exclude?.has(candidate.id))
    .map((candidate) => {
      const breakdown = scoreAgainstSeed(seed, candidate);
      const shared = seed.genres.filter((genre) =>
        candidate.genres.some((other) => other.toLowerCase() === genre.toLowerCase())
      );

      return {
        anime: candidate,
        score: breakdown.total,
        breakdown,
        reason:
          shared.length > 0
            ? `Shares ${humanList(shared.slice(0, 2))} with ${seed.title}`
            : `Similar to ${seed.title}`,
      };
    })
    .filter((entry) => entry.score >= threshold)
    .sort((a, b) => b.score - a.score);

  return diversify(scored, limit);
}

/**
 * Interleave several candidate pools, round robin, dropping duplicates.
 *
 * Used for the cold start row, where the point is breadth: one from trending,
 * one from popular, one from top rated, one from this season, repeat. Taking
 * the top N of a single pool would just duplicate a rail already on the page.
 */
export function interleave(pools: readonly (readonly Anime[])[], limit: number): Anime[] {
  const result: Anime[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...pools.map((pool) => pool.length));

  for (let index = 0; index < longest && result.length < limit; index += 1) {
    for (const pool of pools) {
      if (result.length >= limit) break;

      const item = pool[index];
      if (!item || seen.has(item.id)) continue;

      seen.add(item.id);
      result.push(item);
    }
  }

  return result;
}
