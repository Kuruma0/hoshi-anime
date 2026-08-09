import { useQuery } from '@tanstack/react-query';
import type { Anime } from '@/domain/anime';
import { makeId, parseId } from '@/domain/common';
import type { Manga } from '@/domain/manga';
import { isSeriesFormat, type RelatedMedia, type SeasonEntry } from '@/domain/relations';
import { findBestMatch } from '@/lib/titleMatch';
import { getAnimeProvider, getMangaProvider } from '@/providers/registry';

/**
 * Relationship resolution.
 *
 * Two rules run through everything here:
 *   - Prefer a published identifier over a title. MangaDex records the AniList
 *     id for most works, which makes manga → anime exact.
 *   - When only titles are available, require a confident match and otherwise
 *     return nothing. Linking "Naruto" to an unrelated title is worse than
 *     showing no link at all.
 */

const relationKeys = {
  anime: (id: string) => ['relations', 'anime', id] as const,
  seasons: (id: string) => ['relations', 'seasons', id] as const,
  mangaForAnime: (id: string) => ['relations', 'manga-for-anime', id] as const,
  animeForManga: (id: string) => ['relations', 'anime-for-manga', id] as const,
};

function relationsSupported(): boolean {
  return getAnimeProvider().supportsRelations;
}

export function useAnimeRelations(id: string | undefined) {
  return useQuery({
    queryKey: relationKeys.anime(id ?? ''),
    queryFn: ({ signal }) => getAnimeProvider().getRelations!(id!, 'anime', signal),
    enabled: Boolean(id) && relationsSupported(),
    staleTime: 60 * 60 * 1000,
  });
}

/* ------------------------------------------------------------------ */
/* Seasons                                                             */
/* ------------------------------------------------------------------ */

/**
 * The season chain for a series.
 *
 * AniList publishes no season index, so the chain is walked: prequels backwards
 * and sequels forwards from the title being viewed, following only entries that
 * are themselves series (a sequel that is a film or an OVA is a related work,
 * not the next season).
 *
 * Walking is capped and de-duplicated because long franchises contain cycles
 * — an alternative version can point back into the main line.
 */
export function useAnimeSeasons(anime: Anime | undefined) {
  const id = anime?.id;

  return useQuery({
    queryKey: relationKeys.seasons(id ?? ''),
    queryFn: async ({ signal }): Promise<SeasonEntry[]> => {
      const provider = getAnimeProvider();
      const chain = await walkSeasonChain(
        anime!,
        (target) => provider.getRelations!(target, 'anime', signal)
      );

      // Fewer than two entries is not a season list, it is one show.
      if (chain.length < 2) return [];

      return chain.map((entry, index) => ({
        number: index + 1,
        id: entry.id,
        title: entry.title,
        year: entry.year,
        artwork: entry.artwork,
        current: entry.id === anime!.id,
      }));
    },
    enabled: Boolean(anime) && relationsSupported(),
    staleTime: 60 * 60 * 1000,
  });
}

interface ChainNode {
  id: string;
  title: string;
  year?: number;
  artwork?: { url: string; thumbnailUrl?: string };
}

/** Maximum entries followed in either direction. Guards against long franchises. */
const MAX_CHAIN = 12;

async function walkSeasonChain(
  anime: Anime,
  fetchRelations: (id: string) => Promise<RelatedMedia[]>
): Promise<ChainNode[]> {
  const seen = new Set<string>([anime.id]);
  const before: ChainNode[] = [];
  const after: ChainNode[] = [];

  const step = async (
    startId: string,
    direction: 'prequel' | 'sequel',
    into: ChainNode[]
  ): Promise<void> => {
    let cursor = startId;

    for (let hops = 0; hops < MAX_CHAIN; hops++) {
      let relations: RelatedMedia[];
      try {
        relations = await fetchRelations(cursor);
      } catch {
        // A broken link mid-chain should truncate the list, not discard the
        // seasons already found.
        return;
      }

      const next = relations.find(
        (relation) =>
          relation.relation === direction &&
          relation.kind === 'anime' &&
          isSeriesFormat(relation.format) &&
          !seen.has(relation.id)
      );
      if (!next) return;

      seen.add(next.id);
      into.push({
        id: next.id,
        title: next.title,
        year: next.year,
        artwork: next.artwork,
      });
      cursor = next.id;
    }
  };

  await step(anime.id, 'prequel', before);
  await step(anime.id, 'sequel', after);

  return [
    ...before.reverse(),
    { id: anime.id, title: anime.title, year: anime.year, artwork: anime.artwork },
    ...after,
  ];
}

