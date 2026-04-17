import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { EventsProvider } from '@/context/events-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthFrameworkProvider } from '@/lib/auth-framework';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

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
