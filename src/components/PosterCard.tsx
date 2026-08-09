import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { color, space } from '@/design/tokens';
import { Artwork } from './Artwork';
import type { Image as DomainImage } from '@/domain/common';

export interface PosterCardProps {
  title: string;
  image?: DomainImage;
  width: number;
  onPress: () => void;
  /**
   * One short line under the title, status, episode count, chapter number.
   * Deliberately singular: §6 says browsing surfaces show artwork and title,
   * not a metadata dump.
   */
  caption?: string;
  /** Announced instead of the visible caption when the two should differ. */
  accessibilityLabel?: string;
  recyclingKey?: string;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * The recurring browse item, for both anime posters and manga covers.
 *
 * Not a card in the visual sense; no container, no border, no shadow. It is
 * artwork with text beneath it, sitting directly on the page background.
 */
export function PosterCard({
  title,
  image,
  width,
  onPress,
  caption,
  accessibilityLabel,
  recyclingKey,
  priority,
}: PosterCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (caption ? `${title}, ${caption}` : title)}
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}
    >
      <Artwork
        image={image}
        width={width}
        thumbnail
        recyclingKey={recyclingKey}
        priority={priority}
      />
      <View style={styles.text}>
        <Text variant="meta" numberOfLines={2}>
          {title}
        </Text>
        {caption ? (
          <Text variant="meta" tone="faint" numberOfLines={1} style={styles.caption}>
            {caption}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.65 },
  text: { marginTop: space.sm },
  caption: { marginTop: 2 },
});

export const dividerColor = color.line;
