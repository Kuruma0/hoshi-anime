import { StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { color, gutter, hairline, space } from '@/design/tokens';

export interface SectionDividerProps {
  title: string;
}

/**
 * A heading that separates one part of a page from another.
 *
 * Bigger than a rail's section label but well short of a banner: a hairline,
 * then the word. It marks where browsing turns into discovery without taking a
 * screenful to do it.
 */
export function SectionDivider({ title }: SectionDividerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.rule} />
      <Text variant="title" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: space.xl },
  rule: {
    height: hairline,
    backgroundColor: color.line,
    marginHorizontal: gutter,
    marginBottom: space.lg,
  },
  title: { paddingHorizontal: gutter, letterSpacing: -0.3 },
});
