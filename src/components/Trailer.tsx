import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Text } from '@/design/Text';
import { aspect, color, gutter, radius, space } from '@/design/tokens';

export interface TrailerProps {
  youtubeId: string;
  thumbnail?: string;
  title: string;
}

/**
 * Trailer embed.
 *
 * The YouTube id comes from the metadata provider — no scraping, no API key,
 * no invented URLs. Titles without a trailer simply render nothing.
 *
 * The player mounts only once tapped. Embedding a WebView per detail page would
 * cost a hidden browser instance on every title opened, which is a real memory
 * cost on the mid-range hardware this app targets.
 */
export function Trailer({ youtubeId, thumbnail, title }: TrailerProps) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <View style={styles.frame}>
        <WebView
          source={{ uri: `https://www.youtube.com/embed/${youtubeId}?autoplay=1&playsinline=1&rel=0` }}
          style={styles.player}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
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
      {thumbnail ? (
        <Image
          source={{ uri: thumbnail }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="disk"
          accessible={false}
        />
      ) : null}
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
  player: { flex: 1, alignSelf: 'stretch', backgroundColor: color.immersive },
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
