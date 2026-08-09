import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import type { ContentId, MediaKind } from '@/domain/common';
import { routes } from './routes';

/**
 * Content navigation.
 *
 * Detail pages link to other detail pages — seasons, recommendations,
 * adaptations — and every one of those must behave like a real stack: back
 * returns to the screen you actually came from, not to a hardcoded parent.
 *
 * Two rules live here so no screen has to remember them:
 *
 *   1. **Push, never replace.** A season jump is navigation, not a redirect;
 *      replacing would erase the season you came from, which is precisely the
 *      "back goes to Home" symptom.
 *
 *   2. **Skip a no-op push.** Opening the title you are already viewing would
 *      stack a duplicate entry, so back would appear to do nothing. Guarding
 *      here keeps the stack honest without every call site checking.
 */
export function useContentNavigation(currentId?: ContentId) {
  const router = useRouter();

  const open = useCallback(
    (kind: MediaKind, id: ContentId) => {
      if (currentId && id === currentId) return;
      router.push(routes.detail(kind, id));
    },
    [router, currentId]
  );

  return useMemo(
    () => ({
      openAnime: (id: ContentId) => open('anime', id),
      openManga: (id: ContentId) => open('manga', id),
      open,
    }),
    [open]
  );
}
