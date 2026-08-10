import type { MangaProvider } from './types';

/**
 * The manga source registry.
 *
 * The UI asks this for the list of sources and never names one directly, so
 * adding a provider is a new entry here plus a class implementing
 * `MangaProvider`, no screen changes.
 *
 * ── Provider research, recorded here rather than lost in a commit message ──
 *
 * Each candidate below was probed directly. Only sources with a documented,
 * legitimate, unauthenticated API are implemented; the rest are declared so the
 * architecture visibly accommodates them, and so the same investigation is not
 * repeated later.
 *
 *   MangaDex     Implemented. Documented REST API, no auth for reads,
 *                ~5 req/s per IP, requires a User-Agent.
 *
 *   Comick       Deferred. api.comick.fun no longer resolves in DNS.
 *   Weeb Central Deferred. Serves text/html only; no API surface.
 *   MangaFire    Deferred. No official developer API; community scrapers only.
 *   Kagane       Deferred. Endpoint probes return 403; access is gated.
 *   Atsumaru     Deferred. No documented API endpoints found.
 *   MangaNato    Deferred. No official API; community scrapers only.
 *   MangaDotNet  Deferred. Reader-app plugin ecosystem; no published API docs.
 *   Onisaga      Deferred. Same; no published API docs.
 *   Comix        Deferred. Same; no published API docs.
 *
 * Building scrapers or bypassing the gating on any of these was ruled out
 * deliberately; a brittle scraper that breaks on the next markup change is
 * worse than an honest "unsupported".
 */

export type SourceStatus = 'implemented' | 'deferred';

export interface MangaSourceDescriptor {
  id: string;
  name: string;
  status: SourceStatus;
  /** Why a deferred source is not available. Shown nowhere; kept for maintainers. */
  note?: string;
}

/** Every source considered, implemented or not. */
export const MANGA_SOURCE_CATALOGUE: readonly MangaSourceDescriptor[] = [
  { id: 'mangadex', name: 'MangaDex', status: 'implemented' },
  { id: 'comick', name: 'Comick', status: 'deferred', note: 'API host no longer resolves.' },
  { id: 'weebcentral', name: 'Weeb Central', status: 'deferred', note: 'No API; HTML only.' },
  { id: 'mangafire', name: 'MangaFire', status: 'deferred', note: 'No official API.' },
  { id: 'kagane', name: 'Kagane', status: 'deferred', note: 'Access gated (403).' },
  { id: 'atsumaru', name: 'Atsumaru', status: 'deferred', note: 'No documented API.' },
  { id: 'manganato', name: 'MangaNato', status: 'deferred', note: 'No official API.' },
  { id: 'mangadotnet', name: 'MangaDotNet', status: 'deferred', note: 'No published API docs.' },
  { id: 'onisaga', name: 'OniSaga', status: 'deferred', note: 'No published API docs.' },
  { id: 'comix', name: 'Comix', status: 'deferred', note: 'No published API docs.' },
] as const;

/**
 * A source as the UI sees it: a provider plus what it can tell us about one
 * specific title.
 */
export interface ResolvedSource {
  id: string;
  name: string;
  /** Chapters available in the requested language. Undefined when unknown. */
  chapterCount?: number;
  /** Language actually served, from provider metadata. */
  language?: string;
  /** The id to open in this source's space. */
  mangaId?: string;
  /** Set when the source could not be reached; the row shows as unavailable. */
  unavailable?: boolean;
}

export interface RegisteredSource {
  descriptor: MangaSourceDescriptor;
  provider: MangaProvider;
}

/** Sources with a working implementation, in preference order. */
export function implementedSources(providers: MangaProvider[]): RegisteredSource[] {
  return providers
    .map((provider) => {
      const descriptor = MANGA_SOURCE_CATALOGUE.find((entry) => entry.id === provider.id);
      return descriptor ? { descriptor, provider } : undefined;
    })
    .filter((entry): entry is RegisteredSource => entry !== undefined);
}

