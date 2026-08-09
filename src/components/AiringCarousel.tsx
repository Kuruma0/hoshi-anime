import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { InlineState } from './StateViews';
import { SectionHeader } from './SectionHeader';
import { Text } from '@/design/Text';
import { color, gutter, motion, radius, space } from '@/design/tokens';
import type { Anime } from '@/domain/anime';
import { useSettings } from '@/lib/settings';

export interface AiringCarouselProps {
  items: Anime[];
  onSelect: (id: string) => void;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}

/** Slides are 16:9 and stop short of half the screen, so the rails stay visible. */
const SLIDE_RATIO = 16 / 9;
const MAX_SLIDES = 8;

/**
 * Trending currently airing, as a swipeable carousel.
 *
 * One slide per screen with snapping, which is what makes it read as a
 * carousel rather than another poster rail. It is deliberately not a full
 * bleed hero: the slide is inset by the page gutter and capped in height so
 * Discover stays reachable without scrolling past a wall of artwork.
 *
 * The only gradient is the scrim over each slide, which exists so the title
 * stays legible on arbitrary artwork, not for drama.
 */
export function AiringCarousel({
  items,
  onSelect,
  isLoading,
  error,
  onRetry,
}: AiringCarouselProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useSettings((state) => state.reduceMotion);
  const [index, setIndex] = useState(0);
  const lastIndex = useRef(0);

  const slideWidth = width - gutter * 2;
  const slideHeight = Math.round(slideWidth / SLIDE_RATIO);

  const slides = items.slice(0, MAX_SLIDES);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / (slideWidth + space.md));
      if (next === lastIndex.current) return;
      lastIndex.current = next;
      setIndex(next);
    },
    [slideWidth]
  );

  const showState = isLoading || error || slides.length === 0;

  return (
    <View style={styles.section}>
      <SectionHeader title="Trending currently airing" />

      {showState ? (
        <InlineState
          height={slideHeight}
          state={isLoading ? 'loading' : error ? 'error' : 'empty'}
          error={error}
          onRetry={onRetry}
        />
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // Snap to slide plus gutter so each card lands in the same place.
            snapToInterval={slideWidth + space.md}
            decelerationRate="fast"
            disableIntervalMomentum
            contentContainerStyle={styles.track}
            onScroll={onScroll}
            scrollEventThrottle={16}
          >
            {slides.map((anime, position) => (
              <Pressable
                key={anime.id}
                onPress={() => onSelect(anime.id)}
                accessibilityRole="button"
                accessibilityLabel={`${anime.title}${anime.nextEpisode ? `, episode ${anime.nextEpisode.number - 1} out` : ''}`}
                style={({ pressed }) => [
                  styles.slide,
                  { width: slideWidth, height: slideHeight },
                  pressed && styles.pressed,
                ]}
              >
                {anime.banner?.url ?? anime.artwork?.url ? (
                  <Image
                    source={{ uri: anime.banner?.url ?? anime.artwork?.url }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={reduceMotion ? motion.reduced : motion.imageFade}
                    cachePolicy="disk"
                    // Only the first two slides compete for bandwidth up front.
                    priority={position < 2 ? 'normal' : 'low'}
                    recyclingKey={anime.id}
                    accessible={false}
                  />
                ) : null}

                {/* Legibility scrim, not decoration. */}
                <LinearGradient
                  colors={['rgba(11,9,16,0)', 'rgba(11,9,16,0.75)', color.scrimBottom]}
                  locations={[0.35, 0.78, 1]}
                  style={StyleSheet.absoluteFill}
                />

                <View style={styles.caption}>
                  <Text variant="subtitle" numberOfLines={1}>
                    {anime.title}
                  </Text>
                  {anime.nextEpisode ? (
                    <Text variant="meta" tone="muted">
                      Episode {anime.nextEpisode.number - 1} out
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>

          {/* Position markers, not controls. Nothing to tap, nothing to miss. */}
          <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no">
            {slides.map((anime, position) => (
              <View
                key={anime.id}
                style={[styles.dot, position === index && styles.dotActive]}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: space.xxl },
  track: { paddingHorizontal: gutter, gap: space.md },
  slide: {
    justifyContent: 'flex-end',
    backgroundColor: color.imagePlaceholder,
    borderRadius: radius.artwork,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.85 },
  caption: { padding: space.lg },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.xs,
    marginTop: space.md,
  },
  dot: { width: 4, height: 2, backgroundColor: color.line },
  dotActive: { backgroundColor: color.accentBright },
});
