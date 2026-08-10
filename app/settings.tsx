import { Alert, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SectionHeader } from '@/components/SectionHeader';
import {
  useAvailableStorage,
  useDeleteAllDownloads,
  useOfflineLibrary,
} from '@/data/offline';
import { Button } from '@/design/Button';
import { Text } from '@/design/Text';
import { color, gutter, hairline, sectionGap, space, touchTarget, type } from '@/design/tokens';
import { formatBytes } from '@/offline/types';
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

  const offline = useOfflineLibrary();
  const availableBytes = useAvailableStorage();
  const deleteAll = useDeleteAllDownloads();

  const downloadCount = offline.data?.count ?? 0;

  const confirmDeleteAll = () => {
    Alert.alert(
      'Delete all downloads?',
      `${downloadCount} chapter${downloadCount === 1 ? '' : 's'} will be removed from this device. Your saved list and reading progress are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteAll.mutate() },
      ]
    );
  };

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

      {/*
        Only downloads that actually exist are configurable here. There is no
        anime option because the video never reaches the app: playback runs
        inside the provider's embedded player, so a setting for it would promise
        something the app cannot do.
      */}
      <View style={styles.block}>
        <SectionHeader title="Offline" />

        <Toggle
          label="Download over Wi-Fi only"
          detail="Chapters run roughly a megabyte a page."
          value={settings.downloadOverWifiOnly}
          onChange={settings.setDownloadOverWifiOnly}
        />

        <View style={styles.storage}>
          <Text variant="body">
            {downloadCount} chapter{downloadCount === 1 ? '' : 's'} saved
          </Text>
          <Text variant="meta" tone="faint" style={styles.toggleDetail}>
            {formatBytes(offline.data?.bytes ?? 0)} used
            {availableBytes > 0 ? `, ${formatBytes(availableBytes)} free` : ''}
          </Text>
        </View>

        {downloadCount > 0 ? (
          <Button
            label={deleteAll.isPending ? 'Deleting…' : 'Delete all downloads'}
            variant="secondary"
            onPress={confirmDeleteAll}
            disabled={deleteAll.isPending}
            style={styles.destructive}
          />
        ) : null}

        <Text variant="meta" tone="faint" style={styles.note}>
          Anime cannot be saved for offline viewing. Playback runs inside the
          video provider's own player, so the app never receives the video file.
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
  storage: {
    paddingHorizontal: gutter,
    paddingVertical: space.md,
    borderTopWidth: hairline,
    borderTopColor: color.line,
  },
  destructive: { marginHorizontal: gutter, marginTop: space.sm },
});
