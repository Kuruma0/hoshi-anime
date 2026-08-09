import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { Artwork } from './Artwork';
import { Text } from '@/design/Text';
import { aspect, color, gutter, motion, posterWidth, space } from '@/design/tokens';
import type { Image as DomainImage } from '@/domain/common';
import { useSettings } from '@/lib/settings';

export interface DetailHeroProps {
  title: string;
  originalTitle?: string;
  poster?: DomainImage;
  banner?: DomainImage;
  /** One short line: "2013 · 25 episodes · Finished". */
  summary?: string;
}

/**
 * Tall enough that the artwork still reads once the status bar and the floating
 * back control overlap its top edge, those now sit *on* the image rather than
 * above it.
 */
const BANNER_HEIGHT = 280;

/**
 * Detail-page header.
 *
 * The banner runs full-bleed behind the status bar with the poster overlapping
 * its lower edge, cinematic rather than a card sitting on a page. When a title
 * has no banner the poster still anchors the layout, so the composition does
 * not depend on artwork that may not exist.
 */
export function DetailHero({
  title,
  originalTitle,
  poster,
  banner,
  summary,
}: DetailHeroProps) {
  const reduceMotion = useSettings((state) => state.reduceMotion);

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        {banner?.url ? (
          <Image
            source={{ uri: banner.url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={reduceMotion ? motion.reduced : motion.imageFade}
            cachePolicy="disk"
            accessible={false}
          />
        ) : null}
        {/*
          Functional scrim: the title below must stay readable over any art.
          Kept transparent at the very top so the artwork continues behind the
          status bar and the floating back control instead of being cut off by
          a bar.
        */}
        <LinearGradient
          colors={[color.scrimTop, 'rgba(11,9,16,0.15)', 'rgba(11,9,16,0.6)', color.scrimBottom]}
          locations={[0, 0.35, 0.72, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.row}>
        <Artwork image={poster} width={posterWidth.detail} ratio={aspect.poster} priority="high" />

        <View style={styles.text}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {originalTitle ? (
            <Text variant="meta" tone="muted" style={styles.original}>
              {originalTitle}
            </Text>
          ) : null}
          {summary ? (
            <Text variant="meta" tone="faint" style={styles.summary}>
              {summary}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: space.xl },
  banner: { height: BANNER_HEIGHT, backgroundColor: color.surface },
  row: {
    flexDirection: 'row',
    paddingHorizontal: gutter,
    // Pulls the poster up over the banner's lower edge.
    marginTop: -72,
  },
  text: { flex: 1, marginLeft: space.lg, justifyContent: 'flex-end', paddingBottom: space.xs },
  original: { marginTop: space.xs },
  summary: { marginTop: space.sm },
});
