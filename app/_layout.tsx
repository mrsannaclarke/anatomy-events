import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { RainbowSparkleBackground } from '@/components/ui/rainbow-sparkle-background';
import { EventsProvider } from '@/context/events-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthFrameworkProvider } from '@/lib/auth-framework';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const baseTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const appTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      background: 'transparent',
    },
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const host = String(window.location.hostname || '').toLowerCase();
    const parts = String(window.location.pathname || '/')
      .split('/')
      .filter(Boolean);
    const basePath = host.endsWith('github.io') && parts[0] ? `/${parts[0]}` : '';
    const iconHref = `${basePath || ''}/apple-touch-icon.png`;

    const ensureMeta = (name: string, content: string) => {
      let tag = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute('name', name);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    ensureMeta('apple-mobile-web-app-capable', 'yes');
    ensureMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    ensureMeta('apple-mobile-web-app-title', 'Anatomy Events');

    let touchIcon = document.head.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    if (!touchIcon) {
      touchIcon = document.createElement('link');
      touchIcon.setAttribute('rel', 'apple-touch-icon');
      touchIcon.setAttribute('sizes', '180x180');
      document.head.appendChild(touchIcon);
    }
    touchIcon.setAttribute('href', iconHref);
  }, []);

  return (
    <AuthFrameworkProvider>
      <EventsProvider>
        <ThemeProvider value={appTheme}>
          <View style={styles.appShell}>
            <RainbowSparkleBackground />
            <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'How It Works' }} />
            </Stack>
          </View>
          <StatusBar style="auto" />
        </ThemeProvider>
      </EventsProvider>
    </AuthFrameworkProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
  },
});
