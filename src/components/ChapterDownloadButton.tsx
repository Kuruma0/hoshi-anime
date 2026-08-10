import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { color, space, touchTarget } from '@/design/tokens';

export interface ChapterDownloadButtonProps {
  /** Undefined while unknown, so the control does not flicker on first paint. */
  downloaded: boolean | undefined;
  /** 0..1 while a download is running, otherwise undefined. */
  progress?: number;
  onDownload: () => void;
  onDelete: () => void;
  label: string;
}

/**
 * Download control for a single chapter.
 *
 * Sits inside the chapter row rather than in a menu, because deciding to keep a
 * chapter happens while looking at the chapter list. A thin bar doubles as the
 * progress readout so a downloading row does not change height and shift
 * everything below it.
 */
export function ChapterDownloadButton({
  downloaded,
  progress,
  onDownload,
  onDelete,
  label,
}: ChapterDownloadButtonProps) {
  const downloading = progress !== undefined;

  if (downloading) {
    return (
      <View style={styles.control} accessibilityLabel={`Downloading ${label}`}>
        <Text variant="meta" tone="accent">
          {Math.round(progress * 100)}%
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(4, progress * 100)}%` }]} />
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={downloaded ? onDelete : onDownload}
      accessibilityRole="button"
      accessibilityLabel={
        downloaded ? `Remove download of ${label}` : `Download ${label} for offline reading`
      }
      hitSlop={space.sm}
      style={({ pressed }) => [styles.control, pressed && styles.pressed]}
    >
      <Text variant="meta" tone={downloaded ? 'accent' : 'faint'}>
        {downloaded ? 'Saved' : 'Save'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  control: {
    minWidth: 46,
    minHeight: touchTarget / 2,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: space.sm,
  },
  track: { width: 40, height: 2, backgroundColor: color.line, marginTop: 3 },
  fill: { height: 2, backgroundColor: color.accentBright },
  pressed: { opacity: 0.6 },
});
