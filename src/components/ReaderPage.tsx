import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { color, space } from '@/design/tokens';

export interface ReaderPageProps {
  uri: string;
  width: number;
  /** Fixed viewport height. Set in paged mode, omitted in vertical mode. */
  height?: number;
  pageNumber: number;
  pageCount: number;
  /** Re-resolves the chapter's host. MangaDex @Home URLs expire. */
  onRefreshSource: () => void;
}

/**
 * One manga page.
 *
 * Retry is per page, not per chapter. MangaDex serves pages from ephemeral
 * hosts that can expire or fail mid-read, and treating one failed image as a
 * chapter-level failure would throw away a reader's position over a single
 * dropped request. A second failure escalates to re-resolving the host.
 */
export function ReaderPage({
  uri,
  width,
  height,
  pageNumber,
  pageCount,
  onRefreshSource,
}: ReaderPageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  // In vertical mode the height is unknown until the image reports its size;
  // a 3:2 page is the usual manga ratio and keeps scroll position stable.
  const [ratio, setRatio] = useState(2 / 3);

  // A new URL (host re-resolved) restarts this page's own load cycle.
  useEffect(() => {
    setStatus('loading');
  }, [uri]);

  const measuredHeight = height ?? Math.round(width / ratio);

  const retry = () => {
    if (attempt >= 1) onRefreshSource();
    setAttempt((value) => value + 1);
    setStatus('loading');
  };

  return (
    <View style={[styles.container, { width, height: measuredHeight }]}>
      {status !== 'failed' ? (
        <Image
          // Changing the key on retry forces a fresh request rather than
          // serving the failed entry back out of cache.
          key={`${uri}#${attempt}`}
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={height ? 'contain' : 'cover'}
          cachePolicy="disk"
          // Pages are large; fading them in on a scroll is distracting.
          transition={0}
          onLoad={(event) => {
            const { width: sourceWidth, height: sourceHeight } = event.source;
            if (sourceWidth > 0 && sourceHeight > 0) setRatio(sourceWidth / sourceHeight);
            setStatus('loaded');
          }}
          onError={() => setStatus('failed')}
          accessible
          accessibilityLabel={`Page ${pageNumber} of ${pageCount}`}
        />
      ) : null}

      {status === 'loading' ? (
        <View style={styles.overlay}>
          <ActivityIndicator color={color.accentBright} />
          <Text variant="meta" tone="faint" style={styles.overlayText}>
            {pageNumber} / {pageCount}
          </Text>
        </View>
      ) : null}

      {status === 'failed' ? (
        <Pressable
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel={`Page ${pageNumber} failed to load. Tap to retry.`}
          style={styles.overlay}
        >
          <Text variant="meta" tone="muted">
            Page {pageNumber} didn&apos;t load
          </Text>
          <Text variant="meta" tone="accent" style={styles.overlayText}>
            Tap to retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: color.immersive, justifyContent: 'center' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: { marginTop: space.sm },
});
