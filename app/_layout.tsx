import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { AppLoadingScreen } from '@/components/ui/app-loading-screen';
import { EventsProvider } from '@/context/events-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthFrameworkProvider } from '@/lib/auth-framework';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontLoadError] = useFonts(MaterialIcons.font);
  const [bootReady, setBootReady] = useState(false);

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

  useEffect(() => {
    const hardTimeout = setTimeout(() => setBootReady(true), 3200);
    return () => clearTimeout(hardTimeout);
  }, []);

  useEffect(() => {
    if (!fontsLoaded && !fontLoadError) return;
    const timeout = setTimeout(() => setBootReady(true), 850);
    return () => clearTimeout(timeout);
  }, [fontLoadError, fontsLoaded]);

  if (!bootReady) {
    return <AppLoadingScreen />;
  }

  return (
    <AuthFrameworkProvider>
      <EventsProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'How It Works' }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </EventsProvider>
    </AuthFrameworkProvider>
  );
}
