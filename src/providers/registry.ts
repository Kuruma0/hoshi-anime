import Constants from 'expo-constants';
import { getSettings } from '@/lib/settings';
import { AniListProvider } from './anilist';
import { ArmMappingClient } from './mapping/arm';
import { MangaDexProvider } from './mangadex';
import {
  PlaybackService,
  VIDKING_RUNTIME,
  VIDLINK_RUNTIME,
  VidKingProvider,
  VidLinkProvider,
} from './stream';
import type { AnimeProvider, MangaProvider } from './types';

/**
 * Provider wiring.
 *
 * This file is the entire cost of replacing a provider. Screens resolve
 * providers through the accessors below and never construct one, so swapping
 * AniList for Jikan (or VidKing for another player) means writing a new class
 * against the interfaces in types.ts and changing the constructor call here.
 *
 * Providers are instantiated lazily and then reused, because several hold
 * caches (AniList genres, MangaDex tags, id mappings) that are wasted if
 * rebuilt per screen.
 */

const version = (Constants.expoConfig?.version as string | undefined) ?? '1.0.0';

/** MangaDex requires a descriptive User-Agent; sending a real one is the deal. */
const USER_AGENT = `HoshiAnime/${version}`;

let animeProvider: AnimeProvider | undefined;
let mangaProvider: MangaProvider | undefined;
let streamProvider: PlaybackService | undefined;
let armClient: ArmMappingClient | undefined;

export function getAnimeProvider(): AnimeProvider {
  animeProvider ??= new AniListProvider({
    // Read through a getter so a Settings change applies to the next request
    // without tearing down the provider and its caches.
    getAllowAdult: () => getSettings().contentRatings.includes('pornographic'),
    userAgent: USER_AGENT,
  });
  return animeProvider;
}

export function getMangaProvider(): MangaProvider {
  mangaProvider ??= new MangaDexProvider({
    getContentRatings: () => getSettings().contentRatings,
    userAgent: USER_AGENT,
  });
  return mangaProvider;
}

/**
 * Every manga provider with a working implementation, in preference order.
 *
 * The source picker reads this rather than naming providers itself. Additional
 * sources are added here; see providers/mangaSources.ts for the ones
 * investigated and deferred, and why.
 */
export function getMangaProviders(): MangaProvider[] {
  return [getMangaProvider()];
}

/** AniList → TMDB mapping, shared by anything that needs cross-database ids. */
export function getMappingClient(): ArmMappingClient {
  armClient ??= new ArmMappingClient(USER_AGENT);
  return armClient;
}

/**
 * Playback.
 *
 * VidLink leads: its anime route is keyed on the MyAnimeList id AniList already
 * gives us, so it reaches a player without a cross-database lookup. VidKing
 * follows as the fallback because it is keyed on TMDB and can therefore cover
 * titles that have no MyAnimeList id.
 *
 * Provider selection is internal. There is no user-facing source setting, so
 * nothing here reads from settings.
 */
export function getStreamProvider(): PlaybackService {
  streamProvider ??= new PlaybackService(
    [new VidLinkProvider(), new VidKingProvider(getMappingClient())],
    [VIDLINK_RUNTIME, VIDKING_RUNTIME]
  );
  return streamProvider;
}

/** Reset cached providers. Used by tests; not called by the app. */
export function resetProviders(): void {
  animeProvider = undefined;
  mangaProvider = undefined;
  streamProvider = undefined;
  armClient = undefined;
}
