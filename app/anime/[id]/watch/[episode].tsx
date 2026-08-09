import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useAnime, useAnimeEpisodes } from '@/data/anime';
import { useSaveWatchProgress, useWatchProgress } from '@/data/library';
import { usePlaybackTarget } from '@/data/playback';
import { Text } from '@/design/Text';
import { color, gutter, hairline, space, touchTarget } from '@/design/tokens';
import type { Anime, Episode } from '@/domain/anime';
import { createNavigationPolicy, parseVidKingEvent, VIDKING_EVENT_BRIDGE } from '@/providers/stream';
import type { PlaybackTarget } from '@/providers/types';

/**
 * The player.
 *
 * WATCH lands here directly, no source prompt, no "watch on" list, no trip out
 * to another site. The stream provider resolves the episode and this screen
 * renders whichever surface it returned.
 */
export default function WatchScreen() {
  const { id, episode: episodeParam } = useLocalSearchParams<{ id: string; episode: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const episodeNumber = Number.parseInt(episodeParam ?? '1', 10) || 1;

  const anime = useAnime(id);
  const episodes = useAnimeEpisodes(id);

  const episode = useMemo<Episode | undefined>(() => {
    const found = episodes.data?.find((entry) => entry.number === episodeNumber);
    // A synthetic episode keeps playback possible when the metadata provider
    // has no entry for a number the player can still address.
    return found ?? (episodes.data ? { id: String(episodeNumber), number: episodeNumber } : undefined);
  }, [episodes.data, episodeNumber]);

  const playback = usePlaybackTarget(anime.data, episode);

  if (anime.isPending || episodes.isPending) return <LoadingState label="Loading episode" />;
  if (anime.error || !anime.data) {
    return <ErrorState error={anime.error} onRetry={() => void anime.refetch()} />;
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={space.md}
          style={styles.headerButton}
        >
          <Text variant="body">Back</Text>
        </Pressable>

        <View style={styles.headerText}>
          <Text variant="meta" numberOfLines={1}>
            {anime.data.title}
          </Text>
          <Text variant="meta" tone="faint" numberOfLines={1}>
            {episodeLabel(episode, episodeNumber)}
          </Text>
        </View>
      </View>

      {playback.isPending ? (
        <LoadingState label="Preparing player" />
      ) : playback.error || !playback.data ? (
        <ErrorState error={playback.error} onRetry={() => void playback.refetch()} />
      ) : (
        <PlaybackSurface target={playback.data} anime={anime.data} episode={episode!} />
      )}
    </View>
  );
}

function episodeLabel(episode: Episode | undefined, fallbackNumber: number): string {
  const number = episode?.number ?? fallbackNumber;
  return episode?.title ? `Episode ${number}, ${episode.title}` : `Episode ${number}`;
}

function PlaybackSurface({
  target,
  anime,
  episode,
}: {
  target: PlaybackTarget;
  anime: Anime;
  episode: Episode;
}) {
  return target.kind === 'embed' ? (
    <EmbedPlayer target={target} anime={anime} episode={episode} />
  ) : (
    <NativePlayer target={target} />
  );
}

/* ------------------------------------------------------------------ */
/* embed, VidKing                                                     */
/* ------------------------------------------------------------------ */

/** Persist at most this often. `timeupdate` fires far more frequently. */
const PROGRESS_WRITE_INTERVAL_MS = 5_000;

function EmbedPlayer({
  target,
  anime,
  episode,
}: {
  target: Extract<PlaybackTarget, { kind: 'embed' }>;
  anime: Anime;
  episode: Episode;
}) {
  const existing = useWatchProgress(anime.id);
  const saveProgress = useSaveWatchProgress();
  const lastWrite = useRef(0);

  // Derived from the URL actually being loaded, so a provider domain change
  // cannot leave the policy blocking the player's own page.
  const navigationPolicy = useMemo(
    () => createNavigationPolicy(target.url),
    [target.url]
  );

  /**
   * Resume URL, computed once.
   *
   * `useMemo` on the saved position deliberately excludes later progress
   * updates: recomputing the URL mid-playback would reload the WebView and
   * restart the episode.
   */
  const source = useMemo(() => {
    const saved = existing.data;
    const resumable =
      saved && saved.episodeNumber === episode.number && saved.positionSeconds > 5
        ? saved.positionSeconds
        : 0;

    if (resumable === 0) return target.url;
    const separator = target.url.includes('?') ? '&' : '?';
    return `${target.url}${separator}progress=${Math.floor(resumable)}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.url, existing.isPending]);

  /**
   * Playback events from the player.
   *
   * This is what makes Continue Watching reflect what was actually watched
   * rather than what was merely opened.
   */
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const playerEvent = parseVidKingEvent(event.nativeEvent.data);
      if (!playerEvent) return;

      const now = Date.now();
      const isCheckpoint =
        playerEvent.event === 'pause' ||
        playerEvent.event === 'ended' ||
        playerEvent.event === 'seeked';

      // Checkpoints always persist; ticks are throttled.
      if (!isCheckpoint && now - lastWrite.current < PROGRESS_WRITE_INTERVAL_MS) return;
      lastWrite.current = now;

      // On 'ended' the reported position can lag the true end; pinning it to
      // the duration is what lets the title drop off Continue Watching.
      const positionSeconds =
        playerEvent.event === 'ended' && playerEvent.duration > 0
          ? playerEvent.duration
          : playerEvent.currentTime;

      saveProgress.mutate({
        animeId: anime.id,
        episodeNumber: playerEvent.episode ?? episode.number,
        positionSeconds: Math.floor(positionSeconds),
        durationSeconds: playerEvent.duration > 0 ? Math.floor(playerEvent.duration) : undefined,
        title: anime.title,
        image: anime.artwork,
      });
    },
    [anime, episode.number, saveProgress]
  );

  // Wait for saved progress before mounting, so the resume offset is applied on
  // the first load rather than by reloading the player a moment later.
  if (existing.isPending) return <LoadingState label="Preparing player" />;

  return (
    <View style={styles.surface}>
      <WebView
        source={{
          uri: source,
          headers: target.referer ? { Referer: target.referer } : undefined,
        }}
        style={styles.webview}
        containerStyle={styles.webviewContainer}
        // Forwards the player's postMessage events into React Native.
        injectedJavaScript={VIDKING_EVENT_BRIDGE}
        onMessage={handleMessage}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        /*
         * Interruption control. The policy cancels any attempt to navigate the
         * player away from its own site, which is what an ad redirect does;
         * playback carries on underneath. See providers/stream/playbackPolicy
         * for what this can and cannot reach.
         */
        onShouldStartLoadWithRequest={(request) =>
          navigationPolicy.allow({ url: request.url, isTopFrame: request.isTopFrame })
        }
        // Popups and new windows are refused outright; there is nothing in a
        // player that legitimately needs one.
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        onOpenWindow={NOOP}
        startInLoadingState
        renderLoading={() => <LoadingState label="Loading player" />}
      />
    </View>
  );
}

/** Swallows window-open attempts without opening anything. */
const NOOP = () => {};

/* ------------------------------------------------------------------ */
/* direct, native playback                                            */
/* ------------------------------------------------------------------ */

/**
 * Native surface, kept for any provider that resolves to a real manifest.
 *
 * VidKing does not, but the interface allows it and keeping the branch means a
 * future native provider needs no change to this screen.
 */
function NativePlayer({ target }: { target: Extract<PlaybackTarget, { kind: 'direct' }> }) {
  const player = useVideoPlayer(target.url, (instance) => {
    instance.play();
  });

  return (
    <View style={styles.surface}>
      <VideoView
        style={styles.video}
        player={player}
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.immersive },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingBottom: space.md,
    backgroundColor: color.bg,
    borderBottomWidth: hairline,
    borderBottomColor: color.line,
  },
  headerButton: { minHeight: touchTarget, justifyContent: 'center', paddingRight: space.lg },
  headerText: { flex: 1 },
  surface: { flex: 1, backgroundColor: color.immersive },
  video: { flex: 1 },
  webview: { flex: 1, backgroundColor: color.immersive },
  webviewContainer: { backgroundColor: color.immersive },
});
