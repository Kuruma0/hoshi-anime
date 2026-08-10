/**
 * Title normalisation and matching.
 *
 * §14 requires that searching "Shingeki no Kyojin", "Attack on Titan", or
 * "進撃の巨人" all find the same show. Both providers return every title variant
 * they know (AniList: romaji/english/native + synonyms; MangaDex: altTitles
 * across ~10 languages), so matching is mostly a normalisation problem rather
 * than a fuzzy-search problem.
 *
 * These helpers are used for two distinct jobs:
 *   1. Re-ranking provider results locally, since a provider that matched on a
 *      synonym may not rank the exact match first.
 *   2. Matching a title across two different providers (metadata → stream),
 *      where there is no shared id and only the names line up.
 */

/**
 * Fold a title into a comparable key: lowercase, accents stripped, punctuation
 * removed, whitespace collapsed.
 *
 * "Fate/stay night: Unlimited Blade Works" → "fatestay night unlimited blade works"
 */
export function normalizeTitle(input: string): string {
  return input
    .normalize('NFKD')
    // Strip combining marks so "Pokémon" === "Pokemon".
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Punctuation and separators become nothing or a space, not a literal char.
    .replace(/[''`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Season/part suffixes that should not prevent a match between providers.
 * Only stripped for cross-provider matching, never for display.
 */
const SEASON_NOISE =
  /\b(season|series|part|cour|final|the movie|movie|ova|ona|special|specials|tv|2nd|3rd|\d+(st|nd|rd|th))\b/g;

export function normalizeForCrossProvider(input: string): string {
  return normalizeTitle(input).replace(SEASON_NOISE, ' ').trim().replace(/\s+/g, ' ');
}

export interface TitleBearer {
  title: string;
  originalTitle?: string;
  alternativeTitles: string[];
}

/**
 * How well `candidate` matches `query`, 0..1. Higher is better.
 *
 * Tiered rather than edit-distance based: users searching a show almost always
 * type a real prefix of a real title, so exact/prefix/substring tiers rank far
 * more usefully here than a similarity metric, and cost nothing to compute.
 */
export function scoreTitleMatch(query: string, candidate: TitleBearer): number {
  const q = normalizeTitle(query);
  if (!q) return 0;

  const variants = [candidate.title, candidate.originalTitle, ...candidate.alternativeTitles];

  let best = 0;
  for (const variant of variants) {
    if (!variant) continue;
    const v = normalizeTitle(variant);
    if (!v) continue;

    // Tiers top out at 0.95, not 1, specifically so the primary-title bonus
    // below still separates results inside the exact-match tier; which is the
    // tier where ranking matters most.
    let score: number;
    if (v === q) score = 0.95;
    else if (v.startsWith(q)) score = 0.8;
    else if (v.includes(q)) score = 0.6;
    else if (allWordsPresent(q, v)) score = 0.45;
    else continue;

    // A hit on the primary (English) title beats the same hit on a synonym, so
    // that searching "attack on titan" does not surface a spin-off first.
    if (variant === candidate.title) score += 0.05;

    best = Math.max(best, score);
    if (best >= 1) break;
  }

  return Math.min(best, 1);
}

/** Every query word appears somewhere in the candidate, handles reordering. */
function allWordsPresent(query: string, candidate: string): boolean {
  const words = query.split(' ').filter(Boolean);
  if (words.length < 2) return false;
  return words.every((word) => candidate.includes(word));
}

/**
 * Stable re-rank of provider results by local match quality.
 *
 * Providers rank by their own relevance and popularity signals, which are
 * usually good; so this only reorders, never filters. Losing a correct result
 * to an over-eager local threshold is far worse than showing it second.
 */
export function rankByTitle<T extends TitleBearer>(query: string, items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index, score: scoreTitleMatch(query, item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

/**
 * Best cross-provider match for `target` among `candidates`, or undefined when
 * nothing clears `threshold`.
 *
 * Used when a stream provider has its own catalogue and no shared id with the
 * metadata provider. Returning undefined is a real outcome the player handles
 * with a manual-search fallback; it does not guess.
 */
export function findBestMatch<T extends TitleBearer>(
  target: TitleBearer,
  candidates: T[],
  threshold = 0.8
): T | undefined {
  const targetKeys = new Set(
    [target.title, target.originalTitle, ...target.alternativeTitles]
      .filter((t): t is string => Boolean(t))
      .map(normalizeForCrossProvider)
      .filter(Boolean)
  );

  let best: { item: T; score: number } | undefined;

  for (const candidate of candidates) {
    const candidateKeys = [
      candidate.title,
      candidate.originalTitle,
      ...candidate.alternativeTitles,
    ]
      .filter((t): t is string => Boolean(t))
      .map(normalizeForCrossProvider)
      .filter(Boolean);

    let score = 0;
    for (const key of candidateKeys) {
      if (targetKeys.has(key)) {
        score = 1;
        break;
      }
      for (const targetKey of targetKeys) {
        if (key.includes(targetKey) || targetKey.includes(key)) score = Math.max(score, 0.85);
      }
    }

    if (score > (best?.score ?? 0)) best = { item: candidate, score };
    if (score === 1) break;
  }

  return best && best.score >= threshold ? best.item : undefined;
}
