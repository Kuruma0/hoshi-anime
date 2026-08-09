import { StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { color } from '@/design/tokens';

export interface LogoProps {
  /** Height of the blob in points. Everything else scales from this. */
  size?: number;
}

/**
 * The Hoshi mark: H.A on a purple blob.
 *
 * Two decisions carry it.
 *
 * The blob is not a rounded rectangle. Each corner takes a different radius, so
 * the silhouette leans slightly and reads as a drawn shape rather than a
 * default container. That asymmetry is the whole personality of the mark, and
 * it survives being scaled down to a favicon.
 *
 * The dot is a four pointed star, because hoshi means star. It is built from
 * two overlapping rotated squares rather than a glyph, so it stays crisp at any
 * size and needs no font. At small sizes the points close up and it reads as a
 * dot, which is exactly the fallback behaviour wanted.
 */
export function Logo({ size = 32 }: LogoProps) {
  const letter = size * 0.42;
  const star = size * 0.2;

  return (
    <View
      style={[
        styles.blob,
        {
          width: size,
          height: size,
          // Asymmetric corners: the shape leans rather than sitting square.
          borderTopLeftRadius: size * 0.46,
          borderTopRightRadius: size * 0.34,
          borderBottomRightRadius: size * 0.46,
          borderBottomLeftRadius: size * 0.34,
        },
      ]}
      accessibilityRole="image"
      accessibilityLabel="Hoshi"
    >
      <View style={styles.row}>
        <Text style={[styles.letter, { fontSize: letter, lineHeight: letter * 1.1 }]}>H</Text>
        <Star size={star} />
        <Text style={[styles.letter, { fontSize: letter, lineHeight: letter * 1.1 }]}>A</Text>
      </View>
    </View>
  );
}

/**
 * A four pointed star from two rotated squares.
 *
 * One square at 45 degrees gives the diamond; a second, narrower and unrotated,
 * pinches the waist so the diamond reads as a star rather than a lozenge.
 */
function Star({ size }: { size: number }) {
  return (
    <View style={[styles.star, { width: size, height: size }]}>
      <View
        style={[
          styles.starShape,
          {
            width: size,
            height: size,
            borderRadius: size * 0.28,
            transform: [{ rotate: '45deg' }],
          },
        ]}
      />
      <View
        style={[
          styles.starShape,
          {
            width: size * 0.52,
            height: size * 1.02,
            borderRadius: size * 0.26,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  letter: {
    color: color.textOnAccent,
    fontWeight: '700',
    letterSpacing: -0.5,
    // Optical centring: the cap height sits high in the line box.
    marginTop: -1,
  },
  star: { alignItems: 'center', justifyContent: 'center', marginHorizontal: 1 },
  starShape: {
    position: 'absolute',
    backgroundColor: color.textOnAccent,
  },
});
