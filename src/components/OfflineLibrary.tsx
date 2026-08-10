import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Artwork } from './Artwork';
import { EmptyState } from './StateViews';
import { Text } from '@/design/Text';
import { aspect, color, gutter, hairline, posterWidth, space, touchTarget } from '@/design/tokens';
import type { ContentId } from '@/domain/common';
import { formatBytes, type OfflineManga } from '@/offline/types';

export interface OfflineLibraryProps {
  manga: OfflineManga[];
  totalBytes: number;
  availableBytes: number;
  onOpenChapter: (mangaId: ContentId, chapterId: string) => void;
  onDeleteManga: (mangaId: ContentId) => void;
}

/**
 * Everything saved to the device.
 *
 * Anime is absent on purpose rather than shown empty: the player is an embed
 * and the app never sees the video, so there is nothing to download and a
 * disabled section promising otherwise would be misleading. The note says so
 * once instead.
 */
export function OfflineLibrary({
  manga,
  totalBytes,
  availableBytes,
  onOpenChapter,
  onDeleteManga,
}: OfflineLibraryProps) {
  if (manga.length === 0) {
    return (
      <EmptyState
        title="Nothing saved yet."
        detail="Save a manga chapter from its chapter list to read it without a connection."
      />
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.storage}>
        <Text variant="meta" tone="muted">
          {formatBytes(totalBytes)} saved
        </Text>
        {availableBytes > 0 ? (
          <Text variant="meta" tone="faint">
            {formatBytes(availableBytes)} free
          </Text>
        ) : null}
      </View>

      {manga.map((entry) => (
        <View key={entry.mangaId} style={styles.group}>
          <View style={styles.groupHeader}>
            <Artwork
              image={entry.cover}
              width={posterWidth.list}
              ratio={aspect.poster}
              thumbnail
              recyclingKey={entry.mangaId}
            />

            <View style={styles.groupText}>
              <Text variant="body" numberOfLines={2}>
                {entry.title}
              </Text>
              <Text variant="meta" tone="faint">
                {entry.chapters.length} chapter{entry.chapters.length === 1 ? '' : 's'} ·{' '}
                {formatBytes(entry.bytes)}
              </Text>
            </View>

            <Pressable
              onPress={() => onDeleteManga(entry.mangaId)}
              accessibilityRole="button"
              accessibilityLabel={`Delete all downloads for ${entry.title}`}
              hitSlop={space.sm}
              style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
            >
              <Text variant="meta" tone="muted">
                Delete
              </Text>
            </Pressable>
          </View>

          {entry.chapters.map((chapter) => {
            const failed = chapter.status === 'failed';
            const busy = chapter.status === 'downloading' || chapter.status === 'queued';

            return (
              <Pressable
                key={chapter.chapterId}
                onPress={() => onOpenChapter(chapter.mangaId, chapter.chapterId)}
                disabled={chapter.status !== 'downloaded'}
                accessibilityRole="button"
                accessibilityLabel={chapterLabel(chapter.chapterNumber, chapter.status)}
                style={({ pressed }) => [
                  styles.chapter,
                  pressed && chapter.status === 'downloaded' && styles.chapterPressed,
                ]}
              >
                <Text variant="meta" tone="muted" style={styles.chapterNumber}>
                  {chapter.chapterNumber ?? '-'}
                </Text>

                <Text variant="body" numberOfLines={1} style={styles.chapterTitle}>
                  {chapter.chapterTitle ?? `Chapter ${chapter.chapterNumber ?? ''}`.trim()}
                </Text>

                <Text
                  variant="meta"
                  tone={failed ? 'danger' : busy ? 'accent' : 'faint'}
                >
                  {statusLabel(chapter.status, chapter.progress, chapter.pageCount)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <Text variant="meta" tone="faint" style={styles.note}>
        Anime cannot be saved for offline viewing. Playback runs inside the video
        provider's own player, so the app never receives the video itself.
      </Text>
    </ScrollView>
  );
}

function statusLabel(status: string, progress: number, pageCount: number): string {
  switch (status) {
    case 'downloaded':
      return `${pageCount} pages`;
    case 'downloading':
      return `${Math.round(progress * 100)}%`;
    case 'queued':
      return 'Queued';
    default:
      return 'Failed';
  }
}

function chapterLabel(number: string | undefined, status: string): string {
  const name = `Chapter ${number ?? ''}`.trim();
  if (status === 'downloaded') return `Read ${name} offline`;
  if (status === 'failed') return `${name}, download failed`;
  return `${name}, downloading`;
}

const styles = StyleSheet.create({
  storage: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingBottom: space.md,
  },
  group: { marginBottom: space.xl },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingBottom: space.md,
  },
  groupText: { flex: 1, marginLeft: space.md },
  delete: { minHeight: touchTarget / 2, justifyContent: 'center', paddingLeft: space.md },
  chapter: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget,
    paddingHorizontal: gutter,
    paddingVertical: space.sm,
    borderTopWidth: hairline,
    borderTopColor: color.line,
  },
  chapterPressed: { backgroundColor: color.surface },
  chapterNumber: { width: 44 },
  chapterTitle: { flex: 1, marginRight: space.md },
  pressed: { opacity: 0.6 },
  note: {
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
  },
});
