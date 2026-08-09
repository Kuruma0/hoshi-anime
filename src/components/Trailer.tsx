import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Text } from '@/design/Text';
import { aspect, color, gutter, radius, space } from '@/design/tokens';

export interface TrailerProps {
  youtubeId: string;
  /** Provider thumbnail, when it supplies one. Usually absent. */
  thumbnail?: string;
  title: string;
}

/**
 * Trailer embed.
 *
 * The YouTube id comes from the metadata provider: no scraping, no API key, no
 * invented URLs. Titles without a trailer render nothing at all rather than an
 * empty player.
 *
 * Two things here are not obvious:
 *
 *   1. The player is loaded as an **iframe inside a local document** with a
 *      `baseUrl`, not by pointing the WebView straight at youtube.com/embed.
 *      Loaded as the top level document the embed has no origin, and YouTube
 *      refuses to play a good many videos in that state. Giving the iframe a
 *      real origin is what makes playback work.
 *
 *   2. The poster falls back to YouTube's own thumbnail for the same video id.
 *      AniList carries `trailer.thumbnail` only sometimes, and without a
 *      fallback most trailers showed as a flat empty rectangle.
 *
 * The WebView mounts only after a tap. Trailers never autoplay on open: one
 * hidden browser per detail page is a real memory cost, and unexpected sound is
 * worse.
 */
export function Trailer({ youtubeId, thumbnail, title }: TrailerProps) {
  const [playing, setPlaying] = useState(false);

  // Derived from the verified video id, so it always matches the trailer.
  const poster = thumbnail ?? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;

  const html = useMemo(() => buildEmbedDocument(youtubeId), [youtubeId]);

  if (playing) {
    return (
      <View style={styles.frame}>
        <WebView
          // baseUrl gives the iframe a real origin; see the note above.
          source={{ html, baseUrl: YOUTUBE_ORIGIN }}
          style={styles.player}
          originWhitelist={['*']}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          // The tap that mounted this is the user gesture autoplay needs.
          mediaPlaybackRequiresUserAction={false}
          domStorageEnabled
          javaScriptEnabled
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          scrollEnabled={false}
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => setPlaying(true)}
      accessibilityRole="button"
      accessibilityLabel={`Play trailer for ${title}`}
      style={({ pressed }) => [styles.frame, pressed && styles.pressed]}
    >
      <Image
        source={{ uri: poster }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="disk"
        accessible={false}
      />
      <View style={styles.overlay}>
        <Text variant="button" style={styles.play}>
          ▶
        </Text>
        <Text variant="meta" tone="muted">
          Trailer
        </Text>
      </View>
    </Pressable>
  );
}

const YOUTUBE_ORIGIN = 'https://www.youtube.com';

/**
 * A minimal document holding the player.
 *
 * `playsinline` keeps the video in the frame on iOS instead of taking over the
 * screen, and `rel=0` stops YouTube filling the end card with unrelated
 * channels.
 */
function buildEmbedDocument(youtubeId: string): string {
  const params = new URLSearchParams({
    autoplay: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    origin: YOUTUBE_ORIGIN,
  }).toString();

  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; background: #000; height: 100%; overflow: hidden; }
      iframe { border: 0; width: 100%; height: 100%; display: block; }
    </style>
  </head>
  <body>
    <iframe
      src="${YOUTUBE_ORIGIN}/embed/${youtubeId}?${params}"
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
    ></iframe>
  </body>
</html>`;
}

const styles = StyleSheet.create({
  frame: {
    marginHorizontal: gutter,
    aspectRatio: aspect.thumb,
    backgroundColor: color.imagePlaceholder,
    borderRadius: radius.artwork,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  player: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.immersive,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,9,16,0.45)',
  },
  play: { fontSize: 26, color: color.text, marginBottom: space.xs },
  pressed: { opacity: 0.85 },
});
