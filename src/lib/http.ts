import { ProviderError } from './errors';
import { RateLimiter, sleep } from './rateLimiter';

export interface HttpClientOptions {
  baseUrl: string;
  /** Provider id, used to attribute errors. */
  provider: string;
  /** Sent on every request. MangaDex requires a User-Agent. */
  headers?: Record<string, string>;
  limiter: RateLimiter;
  timeoutMs?: number;
  /** Retries for transient failures (timeout / 5xx / 429). */
  maxRetries?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  /** Values are serialized; arrays repeat the key (`includes[]=a&includes[]=b`). */
  query?: Record<string, string | number | boolean | string[] | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/**
 * The single place provider requests go out. Centralises what §12 of the spec
 * asks to centralise: rate limiting, timeouts, retry/backoff, and translation of
 * every failure mode into a ProviderError.
 *
 * It deliberately knows nothing about anime or manga, providers layer meaning
 * on top of it.
 */
export class HttpClient {
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(private readonly options: HttpClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetries = options.maxRetries ?? 2;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options.query);
    let lastError: ProviderError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.options.limiter.acquire();

      try {
        return await this.attempt<T>(url, options);
      } catch (error) {
        if (!(error instanceof ProviderError) || !error.retryable) throw error;
        lastError = error;

        // Caller aborted (screen unmounted, new search keystroke), stop.
        if (options.signal?.aborted) throw error;
        if (attempt === this.maxRetries) break;

        if (error.kind === 'rateLimited') {
          const backoff = error.retryAfterMs ?? 1000 * 2 ** attempt;
          this.options.limiter.penalize(backoff);
          await sleep(backoff);
        } else {
          // Exponential backoff with jitter so retries do not resynchronise.
          await sleep(300 * 2 ** attempt + Math.random() * 200);
        }
      }
    }

    throw lastError ?? new ProviderError('unknown', this.options.provider, 'Request failed.');
  }

  private async attempt<T>(url: string, options: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...this.options.headers,
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (cause) {
      // fetch rejects for both network failure and abort; the caller's signal
      // tells us which, since our own timeout also aborts.
      const timedOut = controller.signal.aborted && !options.signal?.aborted;
      throw new ProviderError(
        timedOut ? 'timeout' : 'offline',
        this.options.provider,
        timedOut ? 'Request timed out.' : 'Network request failed.',
        { cause }
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }

    if (!response.ok) throw this.toError(response);

    try {
      return (await response.json()) as T;
    } catch (cause) {
      throw new ProviderError(
        'providerFailure',
        this.options.provider,
        'Provider returned a malformed response.',
        { status: response.status, cause }
      );
    }
  }

  private toError(response: Response): ProviderError {
    const { provider } = this.options;
    const status = response.status;

    if (status === 404) {
      return new ProviderError('notFound', provider, 'Not found.', { status });
    }
    if (status === 429) {
      const header = response.headers.get('retry-after');
      const retryAfterMs = header ? Number(header) * 1000 : undefined;
      return new ProviderError('rateLimited', provider, 'Rate limited.', {
        status,
        retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
      });
    }
    if (status === 401 || status === 403) {
      return new ProviderError('blocked', provider, 'Provider refused the request.', { status });
    }
    return new ProviderError('providerFailure', provider, `Provider returned ${status}.`, {
      status,
    });
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | string[] | undefined>
  ): string {
    const base = this.options.baseUrl.replace(/\/$/, '');
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    if (!query) return url;

    const parts: string[] = [];
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        // MangaDex expects repeated keys: includes[]=cover_art&includes[]=author
        for (const item of value) {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
        }
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }

    return parts.length > 0 ? `${url}?${parts.join('&')}` : url;
  }
}
