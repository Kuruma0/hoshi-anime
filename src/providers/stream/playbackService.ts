import type { Anime, Episode } from '@/domain/anime';
import { ProviderError } from '@/lib/errors';
import type { AnimeStreamProvider, PlaybackTarget, StreamOption } from '../types';
import type { EmbedRuntime } from './types';

/**
 * The playback service.
 *
 * Providers are tried in order and the first that resolves wins. VidLink leads
 * because its anime route needs no cross-database lookup, so it reaches a
 * player in one fewer network hop; VidKing follows because it is keyed on TMDB
 * and can therefore serve titles VidLink has no MyAnimeList id for.
 *
 * Two rules matter here:
 *
 *   1. **One pass, in order.** Resolution walks the list once. There is no
 *      route back to an earlier provider, so the loop the brief warns about
 *      cannot form.
 *   2. **Failure is invisible.** The screen asks for a target and gets one, or
 *      gets a single error. It is never told which providers were tried, and
 *      the user is never asked to choose.
 */
export class PlaybackService implements AnimeStreamProvider {
  readonly id = 'playback';
  readonly name = 'Playback';
  readonly attribution = '';
  readonly kind = 'embed' as const;

  constructor(
    private readonly providers: AnimeStreamProvider[],
    private readonly runtimes: EmbedRuntime[],
    /**
     * Development hook for forcing a provider to fail so the fallback path can
     * be exercised deliberately rather than waiting for a real outage. Never
     * set in production; see `setFailureSimulation`.
     */
    private simulateFailureFor: Set<string> = new Set()
  ) {}

  isAvailable(): boolean {
    return this.usable().length > 0;
  }

  /** Providers that report themselves usable, in priority order. */
  private usable(): AnimeStreamProvider[] {
    return this.providers.filter((provider) => provider.isAvailable());
  }

  /** The runtime that hosts a resolved target, or undefined if unknown. */
  runtimeFor(providerId: string): EmbedRuntime | undefined {
    return this.runtimes.find((runtime) => runtime.providerId === providerId);
  }

  async listOptions(
    anime: Anime,
    episode: Episode,
    signal?: AbortSignal
  ): Promise<StreamOption[]> {
    for (const provider of this.usable()) {
      try {
        const options = await provider.listOptions(anime, episode, signal);
        if (options.length > 0) {
          return options.map((option) => ({ ...option, id: `${provider.id}::${option.id}` }));
        }
      } catch {
        // A provider that cannot enumerate is simply not the one we use.
      }
    }
    return [];
  }

  /**
   * Resolve an episode to something playable.
   *
   * An explicitly chosen option goes straight to the provider that offered it,
   * because at that point the user has picked an audio track and silently
   * serving a different provider would ignore them.
   */
  async resolve(
    anime: Anime,
    episode: Episode,
    optionId?: string,
    signal?: AbortSignal,
    /**
     * Providers already known to have failed for this episode.
     *
     * Some players only reveal that they have no stream once their page is
     * running, so the screen reports that back and asks again. Excluding the
     * failed provider is what makes the second attempt move forward rather
     * than returning the same dead target.
     */
    exclude: readonly string[] = []
  ): Promise<PlaybackTarget> {
    const providers = this.usable().filter((provider) => !exclude.includes(provider.id));

    if (providers.length === 0) {
      throw new ProviderError('notConfigured', this.id, 'No playback source is available.');
    }

    if (optionId) {
      const [providerId, rest] = splitOptionId(optionId);
      const chosen = providers.find((provider) => provider.id === providerId);
      if (chosen) return this.attempt(chosen, anime, episode, rest, signal);
    }

    let lastError: unknown;

    for (const provider of providers) {
      try {
        return await this.attempt(provider, anime, episode, undefined, signal);
      } catch (error) {
        lastError = error;
        // Move on to the next provider. Nothing routes back to this one.
      }
    }

    // The user gets one plain failure, never a provider-specific code.
    throw lastError instanceof ProviderError
      ? lastError
      : new ProviderError('providerFailure', this.id, 'Unable to load this episode.');
  }

  private async attempt(
    provider: AnimeStreamProvider,
    anime: Anime,
    episode: Episode,
    optionId?: string,
    signal?: AbortSignal
  ): Promise<PlaybackTarget> {
    if (this.simulateFailureFor.has(provider.id)) {
      throw new ProviderError(
        'providerFailure',
        provider.id,
        'Simulated provider failure.'
      );
    }

    const target = await provider.resolve(anime, episode, optionId, signal);
    if (!isPlayable(target)) {
      throw new ProviderError('notFound', provider.id, 'Provider returned no playable source.');
    }
    return target;
  }

  /**
   * Force one or more providers to fail. Development only, and deliberately not
   * wired to any user-facing control.
   */
  setFailureSimulation(providerIds: string[]): void {
    if (!__DEV__) return;
    this.simulateFailureFor = new Set(providerIds);
  }
}

/**
 * A target is only playable if it actually carries somewhere to play from.
 * A provider that resolves to an empty URL has failed, whatever it returned.
 */
export function isPlayable(target: PlaybackTarget | undefined | null): target is PlaybackTarget {
  if (!target) return false;
  if (typeof target.url !== 'string') return false;
  return target.url.trim().length > 0 && /^https?:\/\//.test(target.url);
}

function splitOptionId(optionId: string): [string, string | undefined] {
  const index = optionId.indexOf('::');
  if (index === -1) return [optionId, undefined];
  return [optionId.slice(0, index), optionId.slice(index + 2)];
}
