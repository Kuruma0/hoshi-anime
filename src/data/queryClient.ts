import { QueryClient } from '@tanstack/react-query';
import { ProviderError } from '@/lib/errors';

/**
 * Shared query cache.
 *
 * Cache policy here is not tuning; it is a functional requirement. AniList
 * allows 30 requests/minute, and an anime home screen alone wants six rails, so
 * a short staleTime would exhaust the budget on a single pull-to-refresh.
 * `gcTime` is long so returning to a screen renders instantly from cache and
 * revalidates behind the visible content (§25).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (failureCount, error) => {
        // The HTTP layer already retried transient failures with backoff;
        // retrying non-retryable errors here would just delay the error state.
        if (error instanceof ProviderError && !error.retryable) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      // Metadata is stable enough that refetching on every remount costs rate
      // limit for no visible benefit.
      refetchOnMount: false,
    },
  },
});
