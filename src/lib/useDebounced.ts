import { useEffect, useState } from 'react';

/**
 * Delay a rapidly-changing value.
 *
 * Search fires a network request per settled term, and both providers are rate
 * limited; AniList at 30/minute. Without this, typing "attack on titan" would
 * spend half the per-minute budget on prefixes nobody wanted results for.
 *
 * 350ms is above typical inter-keystroke time but below the point where the UI
 * feels unresponsive.
 */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
