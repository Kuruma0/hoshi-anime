import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { color, gutter, hairline, space, touchTarget } from '@/design/tokens';
import type { ReaderMode, ReadingDirection } from '@/lib/settings';

export interface ReaderControlsProps {
  mode: ReaderMode;
  direction: ReadingDirection;
  onModeChange: (mode: ReaderMode) => void;
  onDirectionChange: (direction: ReadingDirection) => void;
}

/**
 * Reader controls (§29).
 *
 * Lives in the reader, not in global Settings; reading direction is a decision
 * you make about the title in front of you, and burying it two screens away
 * means nobody changes it.
 *
 * Two choices, nothing else. Options are plain rows with a purple marker on the
 * selected one; no switches, no cards, no settings dashboard.
 */
export function ReaderControls({
  mode,
  direction,
  onModeChange,
  onDirectionChange,
}: ReaderControlsProps) {
  return (
    <View style={styles.sheet}>
      <Group label="Reading mode">
        <Option
          label="Vertical"
          detail="Continuous scroll"
          selected={mode === 'vertical'}
          onPress={() => onModeChange('vertical')}
        />
        <Option
          label="Paged"
          detail="One page at a time"
          selected={mode === 'paged'}
          onPress={() => onModeChange('paged')}
        />
      </Group>

      <Group label="Reading direction">
        <Option
          label="Left to right"
          detail="Western order"
          selected={direction === 'ltr'}
          onPress={() => onDirectionChange('ltr')}
          disabled={mode === 'vertical'}
        />
        <Option
          label="Right to left"
          detail="Traditional manga order"
          selected={direction === 'rtl'}
          onPress={() => onDirectionChange('rtl')}
          disabled={mode === 'vertical'}
        />
      </Group>

      {mode === 'vertical' ? (
        <Text variant="meta" tone="faint" style={styles.note}>
          Direction applies to paged reading.
        </Text>
      ) : null}
    </View>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text variant="section" tone="muted" caps style={styles.groupLabel}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Option({
  label,
  detail,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      accessibilityHint={detail}
      style={({ pressed }) => [
        styles.option,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.marker, selected && styles.markerSelected]} />
      <View style={styles.optionText}>
        <Text variant="body" tone={selected ? 'default' : 'muted'}>
          {label}
        </Text>
        <Text variant="meta" tone="faint">
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: color.bg,
    borderTopWidth: hairline,
    borderTopColor: color.line,
    paddingBottom: space.md,
  },
  group: { paddingTop: space.lg },
  groupLabel: { paddingHorizontal: gutter, marginBottom: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget,
    paddingHorizontal: gutter,
    paddingVertical: space.sm,
  },
  pressed: { backgroundColor: color.surface },
  disabled: { opacity: 0.35 },
  // A 2px bar rather than a radio circle, same language as the selected tab.
  marker: { width: 2, height: 22, backgroundColor: 'transparent', marginRight: space.md },
  markerSelected: { backgroundColor: color.accentBright },
  optionText: { flex: 1 },
  note: { paddingHorizontal: gutter, paddingTop: space.sm },
});
