import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { useAnimeSection } from '@/data/anime';
import { useMangaSection } from '@/data/manga';
import { Text } from '@/design/Text';
import { color, gutter, hairline, motion, space } from '@/design/tokens';
import type { Image as DomainImage } from '@/domain/common';
import { routes } from '@/lib/routes';
import { useSettings } from '@/lib/settings';

/**
 * The gateway (§4).
 *
 * Two full-bleed editorial panels rather than two cards: the artwork runs edge
 * to edge, the label sits on it, and a hairline is the only separator. Backdrops
 * are real covers pulled from the same trending queries the section screens use,
 * so nothing here is decorative filler; and if they have not loaded, the panel
 * degrades to a flat surface instead of a broken image.
 *
 * Deliberately absent: stats, banners, account state, settings. This screen has
 * one job.
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const anime = useAnimeSection('trending', 1);
  const manga = useMangaSection('popular', 1);

  // Chrome is the header and masthead plus both safe areas; the remainder is
  // split evenly between the two panels.
  const panelHeight = Math.max(180, (height - insets.top - insets.bottom - 190) / 2);

  return (
    <View style={styles.screen}>
      <AppHeader actionLabel="Settings" onAction={() => router.push(routes.settings())} />

      <View style={styles.masthead}>
        <Text variant="display" style={styles.wordmark}>
          Watch and read,
        </Text>
        <Text variant="display" tone="muted" style={styles.wordmark}>
          in one place.
        </Text>
      </View>

      <GatewayPanel
        index="01"
        title="Anime"
        detail="Stream shows, follow the weekly schedule, keep your list."
        image={anime.data?.items[0]?.artwork}
        height={panelHeight}
        onPress={() => router.push(routes.animeHome())}
      />

      <View style={styles.divider} />

      <GatewayPanel
        index="02"
        title="Manga"
        detail="Read chapters, browse by genre, pick up where you left off."
        image={manga.data?.items[0]?.cover}
        height={panelHeight}
        onPress={() => router.push(routes.mangaHome())}
      />
    </View>
  );
}

function GatewayPanel({
  index,
  title,
  detail,
  image,
  height,
  onPress,
}: {
  index: string;
  title: string;
  detail: string;
  image?: DomainImage;
  height: number;
  onPress: () => void;
}) {
  const reduceMotion = useSettings((state) => state.reduceMotion);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      style={({ pressed }) => [styles.panel, { height }, pressed && styles.panelPressed]}
    >
      {image ? (
        <Image
          source={{ uri: image.url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={reduceMotion ? motion.reduced : motion.imageFade}
          cachePolicy="disk"
          accessible={false}
        />
      ) : null}

      {/*
        The one gradient in the application, and it is functional: without a
        scrim the title is unreadable over arbitrary cover art.
      */}
      <LinearGradient
        colors={['rgba(11,9,16,0.35)', 'rgba(11,9,16,0.80)', color.scrimBottom]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.panelContent}>
        <Text variant="meta" tone="accent" style={styles.index}>
          {index}
        </Text>
        <Text variant="display" style={styles.panelTitle}>
          {title}
        </Text>
        <Text variant="body" tone="muted" style={styles.panelDetail}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  masthead: {
    paddingHorizontal: gutter,
    paddingTop: space.xl,
    paddingBottom: space.xl,
  },
  wordmark: { letterSpacing: -0.5 },
  panel: {
    justifyContent: 'flex-end',
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  panelPressed: { opacity: 0.85 },
  panelContent: { padding: gutter },
  index: { letterSpacing: 1.5, marginBottom: space.xs },
  panelTitle: { letterSpacing: -0.5 },
  panelDetail: { marginTop: space.xs, maxWidth: 300 },
  divider: { height: hairline, backgroundColor: color.line },
});
