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
  const [fontsLoaded] = useFonts(MaterialIcons.font);
  const [bootDelayDone, setBootDelayDone] = useState(false);

  useEffect(() => {
    if (!fontsLoaded) {
      setBootDelayDone(false);
      return;
    }

    const timeout = setTimeout(() => setBootDelayDone(true), 900);
    return () => clearTimeout(timeout);
  }, [fontsLoaded]);

  if (!fontsLoaded || !bootDelayDone) {
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
