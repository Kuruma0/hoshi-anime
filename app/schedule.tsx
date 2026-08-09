import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/AppHeader';
import { Artwork } from '@/components/Artwork';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { useSchedule } from '@/data/anime';
import { useLibraryEntries } from '@/data/library';
import { Text } from '@/design/Text';
import { aspect, color, gutter, hairline, posterWidth, space, touchTarget } from '@/design/tokens';
import { routes } from '@/lib/routes';
import {
  DAY_SHORT,
  formatAiringTime,
  formatCountdown,
  groupByLocalDate,
  localDateKey,
  weekDays,
} from '@/lib/schedule';

/**
 * Release Schedule.
 *
 * Real AniList airing data, bucketed into the viewer's local days — the window
 * starts at local midnight today, so the first tab always answers "what's
 * airing today". Days with nothing scheduled say so rather than being hidden,
 * which is itself the answer to "is anything on Tuesday".
 */
export default function ReleaseScheduleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const schedule = useSchedule();
  const saved = useLibraryEntries('anime');

  const days = useMemo(() => weekDays(), []);
  const [selectedKey, setSelectedKey] = useState(() => localDateKey(days[0]!.date));

  const grouped = useMemo(() => groupByLocalDate(schedule.data ?? []), [schedule.data]);

  /** Ids on the user's list, for the "on your list" marker. */
  const savedIds = useMemo(
    () => new Set((saved.data ?? []).map((entry) => entry.id)),
    [saved.data]
  );

  const entries = grouped.get(selectedKey) ?? [];
  const todayKey = localDateKey(days[0]!.date);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader context="Release schedule" />

      {schedule.isPending ? (
        <LoadingState label="Loading schedule" />
      ) : schedule.error ? (
        <ErrorState error={schedule.error} onRetry={() => void schedule.refetch()} />
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayBar}
            style={styles.dayBarWrapper}
          >
            {days.map(({ date, dayIndex }) => {
              const key = localDateKey(date);
              const selected = key === selectedKey;
              const dayEntries = grouped.get(key) ?? [];
              const hasSaved = dayEntries.some((entry) => savedIds.has(entry.anime.id));

              return (
                <Pressable
                  key={key}
                  onPress={() => setSelectedKey(key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${DAY_SHORT[dayIndex]} ${date.getDate()}, ${dayEntries.length} airing${hasSaved ? ', includes titles on your list' : ''}`}
                  style={[styles.day, selected && styles.daySelected]}
                >
                  <Text variant="meta" tone={selected ? 'default' : 'muted'} caps>
                    {key === todayKey ? 'Today' : DAY_SHORT[dayIndex]}
                  </Text>
                  <Text
                    variant="meta"
                    tone={selected ? 'accent' : 'faint'}
                    style={styles.dayNumber}
                  >
                    {date.getDate()}
                  </Text>
                  {/* A day carrying something you follow is worth spotting from here. */}
                  <View style={[styles.dayDot, hasSaved && styles.dayDotActive]} />
                </Pressable>
              );
            })}
          </ScrollView>

          {entries.length === 0 ? (
            <EmptyState
              title="Nothing airing."
              detail="No episodes are scheduled for this day."
            />
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
              showsVerticalScrollIndicator={false}
            >
              {entries.map((entry) => {
                const onList = savedIds.has(entry.anime.id);

                return (
                  <Pressable
                    key={`${entry.anime.id}-${entry.episodeNumber}`}
                    onPress={() => router.push(routes.anime(entry.anime.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`${entry.anime.title}, episode ${entry.episodeNumber}, ${formatAiringTime(entry.airingAt)}${onList ? ', on your list' : ''}`}
                    style={({ pressed }) => [
                      styles.row,
                      onList && styles.rowSaved,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text variant="meta" tone="muted" style={styles.time}>
                      {formatAiringTime(entry.airingAt)}
                    </Text>

                    <Artwork
                      image={entry.anime.artwork}
                      width={posterWidth.list}
                      ratio={aspect.poster}
                      thumbnail
                      recyclingKey={entry.anime.id}
                    />

                    <View style={styles.rowText}>
                      <Text variant="body" numberOfLines={2}>
                        {entry.anime.title}
                      </Text>
                      <Text variant="meta" tone="faint" style={styles.episode}>
                        Episode {entry.episodeNumber} · {formatCountdown(entry.airingAt)}
                      </Text>
                    </View>

                    {/*
                      Subtle by design: a purple edge and a short label, not a
                      badge. It should register at a glance without competing
                      with the artwork.
                    */}
                    {onList ? (
                      <Text variant="meta" tone="accent" style={styles.onList}>
                        On your list
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  dayBarWrapper: {
    flexGrow: 0,
    borderBottomWidth: hairline,
    borderBottomColor: color.line,
  },
  dayBar: { paddingHorizontal: gutter },
  day: {
    minWidth: 56,
    minHeight: touchTarget + 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -hairline,
  },
  daySelected: { borderBottomColor: color.accentBright },
  dayNumber: { marginTop: 2 },
  dayDot: { width: 3, height: 3, marginTop: 4, backgroundColor: 'transparent' },
  dayDotActive: { backgroundColor: color.accentBright },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingVertical: space.md,
    borderBottomWidth: hairline,
    borderBottomColor: color.line,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  rowSaved: { borderLeftColor: color.accent },
  pressed: { backgroundColor: color.surface },
  time: { width: 52 },
  rowText: { flex: 1, marginLeft: space.md },
  episode: { marginTop: 2 },
  onList: { marginLeft: space.sm },
});
