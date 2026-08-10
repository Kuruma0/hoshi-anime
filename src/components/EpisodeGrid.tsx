import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/design/Text';
import { color, gutter, hairline, space, touchTarget } from '@/design/tokens';
import type { Episode } from '@/domain/anime';
import { buildRanges, rangeIndexFor } from '@/lib/episodeRanges';

export interface EpisodeGridProps {
  episodes: Episode[];
  /** Episode currently being watched, if any. */
  currentEpisode?: number;
  /** Highest episode number the viewer has finished. */
  watchedThrough?: number;
  onSelect: (episodeNumber: number) => void;
}

/** Smallest comfortable tile. Columns are derived from this, not fixed. */
const MIN_TILE = 56;

/**
 * Episode picker as a grid of numbers.
 *
 * A list of one row per episode is unusable past about fifty entries, which is
 * most long running series. Numbers in a grid put a few hundred episodes within
 * a couple of flicks, and the number is the only thing needed to choose one.
 *
 * Column count comes from the measured width rather than a fixed value, so the
 * same component works on a narrow phone and a tablet.
 *
 * Very long series are split into range blocks rather than virtualized. A
 * virtualized list nested inside a scrolling page has no viewport of its own
 * and renders every row anyway; One Piece produced 1173 tiles in one pass that
 * way. Ranges bound the cost and make episode 900 one tap away.
 */
export function EpisodeGrid({
  episodes,
  currentEpisode,
  watchedThrough,
  onSelect,
}: EpisodeGridProps) {
  const { width } = useWindowDimensions();

  const ranges = useMemo(
    () => buildRanges(episodes.map((episode) => episode.number)),
    [episodes]
  );

  // Opening mid series lands on the block being watched, not back at one.
  const [activeRange, setActiveRange] = useState(() => rangeIndexFor(ranges, currentEpisode));

  const columns = Math.max(4, Math.floor((width - gutter * 2 + space.sm) / (MIN_TILE + space.sm)));
  const tileSize = Math.floor((width - gutter * 2 - space.sm * (columns - 1)) / columns);

  const visible = useMemo(() => {
    if (ranges.length === 0) return episodes;
    const range = ranges[Math.min(activeRange, ranges.length - 1)];
    if (!range) return episodes;
    return episodes.filter(
      (episode) => episode.number >= range.start && episode.number <= range.end
    );
  }, [episodes, ranges, activeRange]);

  const rows = useMemo(() => chunk(visible, columns), [visible, columns]);

  if (episodes.length === 0) {
    return (
      <Text variant="body" tone="faint" style={styles.empty}>
        No episode information available yet.
      </Text>
    );
  }

  return (
    <View>
      {ranges.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rangeBar}
        >
          {ranges.map((range, index) => {
            const selected = index === activeRange;
            return (
              <Pressable
                key={range.label}
                onPress={() => setActiveRange(index)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`Episodes ${range.label}`}
                style={({ pressed }) => [
                  styles.range,
                  selected && styles.rangeSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text variant="meta" tone={selected ? 'default' : 'muted'}>
                  {range.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View style={styles.row} key={`row-${rowIndex}`}>
            {row.map((episode) => (
              <EpisodeTile
                key={episode.id}
                episode={episode}
                size={tileSize}
                current={episode.number === currentEpisode}
                watched={watchedThrough !== undefined && episode.number <= watchedThrough}
                onSelect={onSelect}
              />
            ))}
            {/* Keeps a short final row left aligned instead of stretched. */}
            {row.length < columns
              ? Array.from({ length: columns - row.length }, (_, index) => (
                  <View key={`pad-${index}`} style={{ width: tileSize }} />
                ))
              : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function EpisodeTile({
  episode,
  size,
  current,
  watched,
  onSelect,
}: {
  episode: Episode;
  size: number;
  current: boolean;
  watched: boolean;
  onSelect: (episodeNumber: number) => void;
}) {
  const upcoming = Boolean(episode.upcoming);

  return (
    <Pressable
      onPress={() => onSelect(episode.number)}
      disabled={upcoming}
      accessibilityRole="button"
      accessibilityLabel={episodeLabel(episode, current, watched)}
      accessibilityState={{ disabled: upcoming, selected: current }}
      style={({ pressed }) => [
        styles.tile,
        { width: size, height: size },
        watched && styles.tileWatched,
        current && styles.tileCurrent,
        upcoming && styles.tileUpcoming,
        pressed && !upcoming && styles.tilePressed,
      ]}
    >
      <Text
        variant="bodyStrong"
        tone={upcoming ? 'faint' : current ? 'accent' : 'default'}
      >
        {episode.number}
      </Text>
    </Pressable>
  );
}

function episodeLabel(episode: Episode, current: boolean, watched: boolean): string {
  const name = episode.title ? `, ${episode.title}` : '';
  if (episode.upcoming) return `Episode ${episode.number}${name}, not yet aired`;
  if (current) return `Episode ${episode.number}${name}, currently watching`;
  if (watched) return `Episode ${episode.number}${name}, watched`;
  return `Play episode ${episode.number}${name}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

const styles = StyleSheet.create({
  grid: { paddingHorizontal: gutter },
  row: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  rangeBar: { paddingHorizontal: gutter, paddingBottom: space.md, gap: space.md },
  range: {
    minHeight: touchTarget - 12,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  rangeSelected: { borderBottomColor: color.accentBright },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget,
    backgroundColor: color.surface,
    borderWidth: hairline,
    borderColor: color.line,
  },
  // Watched reads as receded, not decorated.
  tileWatched: { backgroundColor: color.bg, borderColor: color.lineStrong },
  tileCurrent: { borderColor: color.accentBright, backgroundColor: color.surfaceRaised },
  tileUpcoming: { backgroundColor: 'transparent', borderColor: color.line, opacity: 0.5 },
  tilePressed: { backgroundColor: color.surfaceRaised },
  pressed: { opacity: 0.6 },
  empty: { paddingHorizontal: gutter },
});
