/**
 * Provider-agnostic error taxonomy.
 *
 * Providers translate their own failures into these. The UI switches on `kind`
 * and never sees an HTTP status code or a provider-specific error shape; that
 * is what lets a provider be swapped without touching a screen.
 */

export type ProviderErrorKind =
  /** No usable network, or the request never reached the host. */
  | 'offline'
  /** Host reachable but took too long. */
  | 'timeout'
  /** We are being throttled. `retryAfterMs` is set when the host told us. */
  | 'rateLimited'
  /** The thing genuinely does not exist (404). */
  | 'notFound'
  /** Provider rejected us: 401/403, blocked region, banned IP. */
  | 'blocked'
  /** Provider returned 5xx, or a body we could not parse. */
  | 'providerFailure'
  /** No stream provider is configured, so playback cannot be resolved. */
  | 'notConfigured'
  /** Anything we did not anticipate. */
  | 'unknown';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly provider: string;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    kind: ProviderErrorKind,
    provider: string,
    message: string,
    options: { status?: number; retryAfterMs?: number; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'ProviderError';
    this.kind = kind;
    this.provider = provider;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }

  /** Whether retrying the identical request could plausibly succeed. */
  get retryable(): boolean {
    return (
      this.kind === 'offline' ||
      this.kind === 'timeout' ||
      this.kind === 'rateLimited' ||
      this.kind === 'providerFailure'
    );
  }
}

/** Copy for the error state component. Deliberately plain, never blames the user. */
export function messageFor(error: unknown): { title: string; detail: string } {
  if (!(error instanceof ProviderError)) {
    return {
      title: "We couldn't load this right now.",
      detail: 'Something unexpected went wrong.',
    };
  }

  switch (error.kind) {
    case 'offline':
      return { title: 'No connection.', detail: 'Check your network and try again.' };
    case 'timeout':
      return { title: 'That took too long.', detail: 'The connection seems slow right now.' };
    case 'rateLimited':
      return { title: 'Slow down a moment.', detail: 'Too many requests. Try again shortly.' };
    case 'notFound':
      return { title: 'Not found.', detail: 'This title is no longer available here.' };
    case 'blocked':
      return { title: 'Unavailable.', detail: 'The provider refused this request.' };
    case 'notConfigured':
      return {
        title: 'No source configured.',
        detail: 'Add a streaming source in Settings to watch episodes.',
      };
    case 'providerFailure':
    default:
      return { title: "We couldn't load this right now.", detail: 'The provider had a problem.' };
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ProviderError && error.kind === 'notFound';
}
