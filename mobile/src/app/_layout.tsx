import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AuthProvider } from '@/context/AuthContext';
// Registers the background location task at module scope — must be
// imported somewhere that always loads before the app renders.
import '@/location/backgroundTask';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="location-permission" />
        <Stack.Screen name="home" />
        <Stack.Screen name="arrived" options={{ presentation: 'modal' }} />
        <Stack.Screen name="history" options={{ headerShown: true, title: 'History' }} />
        <Stack.Screen name="profile" options={{ headerShown: true, title: 'Profile' }} />
      </Stack>
    </AuthProvider>
  );
}
