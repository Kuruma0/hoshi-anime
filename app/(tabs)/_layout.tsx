import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { color, hairline } from '@/design/tokens';

/**
 * Bottom navigation.
 *
 * Feather is used because its icons are single weight line drawings with no
 * fill, which sits with the rest of the interface instead of adding the only
 * solid shapes on screen. Each tab keeps its label: an icon alone cannot
 * distinguish Anime from Manga, and the word does that work.
 *
 * The selected tab is purple; everything else is muted. That is the whole
 * state model.
 */

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const ICONS: Record<string, FeatherName> = {
  index: 'home',
  anime: 'play-circle',
  manga: 'book-open',
  search: 'search',
  library: 'bookmark',
};

const ICON_SIZE = 20;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.bar,
        tabBarActiveTintColor: color.accentBright,
        tabBarInactiveTintColor: color.textMuted,
        tabBarLabelStyle: styles.label,
        tabBarIconStyle: styles.icon,
        sceneStyle: { backgroundColor: color.bg },
        tabBarIcon: ({ color: tint }) => (
          <Feather name={ICONS[route.name] ?? 'circle'} size={ICON_SIZE} color={tint} />
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="anime" options={{ title: 'Anime' }} />
      <Tabs.Screen name="manga" options={{ title: 'Manga' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.bg,
    borderTopWidth: hairline,
    borderTopColor: color.line,
    elevation: 0,
    height: 64,
    paddingTop: 6,
    paddingBottom: 8,
  },
  icon: { marginBottom: 0 },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
