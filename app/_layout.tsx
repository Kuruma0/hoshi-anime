import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
// Theming comes from expo-router itself: as of SDK 56 expo-router no longer
// builds on react-navigation, and importing that package instead throws at
// bundle time.
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { persistOptions } from '@/data/persistence';
import { queryClient } from '@/data/queryClient';
import { color, type } from '@/design/tokens';
import { useSettings } from '@/lib/settings';

/**
 * Application shell.
 *
 * The player and reader are declared here, above the tab navigator, so they
 * present full-bleed with no tab bar — both are immersive surfaces where
 * persistent navigation chrome would compete with the content.
 */

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: color.bg,
    card: color.bg,
    text: color.text,
    border: color.line,
    primary: color.accentBright,
    notification: color.accentBright,
  },
};

export default function RootLayout() {
  useSystemReduceMotion();

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <ThemeProvider value={theme}>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: color.bg },
                headerTintColor: color.text,
                headerTitleStyle: {
                  fontSize: type.subtitle.fontSize,
                  fontWeight: type.subtitle.fontWeight,
                },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: color.bg },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="anime/[id]/index" options={{ headerTransparent: true, title: '' }} />
              <Stack.Screen
                name="anime/[id]/watch/[episode]"
                options={{ headerShown: false, animation: 'fade' }}
              />
              <Stack.Screen name="manga/[id]/index" options={{ headerTransparent: true, title: '' }} />
              <Stack.Screen
                name="manga/[id]/read/[chapter]"
                options={{ headerShown: false, animation: 'fade' }}
              />
              {/* Browse and schedule render their own persistent header. */}
              <Stack.Screen name="browse/[kind]/genre/[value]" options={{ headerShown: false }} />
              <Stack.Screen name="browse/[kind]/section/[value]" options={{ headerShown: false }} />
              <Stack.Screen name="schedule" options={{ headerShown: false }} />
              <Stack.Screen name="settings" options={{ title: 'Settings' }} />
            </Stack>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </View>
  );
}

/**
 * Mirror the OS reduce-motion preference into settings.
 *
 * Read once at startup and on change, so every animation in the app can consult
 * a single value rather than each component subscribing to the OS itself.
 */
function useSystemReduceMotion() {
  const setReduceMotion = useSettings((state) => state.setReduceMotion);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, [setReduceMotion]);
}
