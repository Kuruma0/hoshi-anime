import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingState } from './StateViews';
import { Text } from '@/design/Text';
import { color, gutter, hairline, space, touchTarget } from '@/design/tokens';
import { starsLabel } from '@/lib/rating';
import type { ResolvedSource } from '@/providers/mangaSources';

export interface SourcePickerProps {
  visible: boolean;
  title: string;
  sources: ResolvedSource[];
  isPending: boolean;
  /** This device's ratings, keyed by source id. */
  ratings: Record<string, number>;
  onSelect: (source: ResolvedSource) => void;
  onRate: (sourceId: string, stars: number) => void;
  onClose: () => void;
}

/**
 * Choose where to read from.
 *
 * Every figure here comes from the provider — chapter counts are the totals it
 * reports for the selected language. A source that could not be reached is
 * listed as unavailable rather than omitted, so it is clear the app tried.
 *
 * Ratings are of the *source*, not the manga, and are this device's own: with
 * no accounts there is no community average, and displaying an invented one
 * would be fabricating data.
 */
export function SourcePicker({
  visible,
  title,
  sources,
  isPending,
  ratings,
  onSelect,
  onRate,
  onClose,
}: SourcePickerProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="subtitle" numberOfLines={1}>
              Read {title}
            </Text>
            <Text variant="meta" tone="faint">
              Choose a source
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={space.md}
            style={styles.close}
          >
            <Text variant="meta" tone="muted" caps>
              Close
            </Text>
          </Pressable>
        </View>

        {isPending && sources.length === 0 ? (
          <View style={styles.loading}>
            <LoadingState label="Checking sources" />
          </View>
        ) : (
          <ScrollView style={styles.list}>
            {sources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                rating={ratings[source.id]}
                onSelect={() => onSelect(source)}
                onRate={(stars) => onRate(source.id, stars)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function SourceRow({
  source,
  rating,
  onSelect,
  onRate,
}: {
  source: ResolvedSource;
  rating?: number;
  onSelect: () => void;
  onRate: (stars: number) => void;
}) {
  const unavailable = source.unavailable || !source.mangaId;

  const detail = unavailable
    ? 'Temporarily unavailable'
    : [
        source.language?.toUpperCase(),
        // Only stated when the provider actually reported a total.
        source.chapterCount !== undefined
          ? `${source.chapterCount} chapter${source.chapterCount === 1 ? '' : 's'}`
          : 'Chapter count unknown',
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onSelect}
        disabled={unavailable}
        accessibilityRole="button"
        accessibilityLabel={`${source.name}, ${detail}`}
        accessibilityState={{ disabled: unavailable }}
        style={({ pressed }) => [
          styles.rowMain,
          pressed && !unavailable && styles.pressed,
          unavailable && styles.unavailable,
        ]}
      >
        <View style={styles.rowText}>
          <Text variant="body">{source.name}</Text>
          <Text variant="meta" tone="faint">
            {detail}
          </Text>
        </View>
        {!unavailable ? (
          <Text variant="meta" tone="accent" caps>
            Read
          </Text>
        ) : null}
      </Pressable>

      <View style={styles.rating}>
        <Text variant="meta" tone="faint" style={styles.ratingLabel}>
          Your rating
        </Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Pressable
              key={star}
              onPress={() => onRate(star)}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${source.name} ${star} out of 5`}
              hitSlop={space.xs}
              style={styles.star}
            >
              <Text variant="meta" tone={rating && star <= rating ? 'accent' : 'faint'}>
                {rating && star <= rating ? '★' : '☆'}
              </Text>
            </Pressable>
          ))}
        </View>
        {rating ? (
          <Text
            variant="meta"
            tone="faint"
            accessibilityLabel={starsLabel(rating)}
            style={styles.ratingValue}
          >
            {rating} / 5
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,9,16,0.6)' },
  sheet: {
    backgroundColor: color.bg,
    borderTopWidth: hairline,
    borderTopColor: color.lineStrong,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingVertical: space.lg,
    borderBottomWidth: hairline,
    borderBottomColor: color.line,
  },
  headerText: { flex: 1, marginRight: space.md },
  close: { minHeight: touchTarget / 2, justifyContent: 'center' },
  loading: { height: 140 },
  list: { flexGrow: 0 },
  row: { borderBottomWidth: hairline, borderBottomColor: color.line },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget,
    paddingHorizontal: gutter,
    paddingTop: space.md,
  },
  rowText: { flex: 1, marginRight: space.md },
  pressed: { backgroundColor: color.surface },
  unavailable: { opacity: 0.45 },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingBottom: space.md,
  },
  ratingLabel: { marginRight: space.sm },
  stars: { flexDirection: 'row' },
  star: { paddingHorizontal: 2, minHeight: 28, justifyContent: 'center' },
  ratingValue: { marginLeft: space.sm },
});
