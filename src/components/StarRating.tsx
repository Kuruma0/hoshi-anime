import { StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { space } from '@/design/tokens';
import { formatRatingValue, ratingLabel, type ScoreScale } from '@/lib/rating';

export interface StarRatingProps {
  /** Raw provider score. Normalised using `scale`. */
  score: number | undefined;
  scale?: ScoreScale;
}

/**
 * A rating, as `★ 4.6 / 5`.
 *
 * One star acts as the visual marker; the number carries the actual value. A
 * row of five glyphs can only express half-star steps, which would render 78
 * and 82 out of 100 identically — the number keeps the precision the source
 * score actually has.
 *
 * `scale` is explicit rather than assumed, so a provider publishing 0–10 gets
 * the same result as one publishing 0–100.
 */
export function StarRating({ score, scale = 'hundred' }: StarRatingProps) {
  const value = formatRatingValue(score, scale);
  if (!value) return null;

  return (
    <View style={styles.row} accessibilityLabel={ratingLabel(value)} accessible>
      <Text variant="meta" tone="accent" style={styles.star}>
        ★
      </Text>
      <Text variant="meta">{value}</Text>
      <Text variant="meta" tone="faint">
        {' / 5'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  star: { marginRight: space.xs },
});
