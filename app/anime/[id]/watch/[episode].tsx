import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { Button } from '@/design/Button';
import { useAnime, useAnimeEpisodes } from '@/data/anime';
import { useSaveWatchProgress, useWatchProgress } from '@/data/library';
import { usePlaybackTarget, useVideoProvider } from '@/data/playback';
import { ProviderPicker } from '@/components/ProviderPicker';
import { isPlaybackFailureSentinel } from '@/providers/stream/vidlink';
import { Text } from '@/design/Text';
import { color, gutter, hairline, space, touchTarget } from '@/design/tokens';
import type { Anime, Episode } from '@/domain/anime';
import { getStreamProvider } from '@/providers/registry';
import { withResume } from '@/providers/stream/types';
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

  const { providers, activeId, select } = useVideoProvider();
  const playback = usePlaybackTarget(anime.data, episode, activeId);

  /**
   * Set when the chosen player loaded but then reported it has no stream.
   * Resolution cannot see that, so the player surface reports it back here.
   */
  const [runtimeFailure, setRuntimeFailure] = useState<string | undefined>();

  // A different episode or a different player deserves a fresh attempt.
  useEffect(() => setRuntimeFailure(undefined), [episodeNumber, activeId]);

  const activeName =
    providers.find((provider) => provider.id === activeId)?.name ?? 'this player';
  const alternatives = providers.filter((provider) => provider.id !== activeId);

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

      {/* Switching player is reachable without leaving playback. */}
      <ProviderPicker providers={providers} activeId={activeId} onSelect={select} />

      {playback.isPending ? (
        <LoadingState label="Loading episode" />
      ) : playback.error || !playback.data || runtimeFailure ? (
        <PlaybackError
          providerName={activeName}
          alternatives={alternatives}
          onSelect={select}
          onRetry={() => {
            setRuntimeFailure(undefined);
            void playback.refetch();
          }}
        />
      ) : (
        <PlaybackSurface
          target={playback.data}
          anime={anime.data}
          episode={episode!}
          onProviderFailed={setRuntimeFailure}
        />
      )}
    </View>
  );
}

function episodeLabel(episode: Episode | undefined, fallbackNumber: number): string {
  const number = episode?.number ?? fallbackNumber;
  return episode?.title ? `Episode ${number}, ${episode.title}` : `Episode ${number}`;
}

/**
 * Failure state.
 *
 * Names the player that failed, because that is what tells the viewer switching
 * might help, and offers the other players directly so nobody is stuck inside a
 * broken one. No status codes or provider error strings reach the screen.
 */
function PlaybackError({
  providerName,
  alternatives,
  onSelect,
  onRetry,
}: {
  providerName: string;
  alternatives: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <View style={styles.error}>
      <Text variant="subtitle" style={styles.errorTitle}>
        Unable to load this episode with {providerName}.
      </Text>
      <Text variant="body" tone="muted" style={styles.errorDetail}>
        Try another player, or try again.
      </Text>

      <View style={styles.errorActions}>
        {alternatives.map((provider) => (
          <Button
            key={provider.id}
            label={`Try ${provider.name}`}
            onPress={() => onSelect(provider.id)}
          />
        ))}
        <Button label="Try again" variant="secondary" onPress={onRetry} />
      </View>
    </View>
  );
}

function PlaybackSurface({
  target,
  anime,
  episode,
  onProviderFailed,
}: {
  target: PlaybackTarget;
  anime: Anime;
  episode: Episode;
  onProviderFailed: (providerId: string) => void;
}) {
  return target.kind === 'embed' ? (
    <EmbedPlayer
      target={target}
      anime={anime}
      episode={episode}
      onProviderFailed={onProviderFailed}
    />
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
  onProviderFailed,
}: {
  target: Extract<PlaybackTarget, { kind: 'embed' }>;
  anime: Anime;
  episode: Episode;
  onProviderFailed: (providerId: string) => void;
}) {
  const existing = useWatchProgress(anime.id);
  const saveProgress = useSaveWatchProgress();
  const lastWrite = useRef(0);

  // The runtime that hosts this provider's embed: its bridge script and its
  // progress parser. Looked up by id so the screen never names a provider.
  const runtime = useMemo(
    () => getStreamProvider().runtimeFor(target.provider),
    [target.provider]
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
      saved && saved.episodeNumber === episode.number ? saved.positionSeconds : 0;

    // Each player names its resume parameter differently, so the runtime is
    // asked rather than assumed.
    return withResume(target.url, runtime, resumable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.url, runtime, existing.isPending]);

  /**
   * Playback events from whichever player is hosting this episode.
   *
   * The runtime does the provider-specific parsing, so this screen sees one
   * progress shape regardless of who is playing. That is what keeps a single
   * watch-progress system rather than one per provider.
   */
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const progress = runtime?.parseProgress(event.nativeEvent.data);
      if (!progress) return;

      const now = Date.now();
      // Checkpoints (pause, seek, completion) persist at once; ticks throttle.
      if (!progress.checkpoint && now - lastWrite.current < PROGRESS_WRITE_INTERVAL_MS) {
        return;
      }
      lastWrite.current = now;

      saveProgress.mutate({
        animeId: anime.id,
        episodeNumber: progress.episodeNumber ?? episode.number,
        positionSeconds: Math.floor(progress.positionSeconds),
        durationSeconds: progress.durationSeconds
          ? Math.floor(progress.durationSeconds)
          : undefined,
        title: anime.title,
        image: anime.artwork,
      });
    },
    [anime, episode.number, saveProgress, runtime]
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
        // Forwards this provider's postMessage events into React Native.
        injectedJavaScript={runtime?.bridge}
        onMessage={handleMessage}
        /*
         * A player that cannot serve the episode navigates to the sentinel it
         * was given. Observing that is how the app learns to try the next
         * provider; nothing is cancelled or rewritten here.
         */
        onNavigationStateChange={(state) => {
          if (isPlaybackFailureSentinel(state.url)) onProviderFailed(target.provider);
        }}
        // A page that fails outright counts as the same failure.
        onError={() => onProviderFailed(target.provider)}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 400) onProviderFailed(target.provider);
        }}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // The player should play the requested episode, not navigate elsewhere.
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        startInLoadingState
        renderLoading={() => <LoadingState label="Loading player" />}
      />
    </View>
  );
}

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
  error: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: gutter,
    backgroundColor: color.bg,
  },
  errorTitle: { textAlign: 'center' },
  errorDetail: { textAlign: 'center', marginTop: space.sm },
  errorActions: { marginTop: space.xl, alignSelf: 'stretch', gap: space.sm },
  video: { flex: 1 },
  webview: { flex: 1, backgroundColor: color.immersive },
  webviewContainer: { backgroundColor: color.immersive },
});
