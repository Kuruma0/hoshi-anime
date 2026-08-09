import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { color, gutter, hairline, space } from '@/design/tokens';

export interface MetaItem {
  label: string;
  /** Plain text value. Rows with an empty value are dropped. */
  value?: string;
  /**
   * Rendered instead of `value` when the row needs more than text, the star
   * rating, for example. A row with neither is dropped.
   */
  node?: ReactNode;
}

/**
 * Detail-page metadata.
 *
 * A label/value list separated by hairlines rather than a grid of badges or
 * stat tiles; the detail page carries the metadata, and it should not look
 * like a dashboard doing it.
 */
export function MetaList({ items }: { items: MetaItem[] }) {
  const present = items.filter((item) => item.node ?? (item.value ?? '').trim().length > 0);
  if (present.length === 0) return null;

  return (
    <View style={styles.list}>
      {present.map((item, index) => (
        <View key={item.label} style={[styles.row, index > 0 && styles.divided]}>
          <Text variant="meta" tone="faint" style={styles.label}>
            {item.label}
          </Text>
          {item.node ? (
            <View style={styles.value}>{item.node}</View>
          ) : (
            <Text variant="meta" style={styles.value}>
              {item.value}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginHorizontal: gutter },
  row: { flexDirection: 'row', paddingVertical: space.md },
  divided: { borderTopWidth: hairline, borderTopColor: color.line },
  label: { width: 92 },
  value: { flex: 1 },
});
