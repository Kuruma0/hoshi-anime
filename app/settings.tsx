import { ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SectionHeader } from '@/components/SectionHeader';
import { Text } from '@/design/Text';
import { color, gutter, hairline, sectionGap, space, touchTarget, type } from '@/design/tokens';
import { getAnimeProvider, getMangaProvider, getStreamProvider } from '@/providers/registry';
import { useSettings } from '@/lib/settings';

/**
 * Settings.
 *
 * Reading preferences and content filtering only. Playback source is handled
 * internally and is not a user-facing choice; reader mode and direction live in
 * the reader itself, where they are actually needed.
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const settings = useSettings();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.block}>
        <SectionHeader title="Reading" />

        <Field
          label="Chapter language"
          value={settings.chapterLanguage}
          onChange={settings.setChapterLanguage}
          placeholder="en"
        />

        <Toggle
          label="Data saver"
          detail="Load smaller, re-compressed manga pages."
          value={settings.dataSaver}
          onChange={settings.setDataSaver}
        />
        <Toggle
          label="Keep screen on while reading"
          value={settings.keepAwakeWhileReading}
          onChange={settings.setKeepAwakeWhileReading}
        />

        <Text variant="meta" tone="faint" style={styles.note}>
          Reading mode and direction are in the reader, under Display.
        </Text>
      </View>

      <View style={styles.block}>
        <SectionHeader title="Content" />
        <Toggle
          label="Show mature content"
          detail="Includes erotica and adult-rated titles in browsing and search."
          value={settings.contentRatings.includes('pornographic')}
          onChange={(enabled) =>
            settings.setContentRatings(
              enabled
                ? ['safe', 'suggestive', 'erotica', 'pornographic']
                : ['safe', 'suggestive']
            )
          }
        />
      </View>

      <View style={styles.block}>
        <SectionHeader title="Sources" />
        <Text variant="meta" tone="faint" style={styles.explainer}>
          {getAnimeProvider().attribution}.{'\n'}
          {getMangaProvider().attribution}.{'\n'}
          {getStreamProvider().attribution}.
        </Text>
      </View>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text variant="meta" tone="muted">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={color.textFaint}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        selectionColor={color.accentBright}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Toggle({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <View style={styles.toggleText}>
        <Text variant="body">{label}</Text>
        {detail ? (
          <Text variant="meta" tone="faint" style={styles.toggleDetail}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: color.line, true: color.accent }}
        thumbColor={color.text}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  block: { marginTop: sectionGap },
  explainer: { paddingHorizontal: gutter },
  note: { paddingHorizontal: gutter, marginTop: space.md },
  field: { paddingHorizontal: gutter, marginBottom: space.lg },
  input: {
    minHeight: touchTarget,
    color: color.text,
    fontSize: type.body.fontSize,
    backgroundColor: color.surface,
    borderBottomWidth: hairline,
    borderBottomColor: color.lineStrong,
    paddingHorizontal: space.md,
    marginTop: space.xs,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingVertical: space.md,
    borderTopWidth: hairline,
    borderTopColor: color.line,
    minHeight: touchTarget + 8,
  },
  toggleText: { flex: 1, marginRight: space.lg },
  toggleDetail: { marginTop: 2 },
});
