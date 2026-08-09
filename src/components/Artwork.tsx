import { Image, type ImageContentFit } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { aspect, color, motion, radius } from '@/design/tokens';
import type { Image as DomainImage } from '@/domain/common';
import { useSettings } from '@/lib/settings';

export interface ArtworkProps {
  image?: DomainImage;
  width: number;
  /** Defaults to the 2:3 poster ratio. */
  ratio?: number;
  /** Prefer the smaller variant. Set for grids and rails. */
  thumbnail?: boolean;
  contentFit?: ImageContentFit;
  style?: StyleProp<ViewStyle>;
  /** expo-image reuses views keyed by this; set it in virtualized lists. */
  recyclingKey?: string;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * All artwork renders through here.
 *
 * Wraps expo-image specifically for its native disk + memory cache, the app
 * shows hundreds of covers and a plain RN <Image> re-downloads on every scroll,
 * which is the single largest performance factor on mid-range hardware (§23).
 *
 * The placeholder is a flat fill rather than a spinner: a grid of spinners is
 * visual noise, and the fade-in already communicates loading.
 */
export function Artwork({
  image,
  width,
  ratio = aspect.poster,
  thumbnail,
  contentFit = 'cover',
  style,
  recyclingKey,
  priority = 'normal',
}: ArtworkProps) {
  const reduceMotion = useSettings((state) => state.reduceMotion);
  const height = Math.round(width / ratio);
  const source = thumbnail ? (image?.thumbnailUrl ?? image?.url) : image?.url;

  return (
    <View style={[styles.frame, { width, height }, style]}>
      {source ? (
        <Image
          source={{ uri: source }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          transition={reduceMotion ? motion.reduced : motion.imageFade}
          cachePolicy="disk"
          recyclingKey={recyclingKey}
          priority={priority}
          placeholder={image?.blurhash ? { blurhash: image.blurhash } : undefined}
          // Artwork is decorative here; the surrounding pressable carries the
          // accessible label, so announcing the image again would duplicate it.
          accessible={false}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: color.imagePlaceholder,
    borderRadius: radius.artwork,
    overflow: 'hidden',
  },
});
