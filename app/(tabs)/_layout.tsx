import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { color, hairline, type } from '@/design/tokens';

/**
 * Bottom navigation.
 *
 * Five text-only tabs. No icons: §21 warns against unnecessary iconography, and
 * "Anime" and "Manga" cannot be distinguished by a glyph anyway — a word is
 * both clearer and more accessible than an invented symbol.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: color.bg },
        headerTintColor: color.text,
        headerShadowVisible: false,
        headerTitleStyle: {
          fontSize: type.subtitle.fontSize,
          fontWeight: type.subtitle.fontWeight,
        },
        tabBarStyle: styles.bar,
        tabBarActiveTintColor: color.accentBright,
        tabBarInactiveTintColor: color.textMuted,
        tabBarLabelStyle: styles.label,
        // A zero-size element, not `null`: returning null makes the tab bar
        // fall back to a placeholder glyph rendered at 25px in the tint colour.
        // This bar is labels only, by design.
        tabBarIcon: () => <View style={styles.noIcon} />,
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoshi', headerShown: false }} />
      <Tabs.Screen name="anime" options={{ title: 'Anime', headerShown: false }} />
      <Tabs.Screen name="manga" options={{ title: 'Manga', headerShown: false }} />
      <Tabs.Screen name="search" options={{ title: 'Search', headerShown: false }} />
      <Tabs.Screen name="library" options={{ title: 'Library', headerShown: false }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.bg,
    borderTopWidth: hairline,
    borderTopColor: color.line,
    elevation: 0,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  noIcon: { width: 0, height: 0 },
});