/* ------------------------------------------------------------------ */
/* Anime ↔ Manga                                                       */
/* ------------------------------------------------------------------ */

export interface CrossLink {
  /** Target id in the *other* domain's provider space, ready to navigate to. */
  id: string;
  title: string;
  /** How the match was made, so the UI can be honest about confidence. */
  via: 'id' | 'title';
}

/**
 * The manga an anime was adapted from.
 *
 * AniList names the source manga, but that id lives in AniList's space and the
 * reader needs a MangaDex id. There is no shared key, so the AniList title set
 * is matched against MangaDex search results — and `findBestMatch` returns
 * nothing below its confidence threshold rather than guessing.
 */
export function useMangaForAnime(anime: Anime | undefined) {
  const id = anime?.id;

  return useQuery({
    queryKey: relationKeys.mangaForAnime(id ?? ''),
    queryFn: async ({ signal }): Promise<CrossLink | null> => {
      const relations = await getAnimeProvider().getRelations!(id!, 'anime', signal);

      const source = relations.find(
        (relation) => relation.kind === 'manga' && relation.relation === 'adaptation'
      );
      if (!source) return null;

      const results = await getMangaProvider().search(source.title, { limit: 12, signal });
      const match = findBestMatch(
        {
          title: source.title,
          originalTitle: source.originalTitle,
          alternativeTitles: source.alternativeTitles,
        },
        results.items
      );

      return match ? { id: match.id, title: match.title, via: 'title' } : null;
    },
    enabled: Boolean(anime) && relationsSupported(),
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * The anime adapted from a manga.
 *
 * Exact when the manga provider publishes an AniList id, which MangaDex does
 * for most works — no title matching involved. Falls back to searching by title
 * only when that id is absent.
 */
export function useAnimeForManga(manga: Manga | undefined) {
  const id = manga?.id;

  return useQuery({
    queryKey: relationKeys.animeForManga(id ?? ''),
    queryFn: async ({ signal }): Promise<CrossLink | null> => {
      const provider = getAnimeProvider();
      const anilistMangaId = manga!.externalIds?.anilist;

      if (anilistMangaId && /^\d+$/.test(anilistMangaId)) {
        const relations = await provider.getRelations!(
          makeId('anilist', anilistMangaId),
          'manga',
          signal
        );

        const adaptation = relations.find(
          (relation) =>
            relation.kind === 'anime' &&
            relation.relation === 'adaptation' &&
            isSeriesFormat(relation.format)
        );

        // The first TV adaptation is the entry point to the series; later
        // seasons are reachable from there through season navigation.
        if (adaptation) return { id: adaptation.id, title: adaptation.title, via: 'id' };
      }

      const results = await provider.search(manga!.title, { limit: 12, signal });
      const match = findBestMatch(
        {
          title: manga!.title,
          originalTitle: manga!.originalTitle,
          alternativeTitles: manga!.alternativeTitles,
        },
        results.items
      );

      return match ? { id: match.id, title: match.title, via: 'title' } : null;
    },
    enabled: Boolean(manga) && relationsSupported(),
    staleTime: 60 * 60 * 1000,
  });
}

/** Related works worth showing as a rail, excluding seasons and adaptations. */
export function relatedWorks(relations: RelatedMedia[] | undefined): RelatedMedia[] {
  if (!relations) return [];
  return relations.filter(
    (relation) =>
      relation.kind === 'anime' &&
      (relation.relation === 'sideStory' || relation.relation === 'alternative')
  );
}

/** True when an id belongs to the given provider. */
export function isFromProvider(id: string, provider: string): boolean {
  return parseId(id).provider === provider;
}
